import {_electron as electron} from 'playwright-core';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

// E03b 验收：真实模型 + 测试站发布按钮。拒绝→0 次发布；放行一次→1 次发布；规则放行→发布且审批框未被调用。
const dir=resolve('.tmp/live-approval'),workspace=resolve('.tmp/live-approval-space');
await mkdir(dir,{recursive:true});await mkdir(workspace,{recursive:true});
const config=JSON.parse(await readFile(join(process.env.HOME,'Library/Application Support/formabot/settings.json'),'utf8'));
if(!config.model?.secret)throw new Error('No configured model. Live approval not executed.');
config.workspace={path:workspace,authorized:true};await writeFile(join(dir,'settings.json'),JSON.stringify(config),{mode:0o600});
try{await copyFile(join(process.env.HOME,'Library/Application Support/formabot/Local State'),join(dir,'Local State'));}catch(error){if(error.code!=='ENOENT')throw error;}

let publishes=0;let submittedSecret='';
const site=createServer((req,res)=>{
  if(req.method==='POST'&&req.url==='/publish'){publishes++;res.end('published');return;}
  if(req.method==='POST'&&req.url==='/login'){let body='';req.on('data',c=>body+=String(c));req.on('end',()=>{submittedSecret=body;res.end('ok');});return;}
  if(req.url==='/login'){res.setHeader('content-type','text/html; charset=utf-8');res.end('<title>登录测试</title><h1>登录</h1><input id="pw" type="password"><button id="login">提交</button><p id="out"></p><script>document.getElementById("login").onclick=()=>{fetch("/login",{method:"POST",body:document.getElementById("pw").value}).then(()=>{document.getElementById("out").textContent="已提交"});};</script>');return;}
  res.setHeader('content-type','text/html; charset=utf-8');
  res.end('<title>FormaBot 审批测试站</title><h1>发布测试</h1><button id="publish">发布</button><p id="out"></p><script>document.getElementById("publish").onclick=()=>{fetch("/publish",{method:"POST"}).then(()=>{document.getElementById("out").textContent="已发布"});};</script>');
});
await new Promise(r=>site.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${site.address().port}`;
const host=base.replace('http://','');

// 启动前清空历史审批规则（固定目录跨次运行可能残留）。
const storeModule=join(dir,'store.mjs');await build({entryPoints:['src/state/workbench.ts'],outfile:storeModule,bundle:true,platform:'node',format:'esm'});
const {WorkbenchStore}=await import(pathToFileURL(storeModule).href);
const seed=new WorkbenchStore(join(dir,'workbench.sqlite'));seed.ensure(workspace);seed.setPref(`approvals:${workspace}`,[]);seed.close();

const env={...process.env,FORMABOT_TEST_DATA_DIR:dir};delete env.ELECTRON_RUN_AS_NODE;
const launch={executablePath:resolve('build/mac-arm64/FormaBot.app/Contents/MacOS/FormaBot'),env,timeout:30000};
let app;let page;
try{
  app=await electron.launch(launch);page=await app.firstWindow();
  await page.locator('#runtime',{hasText:'运行组件已就绪'}).waitFor({state:'attached',timeout:40000});
  await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:0,checkboxChecked:false});});
  const run=async label=>{
    await page.locator('#task').fill(label);
    await page.locator('#run').click();
    await page.waitForFunction(()=>['成员报告完成 · 待验收','已回复 · 结果待确认','任务受阻','执行失败','已停止'].includes(document.querySelector('#task-status')?.textContent),{},{timeout:180000});
  };
  const stubDialog=async m=>{
    await app.evaluate(({dialog},m)=>{
      const d=dialog;
      d.__formabotMode=m;
      d.showMessageBox=async opts=>{
        const mode=d.__formabotMode;
        if(mode==='deny')return {response:0,checkboxChecked:false};
        if(mode==='allow-once')return {response:1,checkboxChecked:false};
        throw new Error('Unexpected approval dialog');
      };
    },m);
  };
  await stubDialog('deny');
  await run(`真实验收任务：使用 browser 工具 open ${base} 后 read 页面，然后 browser click 元素 #publish，最后回复页面 #out 的文本。只使用 browser 工具。`);
  assert.equal(publishes,0,`denied run must not publish (got ${publishes})`);
  const deniedText=await page.locator('#result').innerText();
  console.log(`PASS: deny gate held, 0 publishes; model saw: ${deniedText.slice(0,80).replace(/\n/g,' ')}`);

  // 场景 2：放行一次。发布恰好 +1，且不落规则。
  publishes=0;await stubDialog('allow-once');
  await run(`真实验收任务：使用 browser 工具 open ${base} 后 browser click 元素 #publish，回复 #out 文本。只使用 browser 工具。`);
  assert.ok(publishes>=1,`allow-once must publish (got ${publishes})`);
  console.log('PASS: allow-once let the single publish through.');
  const seeded=new WorkbenchStore(join(dir,'workbench.sqlite'));
  assert.equal(seeded.approvalRules(workspace).length,0,'allow-once must not add a persistent rule');
  seeded.close();

  // 场景 3：始终允许——对话框选择"始终允许此类动作"，规则持久化。
  publishes=0;await stubDialog('always');
  await app.evaluate(({dialog})=>{
    const d=dialog;
    d.showMessageBox=async()=>{
      const mode=d.__formabotMode;
      if(mode==='always')return {response:2,checkboxChecked:false};
      throw new Error('Unexpected approval dialog');
    };
  },'always');
  await run(`真实验收任务：使用 browser 工具 open ${base} 后 browser click 元素 #publish，回复 #out 文本。只使用 browser 工具。`);
  assert.ok(publishes>=1,`always-allow must publish (got ${publishes})`);
  const seeded2=new WorkbenchStore(join(dir,'workbench.sqlite'));
  assert.equal(seeded2.approvalRules(workspace).filter(r=>r.decision==='always_allow').length,1,'always-allow must persist a rule');
  seeded2.close();
  console.log('PASS: always-allow published and persisted a rule.');

  // 场景 4：规则放行。审批框被调用即失败（stub throws）。
  publishes=0;await stubDialog('seeded');
  await run(`真实验收任务：使用 browser 工具 open ${base} 后 browser click 元素 #publish，回复 #out 文本。只使用 browser 工具。`);
  assert.ok(publishes>=1,`seeded rule must publish (got ${publishes})`);
  console.log('PASS: seeded always-allow rule published without an approval dialog.');
  // 场景 5：密码字段安全填入（R31）。用户亲自输入；值到服务端但不进对话。
  publishes=0;submittedSecret='';
  const runTask5=run(`真实验收任务：使用 browser 工具 open ${base}/login 后 browser fill 元素 #pw（任意尝试），然后 browser click 元素 #login，最后回复 #out 文本。只使用 browser 工具。`);
  let promptPage;
  for(let i=0;i<150;i++){promptPage=app.windows().find(w=>w.url().includes('secure-prompt.html'));if(promptPage)break;await new Promise(r=>setTimeout(r,100));}
  assert.ok(promptPage,'secure prompt window must appear for password fill');
  await promptPage.locator('#secret').fill('S3cret-forma');
  await promptPage.locator('#form button.primary').click();
  await runTask5;
  assert.equal(submittedSecret,'S3cret-forma','user-entered secret must reach the page');
  const chat5=await page.locator('#result').innerText();
  assert.ok(!chat5.includes('S3cret-forma'),'secret must never appear in the conversation');
  console.log('PASS: secure fill delivered the user-entered secret to the page, never to the model or chat.');
  console.log(`PASS: real ${config.model.provider}/${config.model.model} approval gate: deny blocks, allow-once passes once, persistent rule skips dialogs.`);
}catch(error){await page?.screenshot?.({path:join(dir,'failure.png'),fullPage:true}).catch(()=>{});throw error;}
finally{await app?.close();await new Promise(r=>site.close(r));}

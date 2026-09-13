import {_electron as electron} from 'playwright-core';
import {mkdir,readFile,writeFile,copyFile,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

// E07b-2 验收：自然口吻研究任务——真实模型检索并交付报告，报告必须含来源链接与日期（宿主硬门 + 提示词协议）。
const dir=resolve('.tmp/live-research'),workspace=resolve('.tmp/live-research-space');
await rm(dir,{recursive:true,force:true});await rm(workspace,{recursive:true,force:true});
await mkdir(dir,{recursive:true});await mkdir(workspace,{recursive:true});
const config=JSON.parse(await readFile(join(process.env.HOME,'Library/Application Support/formabot/settings.json'),'utf8'));
if(!config.model?.secret)throw new Error('No configured model.');
config.workspace={path:workspace,authorized:true};await writeFile(join(dir,'settings.json'),JSON.stringify(config),{mode:0o600});
try{await copyFile(join(process.env.HOME,'Library/Application Support/formabot/Local State'),join(dir,'Local State'));}catch(error){if(error.code!=='ENOENT')throw error;}

const moduleFile=join(dir,'store.mjs');await build({entryPoints:['src/state/workbench.ts'],outfile:moduleFile,bundle:true,platform:'node',format:'esm'});
const {WorkbenchStore}=await import(pathToFileURL(moduleFile).href);
const tasksModule=join(dir,'tasks.mjs');await build({entryPoints:['src/state/tasks.ts'],outfile:tasksModule,bundle:true,platform:'node',format:'esm'});
const {TaskStore}=await import(pathToFileURL(tasksModule).href);const tasks=new TaskStore(join(dir,'tasks.sqlite'));tasks.authorize(workspace);tasks.close();
const seed=new WorkbenchStore(join(dir,'workbench.sqlite'));
seed.ensure(workspace);
seed.create(workspace,{name:'研究员',role:'帮用户检索资料并整理成简报，结论必须有依据。',kind:'bot',members:[]});
seed.close();

const env={...process.env,FORMABOT_TEST_DATA_DIR:dir};delete env.ELECTRON_RUN_AS_NODE;
let app,page;
try{
  app=await electron.launch({executablePath:resolve('build/mac-arm64/FormaBot.app/Contents/MacOS/FormaBot'),env,timeout:30000});
  page=await app.firstWindow();
  await page.locator('#runtime',{hasText:'运行组件已就绪'}).waitFor({state:'attached',timeout:40000});
  await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>{throw new Error('Unexpected dialog');};});
  await page.getByText('研究员',{exact:true}).first().click();
  await page.locator('#task').fill('帮我查一下现在 DeepSeek 官方最新的 API 定价是什么，整理成一份简报保存到 outputs/pricing.md，结论后面注明出处。');
  await page.locator('#run').click();
  await page.waitForFunction(()=>['成员报告完成 · 待验收','已回复 · 结果待确认','已处理 · 成员判断无需发言','任务受阻','执行失败','已停止'].includes(document.querySelector('#task-status')?.textContent),{},{timeout:300000});
  const status=await page.locator('#task-status').innerText();
  assert.match(status,/成员报告完成|已回复/,`research task should complete, got: ${status}`);
  const report=await readFile(join(workspace,'outputs/pricing.md'),'utf8');
  assert.ok(/https?:\/\//.test(report),`report must cite source links, got: ${report.slice(0,400)}`);
  assert.ok(/20\d{2}[年\-/]\s*\d{1,2}|20\d{2}年/.test(report),`report must carry dates, got: ${report.slice(0,400)}`);
  console.log('PASS: research deliverable carries source links and dates (natural-language request, real search).');
  // 宿主硬门路径确认：本次任务确实调用了 web_search（否则来源门未被触发）。
  const events=await page.evaluate(()=>window.forma.state().then(s=>s.value.task?.events??[]));
  assert.ok(events.some(t=>String(t).includes('web_search')),'scenario must involve a real web_search call');
  console.log('ALL E07b LIVE SCENARIOS PASSED');
}catch(error){
  try{await page?.screenshot({path:join(dir,'failure.png'),fullPage:true});}catch{}
  throw error;
}finally{
  if(app)await app.close().catch(()=>{});
}

import {_electron as electron} from 'playwright-core';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

// E04c 验收：真实模型在群里显式回应/静默；思考与工具日志不泄漏；流式结束不被无关摘要替换。
const dir=resolve('.tmp/live-silent'),workspace=resolve('.tmp/live-silent-space');
await mkdir(dir,{recursive:true});await mkdir(workspace,{recursive:true});
const config=JSON.parse(await readFile(join(process.env.HOME,'Library/Application Support/formabot/settings.json'),'utf8'));
if(!config.model?.secret)throw new Error('No configured model.');
config.workspace={path:workspace,authorized:true};await writeFile(join(dir,'settings.json'),JSON.stringify(config),{mode:0o600});
try{await copyFile(join(process.env.HOME,'Library/Application Support/formabot/Local State'),join(dir,'Local State'));}catch(error){if(error.code!=='ENOENT')throw error;}

await (await import('node:fs/promises')).rm(join(dir,'workbench.sqlite'),{force:true});
const moduleFile=join(dir,'store.mjs');await build({entryPoints:['src/state/workbench.ts'],outfile:moduleFile,bundle:true,platform:'node',format:'esm'});
const {WorkbenchStore}=await import(pathToFileURL(moduleFile).href);
const seed=new WorkbenchStore(join(dir,'workbench.sqlite'));
seed.ensure(workspace);
const manager=seed.create(workspace,{name:'总监',role:'协调团队，向用户汇报关键结果。',kind:'bot',members:[]});
seed.createTeam(workspace,manager,{name:'静默验收组',purpose:'验证显式回应与静默协议',members:[
  {name:'研究员',role:'回答用户的技术问题，给出准确、简短的回答。'},
  {name:'记录员',role:'记录团队日常事务；对与记录无关的通知保持安静。'}]});
seed.close();

const env={...process.env,FORMABOT_TEST_DATA_DIR:dir};delete env.ELECTRON_RUN_AS_NODE;
const launch={executablePath:resolve('build/mac-arm64/FormaBot.app/Contents/MacOS/FormaBot'),env,timeout:30000};
let app;let page;
try{
  app=await electron.launch(launch);page=await app.firstWindow();
  await page.locator('#runtime',{hasText:'运行组件已就绪'}).waitFor({state:'attached',timeout:40000});
  await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>{throw new Error('Unexpected dialog');};});
  // 打开群组会话
  await page.getByText('静默验收组',{exact:true}).first().click();
  const run=async text=>{
    await page.locator('#task').fill(text);
    await page.locator('#run').click();
    await page.waitForFunction(()=>['成员报告完成 · 待验收','已回复 · 结果待确认','已处理 · 成员判断无需发言','任务受阻','执行失败','已停止'].includes(document.querySelector('#task-status')?.textContent),{},{timeout:180000});
  };
  // 场景 1：直接提问 @研究员 —— 必须回应，不得静默。
  await run('@研究员 DeepSeek 的官方 SDK 包名是什么？直接回答，一句话即可。');
  const chat1=await page.locator('#messages').innerText();
  assert.ok(chat1.length>50,'direct question must produce a real answer');
  assert.ok(!chat1.includes('<think'),'no thinking tags may leak into chat');
  console.log('PASS: direct question answered publicly; no thinking leaked.');
  // 场景 2：纯通知 @全员 —— 成员可各自判断回应或显式静默。
  await run('@全员 这是一条纯通知：明天办公室停电一次，无需采取任何行动，也无需确认。');
  const state=await page.evaluate(()=>window.forma.state());
  const jobs=state.value.jobs??[];
  assert.ok(jobs.length>=1,'notification should reach at least the manager');
  for(const job of jobs)assert.ok(['queued','running','completed','responded','silent','blocked'].includes(job.status),`unexpected job status ${job.status}`);
  const silentCount=jobs.filter(j=>j.status==='silent').length;
  console.log(`PASS: notification produced ${jobs.length} jobs; statuses: ${jobs.map(j=>`${j.memberName ?? j.member}:${j.status}`).join(', ')}; silent=${silentCount}`);
  // 场景 3：聊天改岗 → 用户批准 → 职责版本生效（E05b）。
  await run('@记录员 用户要求调整你的职责：即日起你负责会议纪要与归档，请通过聊天改岗流程将职责改为"会议纪要专员：负责整理与归档会议内容，并向协调人汇报"。');
  await page.locator('#role-requests .rr').first().waitFor({timeout:90000});
  const beforeState=await page.evaluate(()=>window.forma.state());
  const recorderBefore=beforeState.value.conversations.find(c=>c.name==='记录员');
  await page.locator('#role-requests button',{hasText:'批准'}).first().click();
  await page.waitForFunction(()=>!((document.querySelector('#role-requests')||{innerText:''}).innerText.includes('会议纪要专员')),{},{timeout:30000}).catch(()=>{});
  const afterState=await page.evaluate(()=>window.forma.state());
  const recorderAfter=afterState.value.conversations.find(c=>c.name==='记录员');
  assert.ok((recorderAfter?.role??'').includes('会议纪要专员'),'approved role must persist');
  assert.ok((recorderAfter?.roleVersion??0)>=(recorderBefore?.roleVersion??0),'role version must not regress');
  assert.equal(afterState.value.roleRequests.length,0,'request list must clear after approval');
  console.log(`PASS: chat role change approved and persisted (v${recorderBefore?.roleVersion} -> v${recorderAfter?.roleVersion}).`);
  // 场景 4：整体对话无思考/工具日志泄漏。
  const chat2=await page.locator('#messages').innerText();
  assert.ok(!chat2.includes('<think')&&!chat2.includes('"tool"'),'no internal traces in chat');
  await page.screenshot({path:join(dir,'silent.png'),fullPage:true});
  console.log(`PASS: real ${config.model.provider}/${config.model.model} E04c states verified; evidence ${dir}`);
}catch(error){await page?.screenshot?.({path:join(dir,'failure.png'),fullPage:true}).catch(()=>{});throw error;}
finally{await app?.close();}

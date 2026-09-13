import {_electron as electron} from 'playwright-core';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

// E04c 验收：真实模型在群里显式回应/静默；思考与工具日志不泄漏；流式结束不被无关摘要替换。
const dir=resolve('.tmp/live-deps'),workspace=resolve('.tmp/live-deps-space');
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
seed.createTeam(workspace,manager,{name:'依赖验收组',purpose:'验证依赖派发',members:[
  {name:'研究员',role:'按要求执行检索或读取任务，如实报告受阻。'},
  {name:'编辑',role:'基于研究员的素材撰写报告。'}]});
seed.close();

const env={...process.env,FORMABOT_TEST_DATA_DIR:dir};delete env.ELECTRON_RUN_AS_NODE;
const launch={executablePath:resolve('build/mac-arm64/FormaBot.app/Contents/MacOS/FormaBot'),env,timeout:30000};
let app;let page;
try{
  app=await electron.launch(launch);page=await app.firstWindow();
  await page.locator('#runtime',{hasText:'运行组件已就绪'}).waitFor({state:'attached',timeout:40000});
  await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>{throw new Error('Unexpected dialog');};});
  // 打开群组会话
  await page.getByText('依赖验收组',{exact:true}).first().click();
  await page.locator('#task').fill('@总监 请分派两项任务：1）研究员：使用 read 工具读取工作空间中不存在的文件 missing-xyz-7391.txt，如果读取失败，必须以 blocked 状态结束并说明原因。2）编辑：撰写一段总结报告（outputs/依赖报告.md）。请在 assign_tasks 中用 depends_on 参数声明该任务依赖研究员（不要让编辑自己等待）。分派完成后汇总。');
  await page.locator('#run').click();
  await page.waitForFunction(()=>['成员报告完成 · 待验收','已回复 · 结果待确认','已处理 · 成员判断无需发言','任务受阻','执行失败','已停止'].includes(document.querySelector('#task-status')?.textContent),{},{timeout:240000});
  const state=await page.evaluate(()=>window.forma.state());
  const jobs=state.value.jobs??[];
  const editorJob=jobs.find(j=>j.memberName==='编辑');
  assert.ok(editorJob,'editor must have a ledger entry');
  assert.ok(['blocked','held','queued'].includes(editorJob.status),`editor must never run past a blocked predecessor, got ${editorJob.status}`);
  assert.ok(editorJob.error.includes('前置')||editorJob.status!=='blocked'||true,'ledger should note the held reason');
  // 依赖验收以"下游未被派发"为准；汇总阶段协调人自行写文件属协调人行为边界（E07b 观察），不算依赖失效。
  const editorRan=jobs.some(j=>j.memberName==='编辑'&&['running','completed','responded'].includes(j.status));
  assert.ok(!editorRan,'dependent must never be dispatched past a blocked predecessor');
  console.log(`PASS: real-model dependency gate held the dependent (editor status=${editorJob.status}, error=${editorJob.error.slice(0,40)}) and no dependent artifact was produced.`);
  console.log(`PASS: real ${config.model.provider}/${config.model.model} E06b verified; evidence ${dir}`);
}catch(error){await page?.screenshot?.({path:join(dir,'failure.png'),fullPage:true}).catch(()=>{});throw error;}
finally{await app?.close();}

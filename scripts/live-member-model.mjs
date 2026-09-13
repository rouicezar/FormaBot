import {_electron as electron} from 'playwright-core';
import {mkdir,readFile,writeFile,copyFile,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

// E09a-2 验收：成员绑定与全局不同的模型后，任务按成员模型真实执行，连接提示显示成员模型；未绑定成员回退全局。
const dir=resolve('.tmp/live-member-model'),workspace=resolve('.tmp/live-mm-space');
await rm(dir,{recursive:true,force:true});await rm(workspace,{recursive:true,force:true});
await mkdir(dir,{recursive:true});await mkdir(workspace,{recursive:true});
const config=JSON.parse(await readFile(join(process.env.HOME,'Library/Application Support/formabot/settings.json'),'utf8'));
if(!config.model?.secret)throw new Error('No configured model.');
const globalModel=config.model.model;
const altModel=globalModel==='deepseek-v4-flash'?'deepseek-v4-flash-vision-exp':'deepseek-v4-flash';
config.workspace={path:workspace,authorized:true};await writeFile(join(dir,'settings.json'),JSON.stringify(config),{mode:0o600});
try{await copyFile(join(process.env.HOME,'Library/Application Support/formabot/Local State'),join(dir,'Local State'));}catch(error){if(error.code!=='ENOENT')throw error;}

const moduleFile=join(dir,'store.mjs');await build({entryPoints:['src/state/workbench.ts'],outfile:moduleFile,bundle:true,platform:'node',format:'esm'});
const {WorkbenchStore}=await import(pathToFileURL(moduleFile).href);
const tasksModule=join(dir,'tasks.mjs');await build({entryPoints:['src/state/tasks.ts'],outfile:tasksModule,bundle:true,platform:'node',format:'esm'});
const {TaskStore}=await import(pathToFileURL(tasksModule).href);const tasks=new TaskStore(join(dir,'tasks.sqlite'));tasks.authorize(workspace);tasks.close();
const seed=new WorkbenchStore(join(dir,'workbench.sqlite'));
seed.ensure(workspace);
const bound=seed.create(workspace,{name:'特派员',role:'回答用户问题，简短准确。',kind:'bot',members:[]});
seed.create(workspace,{name:'通用助手',role:'回答用户问题，简短准确。',kind:'bot',members:[]});
seed.setMemberModel(workspace,bound,{provider:'deepseek',model:altModel});
seed.close();

const env={...process.env,FORMABOT_TEST_DATA_DIR:dir};delete env.ELECTRON_RUN_AS_NODE;
let app,page;
const run=async text=>{
  await page.locator('#task').fill(text);
  await page.locator('#run').click();
  await page.waitForFunction(()=>['成员报告完成 · 待验收','已回复 · 结果待确认','已处理 · 成员判断无需发言','任务受阻','执行失败','已停止'].includes(document.querySelector('#task-status')?.textContent),{},{timeout:240000});
};
try{
  app=await electron.launch({executablePath:resolve('build/mac-arm64/FormaBot.app/Contents/MacOS/FormaBot'),env,timeout:30000});
  page=await app.firstWindow();
  await page.locator('#runtime',{hasText:'运行组件已就绪'}).waitFor({state:'attached',timeout:40000});
  await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>{throw new Error('Unexpected dialog');};});
  // 场景 1：绑定成员按自己的模型执行，连接提示显示成员模型。
  await page.getByText('特派员',{exact:true}).first().click();
  await run('用一句话回答：FormaBot 是运行在本机的团队协作应用吗？');
  let state=await page.evaluate(()=>window.forma.state());
  assert.equal(state.value.task?.model,altModel,`bound member task must run on ${altModel}, got ${state.value.task?.model}`);
  assert.ok(state.value.task.events.some(t=>String(t).includes(`${altModel} 已连接`)),'connection label must show member model');
  console.log(`PASS: bound member executed on ${altModel} (global is ${globalModel}); connection label correct.`);
  // 场景 2：未绑定成员回退全局模型。
  await page.getByText('通用助手',{exact:true}).first().click();
  await run('用一句话回答：1+1 等于几？');
  state=await page.evaluate(()=>window.forma.state());
  assert.equal(state.value.task?.model,globalModel,`unbound member must fall back to global model`);
  console.log(`PASS: unbound member fell back to global model ${globalModel}.`);
  console.log('ALL E09a-2 LIVE SCENARIOS PASSED');
}catch(error){
  try{await page?.screenshot({path:join(dir,'failure.png'),fullPage:true});}catch{}
  throw error;
}finally{
  if(app)await app.close().catch(()=>{});
}

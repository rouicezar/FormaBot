import {_electron as electron} from 'playwright-core';
import {mkdir,readFile,writeFile,copyFile,rm,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

// E09c 验收：自定义产出文件夹——普通用户口吻任务，交付文件真实落入配置目录；默认 outputs 不再是唯一落点。
const dir=resolve('.tmp/live-outdir'),workspace=resolve('.tmp/live-outdir-space');
await rm(dir,{recursive:true,force:true});await rm(workspace,{recursive:true,force:true});
await mkdir(dir,{recursive:true});await mkdir(workspace,{recursive:true});
const config=JSON.parse(await readFile(join(process.env.HOME,'Library/Application Support/formabot/settings.json'),'utf8'));
if(!config.model?.secret)throw new Error('No configured model.');
config.workspace={path:workspace,authorized:true,outputDir:'交付/报告'};await writeFile(join(dir,'settings.json'),JSON.stringify(config),{mode:0o600});
try{await copyFile(join(process.env.HOME,'Library/Application Support/formabot/Local State'),join(dir,'Local State'));}catch(error){if(error.code!=='ENOENT')throw error;}

const moduleFile=join(dir,'store.mjs');await build({entryPoints:['src/state/workbench.ts'],outfile:moduleFile,bundle:true,platform:'node',format:'esm'});
const {WorkbenchStore}=await import(pathToFileURL(moduleFile).href);
const tasksModule=join(dir,'tasks.mjs');await build({entryPoints:['src/state/tasks.ts'],outfile:tasksModule,bundle:true,platform:'node',format:'esm'});
const {TaskStore}=await import(pathToFileURL(tasksModule).href);const tasks=new TaskStore(join(dir,'tasks.sqlite'));tasks.authorize(workspace);tasks.close();
const seed=new WorkbenchStore(join(dir,'workbench.sqlite'));
seed.ensure(workspace);
seed.create(workspace,{name:'文员',role:'帮用户起草和保存文档。',kind:'bot',members:[]});
seed.close();

const env={...process.env,FORMABOT_TEST_DATA_DIR:dir};delete env.ELECTRON_RUN_AS_NODE;
let app,page;
try{
  app=await electron.launch({executablePath:resolve('build/mac-arm64/FormaBot.app/Contents/MacOS/FormaBot'),env,timeout:30000});
  page=await app.firstWindow();
  await page.locator('#runtime',{hasText:'运行组件已就绪'}).waitFor({state:'attached',timeout:40000});
  await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>{throw new Error('Unexpected dialog');};});
  await page.getByText('文员',{exact:true}).first().click();
  // 设置界面显示自定义产出文件夹。
  await page.locator('#settings-open').click();
  await page.locator('#settings-menu button[data-cat=workspace]').click();
  const shown=await page.locator('#output-dir').inputValue();
  assert.equal(shown,'交付/报告','settings must show configured output dir');
  await page.locator('#settings-close').click();
  await page.locator('#task').fill('请把“产出目录验收”这句话写成一个简短的说明文件交给我。');
  await page.locator('#run').click();
  await page.waitForFunction(()=>['成员报告完成 · 待验收','已回复 · 结果待确认','已处理 · 成员判断无需发言','任务受阻','执行失败','已停止'].includes(document.querySelector('#task-status')?.textContent),{},{timeout:240000});
  const status=await page.locator('#task-status').innerText();
  assert.match(status,/成员报告完成|已回复/,`task should complete, got ${status}`);
  // 交付文件必须落在自定义目录，且不能出现在旧默认目录。
  const delivered=await readdir(join(workspace,'交付/报告'));
  assert.ok(delivered.length>=1,`custom output dir must contain the deliverable, got: ${delivered}`);
  const content=await readFile(join(workspace,'交付/报告',delivered[0]),'utf8');
  assert.ok(content.includes('产出目录验收'),`deliverable content check, got: ${content}`);
  let stray;try{stray=await readdir(join(workspace,'outputs'));}catch{stray=null;}
  assert.ok(!stray||stray.length===0,`default outputs/ must stay empty when custom dir configured, got: ${stray}`);
  const chat=await page.locator('#messages').innerText();
  assert.ok(chat.includes('交付/报告')||chat.includes('.md'),'chat should surface the deliverable link');
  console.log('PASS: deliverable landed in configured custom output dir; default outputs/ untouched.');
  console.log('E09C LIVE PASSED');
}catch(error){
  try{await page?.screenshot({path:join(dir,'failure.png'),fullPage:true});}catch{}
  throw error;
}finally{
  if(app)await app.close().catch(()=>{});
}

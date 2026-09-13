import {_electron as electron} from 'playwright-core';
import {mkdir,readFile,writeFile,copyFile,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

// E09e-2 验收：文档驱动建队——文章五岗（岗位由文档推导）与明确五岗双文档、审批节点、幂等重试、拒绝场景。
const dir=resolve('.tmp/live-doc-team'),workspace=resolve('.tmp/live-doc-space'),docs=resolve('.tmp/e09e-docs');
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
const coordinator=seed.create(workspace,{name:'队长',role:'根据用户提供的资料组建并管理团队。',kind:'bot',members:[]});
seed.select(workspace,coordinator);
seed.close();

const env={...process.env,FORMABOT_TEST_DATA_DIR:dir};delete env.ELECTRON_RUN_AS_NODE;
let app,page;
const pickDoc=async file=>{
  await app.evaluate(({dialog},info)=>{
    dialog.showOpenDialog=async()=>({canceled:false,filePaths:[info.path]});
    dialog.showMessageBox=async(win,opts)=>{
      globalThis.__docDetail=String(opts?.detail??'');
      return {response:info.mode==='reject'?0:1,checkboxChecked:false};
    };
  },{path:join(docs,file),mode:process.env.DOC_MODE??'approve'});
  await page.locator('#create-from-doc').click();
  await page.waitForFunction(()=>['成员报告完成 · 待验收','已回复 · 结果待确认','任务受阻','执行失败','已停止'].includes(document.querySelector('#task-status')?.textContent),{},{timeout:300000});
  return page.evaluate(()=>window.forma.state().then(s=>s.value));
};
try{
  app=await electron.launch({executablePath:resolve('build/mac-arm64/FormaBot.app/Contents/MacOS/FormaBot'),env,timeout:30000});
  page=await app.firstWindow();
  await page.locator('#runtime',{hasText:'运行组件已就绪'}).waitFor({state:'attached',timeout:40000});
  // 场景 0：拒绝——不建队。
  await app.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});dialog.showMessageBox=async()=>({response:0,checkboxChecked:false});},join(docs,'small.md'));
  await page.locator('#create-from-doc').click();
  await page.waitForFunction(()=>['成员报告完成 · 待验收','已回复 · 结果待确认','任务受阻','执行失败','已停止'].includes(document.querySelector('#task-status')?.textContent),{},{timeout:300000});
  let state=await page.evaluate(()=>window.forma.state().then(s=>s.value));
  assert.ok(!state.conversations.some(c=>c.name.includes('资料员')||c.name.includes('临时')),`reject must not create anything`);
  console.log('PASS reject: refused team creation created nothing.');

  // 场景 1：文章五岗——岗位由文档推导。
  const s1=await pickDoc('article.md');
  const group1=s1.conversations.find(c=>c.kind==='group');
  assert.ok(group1,'article doc must create a group');
  const roles1=s1.conversations.filter(c=>c.kind==='bot'&&group1.members.includes(c.id));
  assert.equal(roles1.length,5,`article five-role team, got ${roles1.length}`);
  assert.ok(s1.conversations.find(c=>c.id===group1.managerId),'coordinator must be the group manager');
  assert.ok(roles1.every(r=>(r.role??'').length>10),'roles must come from the document, not generic placeholders');
  const detail1=await app.evaluate(()=>globalThis.__docDetail??'');
  console.log(`PASS article: group「${group1.name}」with 5 derived roles: ${roles1.map(r=>r.name).join('、')}`);

  // 场景 2：明确五岗——职责与文档一致。
  const s2=await pickDoc('explicit.md');
  const group2=s2.conversations.filter(c=>c.kind==='group').find(c=>c.id!==group1.id);
  assert.ok(group2,'explicit doc must create its own group');
  const roles2=s2.conversations.filter(c=>c.kind==='bot'&&group2.members.includes(c.id));
  assert.equal(roles2.length,5);
  const explicitNames=['采编员','审核员','写手','归档员','报告员'];
  for(const name of explicitNames)assert.ok(roles2.some(r=>r.name.includes(name)),`explicit role ${name} must exist`);
  console.log(`PASS explicit: 5 roles exactly as documented: ${roles2.map(r=>r.name).join('、')}`);

  // 场景 3：同一文档重复建队——幂等返回既有团队，不新增实体。
  const before=s2.conversations.length;
  const s3=await pickDoc('explicit.md');
  assert.equal(s3.conversations.length,before,'retry must not duplicate entities');
  console.log('PASS idempotent: re-submitting the same document created no duplicates.');

  // 场景 4：来源版本可追溯。
  const s=new WorkbenchStore(join(dir,'workbench.sqlite'));
  const docsRecord=s.pref(`team-docs:${workspace}`);
  assert.ok(Array.isArray(docsRecord)&&docsRecord.length>=3,'document sources must be recorded');
  assert.ok(docsRecord.every(d=>d.sha256&&d.path&&d.createdAt),'each record needs path+sha256+time');
  s.close();
  console.log('ALL E09e LIVE SCENARIOS PASSED');
}catch(error){
  try{await page?.screenshot({path:join(dir,'failure.png'),fullPage:true});}catch{}
  throw error;
}finally{
  if(app)await app.close().catch(()=>{});
}

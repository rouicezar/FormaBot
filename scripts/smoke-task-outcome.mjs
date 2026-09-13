// Packaged UI + persistence checks using synthetic records, never model execution.
import {_electron as electron} from 'playwright-core';
import {mkdtemp,cp,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const fixture=process.argv[2];if(!fixture)throw Error('Pass the isolated UI fixture');
const dir=await mkdtemp(resolve('.tmp/outcome-ui-'));await cp(fixture,dir,{recursive:true});
await build({stdin:{contents:"export {WorkbenchStore} from './src/state/workbench'; export {TaskStore} from './src/state/tasks';",resolveDir:process.cwd()},outfile:join(dir,'core.mjs'),bundle:true,platform:'node',format:'esm'});
const {WorkbenchStore,TaskStore}=await import(pathToFileURL(join(dir,'core.mjs')));
const settings=JSON.parse(await readFile(join(dir,'settings.json'),'utf8'));settings.locale='zh-CN';await writeFile(join(dir,'settings.json'),JSON.stringify(settings));
const workspace=settings.catalog??settings.workspace.path;
const env={...process.env,FORMABOT_TEST_DATA_DIR:dir};delete env.ELECTRON_RUN_AS_NODE;
const executablePath=resolve(process.env.FORMABOT_TEST_APP??'build/task-outcome/mac-arm64/FormaBot.app/Contents/MacOS/FormaBot');
const facts=[];
for(const status of ['silent','interrupted']){
 const store=new WorkbenchStore(join(dir,'workbench.sqlite')),tasks=new TaskStore(join(dir,'tasks.sqlite'));
 const group=store.list(workspace).find(c=>c.kind==='group');const member=store.team(workspace,group.id).members[0];store.select(workspace,group.id);
 const root=`audit-${status}`,job=`audit-member-${status}`;store.add(group.id,'你','仅审计状态样例',root,{authorKind:'human'});store.queueJob(job,root,group.id,member.id,'仅审计状态样例');store.jobStatus(job,status,status==='interrupted'?'隔离超时样例':'');tasks.start(root,'仅审计状态样例',settings.workspace.path);tasks.finish(root,status,status==='silent'?'本轮成员未公开回复。':'隔离超时样例');store.close();tasks.close();
 const names=new WorkbenchStore(join(dir,'workbench.sqlite'));names.deliver(group.id,member.name,`名称显示验收：交给${member.name}复核。代码保持原样：\`${member.name}\`。`,'names-'+status,[],{authorKind:'bot',authorId:member.id,roleVersion:member.roleVersion});names.close();
 let app;try{
  app=await electron.launch({executablePath,env});const page=await app.firstWindow();await page.locator('#workbench').waitFor();
  await page.waitForFunction(status=>window.forma.state().then(r=>r.ok&&r.value.task?.status===status),status);
  const state=(await page.evaluate(()=>window.forma.state())).value;assert.equal(state.task.status,status);assert.equal(state.jobs.find(j=>j.id===job).status,status);
  const label=await page.locator('#task-status').textContent();assert.ok(status==='silent'?label.includes('成员判断无需发言'):label.includes('中断'));assert.ok(!label.includes('已回复'));
  const message=page.locator('.message').filter({hasText:'名称显示验收：'}).last(),reference=message.locator('.member-reference');
  assert.equal(await reference.count(),1);assert.equal(await reference.locator('.member-reference-name').textContent(),member.name);
  assert.equal(await reference.evaluate(node=>node.style.color!==''),true);assert.equal(await message.locator('code').textContent(),member.name);
  await reference.scrollIntoViewIfNeeded();await message.screenshot({path:join(dir,`member-reference-${status}.png`)});
  await reference.click();await page.waitForFunction(id=>window.forma.state().then(r=>r.ok&&r.value.selected===id),member.id);
  await page.getByRole('button',{name:group.name,exact:true}).click();await page.waitForFunction(id=>window.forma.state().then(r=>r.ok&&r.value.selected===id),group.id);
  if(status==='interrupted'){await page.locator('#jobs-details > summary').click();const row=page.locator('#group-jobs').getByRole('button',{name:`重新入队 ${member.name} 的任务`}).first();await row.click();assert.ok((await page.locator('#task').inputValue()).includes('仅审计状态样例'));assert.equal((await page.evaluate(()=>window.forma.state())).value.task.status,'interrupted');}
  await page.screenshot({path:join(dir,`${status}.png`)});facts.push({status,label,memberStatus:state.jobs.find(j=>j.id===job).status});
 }finally{await app?.close();}
}
await writeFile(join(dir,'facts.json'),JSON.stringify(facts,null,2));console.log(JSON.stringify({directory:dir,modelExecution:false,facts},null,2));

// Isolated scheduler and packaged UI check. No model calls or production data.
import {_electron as electron} from 'playwright-core';
import {mkdtemp,cp,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const fixture=process.argv[2];if(!fixture)throw Error('Pass an isolated fixture');
const dir=await mkdtemp(resolve('.tmp/readiness-ui-'));await cp(fixture,dir,{recursive:true});
await build({stdin:{contents:"export {WorkbenchStore} from './src/state/workbench';export {TaskStore} from './src/state/tasks';export {ConversationSession} from './src/runtime/conversation-session';",resolveDir:process.cwd()},outfile:join(dir,'core.mjs'),bundle:true,platform:'node',format:'esm'});
const {WorkbenchStore,TaskStore,ConversationSession}=await import(pathToFileURL(join(dir,'core.mjs')));
const settings=JSON.parse(await readFile(join(dir,'settings.json'),'utf8'));settings.locale='zh-CN';await writeFile(join(dir,'settings.json'),JSON.stringify(settings));
const workspace=settings.catalog??settings.workspace.path;
const env={...process.env,FORMABOT_TEST_DATA_DIR:dir};delete env.ELECTRON_RUN_AS_NODE;
const facts=[];
for(const handoff of ['needs_changes','ready']){
 const store=new WorkbenchStore(join(dir,'workbench.sqlite')),tasks=new TaskStore(join(dir,'tasks.sqlite'));
 const owner=store.create(workspace,{name:`作者-${handoff}`,role:'写作',kind:'bot',members:[]});
 const team=store.createTeam(workspace,owner,{name:`准入验收-${handoff}`,purpose:'先核验再交付',members:[{name:`核验-${handoff}`,role:'检查'},{name:`交付-${handoff}`,role:'交付'}]});
 const root=`readiness-${handoff}`,session=new ConversationSession(workspace,root,store),ran=[];
 const review=team.members.find(m=>m.name.startsWith('核验')),layout=team.members.find(m=>m.name.startsWith('交付'));
 store.select(workspace,team.group.id);store.add(team.group.id,'你','隔离准入验收',root,{authorKind:'human'});
 session.tool({id:'dispatch',conversation:team.group,member:team.manager,instruction:'协作'},'assign_tasks',{tasks:[{memberId:review.name,instruction:'检查输入'},{memberId:layout.name,instruction:'交付',depends_on:review.name}]});
 tasks.start(root,'隔离准入验收',settings.workspace.path);
 const outcome=await session.run(async job=>{
  ran.push(job.member.id);
  session.tool(job,'task_result',{status:'completed',summary:job.member.id===review.id?(handoff==='ready'?'检查通过，保留可选建议':'检查完成，结果需要修改'):'协作结果',handoff:job.member.id===review.id?handoff:undefined});
  if(job.member.id===review.id)session.tool(job,'group_message',{content:`@${layout.name} 检查结果已更新。`});
  return {text:'协作结果',artifacts:[]};
 },()=>{});
 assert.equal(ran.filter(id=>id===layout.id).length,handoff==='ready'?1:0);
 tasks.finish(root,outcome.status,outcome.text);store.close();tasks.close();
 let app;try{
  app=await electron.launch({executablePath:resolve('build/task-readiness/mac-arm64/FormaBot.app/Contents/MacOS/FormaBot'),env});
  const page=await app.firstWindow();await page.locator('#workbench').waitFor();
  await page.waitForFunction(root=>window.forma.state().then(r=>r.ok&&r.value.task?.id===root),root);
  const state=(await page.evaluate(()=>window.forma.state())).value;
  assert.equal(state.task.status,handoff==='ready'?'completed':'blocked');
  const jobs=state.jobs;assert.equal(jobs.filter(j=>j.member===layout.id).length,1);
  assert.equal(jobs.find(j=>j.member===review.id).status,'completed');
  assert.equal(jobs.find(j=>j.member===layout.id).status,handoff==='ready'?'completed':'blocked');
  await page.locator('#jobs-details > summary').click();
  await page.screenshot({path:join(dir,`${handoff}.png`)});
  facts.push({handoff,status:state.task.status,layoutExecutions:ran.filter(id=>id===layout.id).length});
 }finally{await app?.close();}
}
await writeFile(join(dir,'facts.json'),JSON.stringify(facts,null,2));console.log(JSON.stringify({directory:dir,modelExecution:false,facts},null,2));

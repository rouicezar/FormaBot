// Real model verification in a fresh workspace. No production conversations or external actions.
import {_electron as electron} from 'playwright-core';
import {mkdtemp,mkdir,readFile,writeFile,copyFile,access,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import assert from 'node:assert/strict';

const dir=await mkdtemp(resolve('.tmp/live-rework-'));
const workspace=`${dir}-workspace`;await mkdir(workspace);
const config=JSON.parse(await readFile(join(process.env.HOME,'Library/Application Support/formabot/settings.json'),'utf8'));
if(!config.model?.secret)throw Error('No configured model; real task not run.');
config.workspace={path:workspace,authorized:false,outputDir:'outputs'};
await writeFile(join(dir,'settings.json'),JSON.stringify(config),{mode:0o600});
try{await copyFile(join(process.env.HOME,'Library/Application Support/formabot/Local State'),join(dir,'Local State'));}catch(e){if(e.code!=='ENOENT')throw e;}
await build({stdin:{contents:"export {WorkbenchStore} from './src/state/workbench';export {TaskStore} from './src/state/tasks';",resolveDir:resolve('.')},outfile:join(dir,'stores.mjs'),bundle:true,platform:'node',format:'esm'});
const {WorkbenchStore,TaskStore}=await import(pathToFileURL(join(dir,'stores.mjs')));
const store=new WorkbenchStore(join(dir,'workbench.sqlite'));
const manager=store.create(workspace,{name:'主管',role:'按用户要求组织协作、分工并汇总真实结果。',kind:'bot',members:[]});
const team=store.createTeam(workspace,manager,{name:'直接接收验收组',purpose:'按用户要求交付本地成果',members:[{name:'编辑',role:'负责撰写用户要求的文字与本地文档。'},{name:'研究员',role:'读取用户指定素材，核实事实；缺少素材时如实说明。'}]});
// Historical fixture supplies a known defect and provenance; all new rework runs use the real saved model.
await mkdir(join(workspace,'outputs'));
const original=join(workspace,'outputs/活动介绍.md');await writeFile(original,'周五 19:00 举行读书会。');
const editor=team.members.find(m=>m.name==='编辑');
for(const member of [team.manager,editor]){store.queueJob(`original-${member.id}`,'original-root',team.group.id,member.id,'编辑负责活动介绍，主管负责验收，文件 outputs/活动介绍.md');store.jobStatus(`original-${member.id}`,'completed');}
store.deliver(team.group.id,editor.name,'活动介绍已交付，时间周五 19:00。',`original-${editor.id}`,[original],{authorKind:'bot',authorId:editor.id,roleVersion:1});
store.recordDelivery(`original-${editor.id}`,original,'historical-fixture',Buffer.byteLength('周五 19:00 举行读书会。'));
store.addHandoffRule(workspace,{requesterId:manager,target:team.group.name,member:editor.name});
store.select(workspace,manager);store.close();
const grants=new TaskStore(join(dir,'tasks.sqlite'));grants.authorize(workspace);grants.close();
const executablePath=resolve(process.env.FORMABOT_TEST_APP||'build/s1a/mac-arm64/FormaBot.app/Contents/MacOS/FormaBot');
const env={...process.env,FORMABOT_TEST_DATA_DIR:dir};delete env.ELECTRON_RUN_AS_NODE;
let app,page;
const observed=new Map();let checkedGroupControl=false;
const facts={executablePath,provider:config.model.provider,model:config.model.model,dir};
try{
  app=await electron.launch({executablePath,env,timeout:30000});page=await app.firstWindow();
  await page.locator('#runtime',{hasText:'运行组件已就绪'}).waitFor({state:'attached',timeout:40000});
  await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>{throw Error('Unexpected approval in local fixture');};});
  async function send(text){
    const before=(await page.evaluate(()=>window.forma.state())).value.task?.id;
    await page.locator('#task').fill(text);await page.locator('#run').click();
    let result;const deadline=Date.now()+240000;
    while(Date.now()<deadline){
      result=(await page.evaluate(()=>window.forma.state())).value;
      if(result.task?.jobId){const t=result.task,old=observed.get(t.jobId);observed.set(t.jobId,{memberId:t.memberId,conversationId:t.conversationId,events:[...new Set([...(old?.events??[]),...t.events])]});}
      if(result.task?.conversationId===team.group.id&&!checkedGroupControl){await page.evaluate(id=>window.forma.selectConversation(id),team.group.id);const groupState=(await page.evaluate(()=>window.forma.state())).value;assert.equal(groupState.task?.status,'running');await page.evaluate(id=>window.forma.selectConversation(id),manager);checkedGroupControl=true;}
      if(result.task?.conversationId===team.group.id){const names=await page.locator('#messages .message[data-active-task=true] .message-heading strong').allTextContents();assert.ok(!names.includes(editor.name),'group executor must not appear as private active author');}
      if(result.task&&result.task.id!==before&&['completed','responded','blocked','failed','stopped','interrupted'].includes(result.task.status)&&!result.jobs.some(j=>['running','queued','held'].includes(j.status)))break;
      await new Promise(resolve=>setTimeout(resolve,500));
    }
    assert.ok(result.task&&result.task.id!==before&&result.task.status!=='running','task must reach its terminal state');
    await writeFile(join(dir,`state-${result.task?.id}.json`),JSON.stringify(result,null,2));
    return result;
  }
  const result=await send('你上次验收的编辑产物 outputs/活动介绍.md 不合格：读书会应当是周六 15:00，而不是周五 19:00。请回到原来的协作群让编辑返工，编辑修改后你实际检查文件，合格后再回这里告诉我结果。不要自己替编辑改稿，也不要创建新群或把编辑拉进私聊。');
  assert.ok((await readFile(join(workspace,'outputs/活动介绍.md'),'utf8')).includes('周六 15:00'));
  assert.ok(result.messages.filter(m=>m.authorKind==='bot').every(m=>m.authorId===manager));
  const db=new WorkbenchStore(join(dir,'workbench.sqlite'));
  const groupMessages=db.messages(team.group.id),jobs=db.jobs(team.group.id).filter(j=>!j.id.startsWith('original-'));
  assert.ok(groupMessages.some(m=>m.authorId===manager&&m.content.includes('@编辑')&&m.content.includes('返工')));
  assert.ok(jobs.some(j=>j.memberId===editor.id||j.memberName===editor.name));
  assert.ok(jobs.some(j=>j.memberName==='主管'));
  let verifiedRead=false;
  for(const [jobId,t] of observed){if(t.memberId!==manager||t.conversationId!==team.group.id)continue;const root=join(dir,'runs',jobId);for(const name of await readdir(root,{recursive:true})){if(!name.endsWith('session.jsonl'))continue;const events=(await readFile(join(root,name),'utf8')).trim().split('\n').map(line=>JSON.parse(line));if(events.some(e=>e.type==='tool/call'&&(e.data.name==='read'||e.data.name==='bash'&&/cat[\s\S]*活动介绍/.test(e.data.arguments))))verifiedRead=true;}}
  assert.ok(verifiedRead,'reviewer must actually read the revised file via read or shell');
  const latest=db.artifactHistory(workspace,editor.id).find(entry=>!entry.taskId.startsWith('original-'));assert.ok(latest,'new delivery must be in the editor timeline');
  const delivered=await readFile(original,'utf8');await writeFile(original,'后续修改的测试内容');const snapshot=await page.evaluate(input=>window.forma.preview(input),{taskId:latest.taskId,path:latest.path});assert.ok(snapshot.ok);assert.equal(snapshot.value.content,delivered);await writeFile(original,delivered);
  assert.ok(checkedGroupControl);facts.snapshotVerified=true;
  facts.observed=[...observed.entries()];
  facts.rework={status:result.task.status,jobs,privateAuthors:[...new Set(result.messages.filter(m=>m.authorKind==='bot').map(m=>m.authorId))],groupMessages};db.close();
  await page.screenshot({path:join(dir,'private-result.png'),fullPage:true});
  console.log('PASS: real-model original-group rework, editor revises file, owner reviews and reports privately.');
}catch(error){facts.error=String(error);await page?.screenshot({path:join(dir,'failure.png'),fullPage:true}).catch(()=>{});throw error;}
finally{await app?.close();await writeFile(join(dir,'facts.json'),JSON.stringify(facts,null,2));console.log('Evidence:',dir);}

import {test,expect} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {WorkbenchStore} from '../src/state/workbench';
import {ConversationSession} from '../src/runtime/conversation-session';
function fixture(){const dir=mkdtempSync(join(tmpdir(),'artifact-rework-')),store=new WorkbenchStore(join(dir,'db'));const b=store.create('/ws',{name:'审阅员',role:'检查上游交付，质量不合格要求返工',kind:'bot',members:[]});const team=store.createTeam('/ws',b,{name:'原协作群',purpose:'交付',members:[{name:'编辑',role:'编辑内容'},{name:'研究员',role:'提供素材'}]});return {store,team,close(){store.close();rmSync(dir,{recursive:true,force:true});}};}
test('artifact history includes older than 100 messages, own group artifacts and keeps other authors/workspaces out',()=>{
 const f=fixture();try{const {store,team}=f,b=team.manager!,a=team.members[0];
 store.deliver(b.id,b.name,'old','old',['/ws/old.md'],{authorKind:'bot',authorId:b.id});for(let i=0;i<105;i++)store.add(b.id,'你',String(i));
 store.deliver(team.group.id,b.name,'mine','mine',['/ws/mine.md'],{authorKind:'bot',authorId:b.id});store.recordDelivery('mine','/ws/mine.md','hash',10);
 store.deliver(team.group.id,a.name,'other','other',['/ws/other.md'],{authorKind:'bot',authorId:a.id});
 expect(store.messages(b.id).some(m=>m.taskId==='old')).toBe(false);
 expect(store.artifactHistory('/ws',b.id).map(a=>a.taskId)).toEqual(['mine','old']);
 expect(store.artifactHistory('/other',b.id)).toEqual([]);
 expect(store.artifactHistory('/ws',team.group.id).map(a=>a.taskId)).toEqual(['other','mine']);
 }finally{f.close();}
});
test('nested rework stays in original group and returns through reviewers to private owner without private context leak',async()=>{
 const f=fixture();try{const {store,team}=f,b=team.manager!,a=team.members[0],c=team.members[1];
 for(const member of [b,a,c]){store.queueJob(`old-${member.id}`,'old-root',team.group.id,member.id,'original work');store.jobStatus(`old-${member.id}`,'completed');}
 const session=new ConversationSession('/ws','rework-root',store);session.human(b,'SECRET private history');const executed:string[]=[];
 await session.run(async(job,prompt)=>{
  executed.push(`${job.member.name}:${job.conversation.kind}`);
  if(job.conversation.kind==='group')expect(prompt).not.toContain('SECRET');
  if(executed.length===1){expect(()=>session.tool(job,'request_rework',{source_task:'unknown',issue:'fix'})).toThrow(/关联/);session.tool(job,'request_rework',{source_task:`old-${a.id}`,issue:'缺少数据，补充验证'});}
  else if(job.member.id===a.id&&executed.length===2)session.tool(job,'request_rework',{source_task:`old-${c.id}`,issue:'核对原始数据'});
  if(job.member.id===c.id)session.tool(job,'group_message',{content:'@编辑 原始数据已核对，请复核'});
  session.tool(job,'task_result',{status:'completed',summary:'已检查本步骤'});return {text:'已检查本步骤',artifacts:[]};
 },()=>{});
 expect(executed).toEqual(['审阅员:bot','编辑:group','研究员:group','编辑:group','审阅员:group','审阅员:bot']);
 expect(store.messages(b.id).filter(m=>m.authorKind==='bot').every(m=>m.authorId===b.id)).toBe(true);
 expect(store.messages(team.group.id).some(m=>m.authorId===b.id&&m.content.includes('@编辑'))).toBe(true);
 }finally{f.close();}
});
test('failed upstream still returns for review and handoff cannot target a bot private chat',async()=>{
 const f=fixture();try{const {store,team}=f,b=team.manager!,a=team.members[0];for(const m of [b,a]){store.queueJob(`old-${m.id}`,'root',team.group.id,m.id,'original');store.jobStatus(`old-${m.id}`,'completed');}
 const session=new ConversationSession('/ws','failure-root',store);session.human(b,'检查交付');const calls:string[]=[];
 const result=await session.run(async(job)=>{calls.push(job.member.id);if(calls.length===1){expect(()=>session.tool(job,'request_handoff',{target:a.name,member:a.name,task:'fix'})).toThrow(/私聊/);session.tool(job,'request_rework',{source_task:`old-${a.id}`,issue:'fix'});}if(job.member.id===a.id)throw Error('fixture failed');return {text:'受阻，未修复',artifacts:[]};},()=>{});
 expect(result.status).toBe('failed');expect(calls).toEqual([b.id,a.id,b.id,b.id]);
 }finally{f.close();}
});
test('cross-group upstream review reports back before the downstream reviewer resumes',async()=>{
 const f=fixture();try{const {store,team}=f,b=team.manager!,a=team.members[0],c=team.members[1];
 const upstream=store.create('/ws',{name:'素材原群',kind:'group',role:'素材',members:[a.id,c.id]});
 for(const member of [b,a]){store.queueJob(`delivery-${member.id}`,'delivery-root',team.group.id,member.id,'交付');store.jobStatus(`delivery-${member.id}`,'completed');}
 for(const member of [a,c]){store.queueJob(`source-${member.id}`,'source-root',upstream,member.id,'素材');store.jobStatus(`source-${member.id}`,'completed');}
 const session=new ConversationSession('/ws','review-root',store);session.human(b,'请返工');const order:string[]=[];
 await session.run(async job=>{order.push(`${job.member.name}:${job.conversation.name}`);if(order.length===1)session.tool(job,'request_rework',{source_task:`delivery-${a.id}`,issue:'内容不符'});if(order.length===2)session.tool(job,'request_rework',{source_task:`source-${c.id}`,issue:'原始素材不符'});session.tool(job,'task_result',{status:'completed',summary:'已复核'});return {text:'已复核',artifacts:[]};},()=>{});
 expect(order).toEqual(['审阅员:审阅员','编辑:原协作群','研究员:素材原群','编辑:素材原群','编辑:原协作群','审阅员:原协作群','审阅员:审阅员']);
 }finally{f.close();}
});

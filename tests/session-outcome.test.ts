import {test,expect} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {WorkbenchStore} from '../src/state/workbench';
import {ConversationSession} from '../src/runtime/conversation-session';
import {TaskStore} from '../src/state/tasks';

test.each(['completed','responded','blocked'] as const)('silent participants do not replace a public %s outcome',async status=>{
 const f=fixture();try{
  const session=new ConversationSession('/a','mixed',f.store);session.human(f.team.group,'@所有人 通知');
  const result=await session.run(async job=>{
   if(job.member.id===f.team.members[0].id)session.tool(job,'silent',{reason:'无需发言'});
   else if(status!=='responded')session.tool(job,'task_result',{status,summary:'公开结果'});
   return {text:job.silent?'内部静默结果':'公开结果',artifacts:[]};
  },()=>{});
  expect(result.status).toBe(status);
  expect(result.text).toBe('公开结果');
 }finally{f.close();}
});

test('timeout remains interrupted, blocks dependents, and persists at root and member levels',async()=>{
 const f=fixture();const tasks=new TaskStore(f.file+'-tasks');try{
  const session=new ConversationSession('/a','timeout',f.store);
  session.tool({id:'dispatch',member:f.team.manager!,conversation:f.team.group,instruction:'派发'},'assign_tasks',{tasks:[{memberId:'编辑',instruction:'读取'}, {memberId:'主管',instruction:'下游',depends_on:'编辑'}]});
  tasks.start('timeout','任务','/a');
  const result=await session.run(async job=>{
   if(job.summary){session.tool(job,'task_result',{status:'completed',summary:'汇总'});return {text:'汇总',artifacts:[]};}
   const error=Error('本次任务空转超时');error.name='TaskTimeout';throw error;
  },()=>{});
  tasks.finish('timeout',result.status,result.text);
  expect(result.status).toBe('interrupted');expect(result.text).toContain('超时');
  expect(f.store.jobs(f.team.group.id).find(j=>j.memberName==='编辑')?.status).toBe('interrupted');
  expect(f.store.jobs(f.team.group.id).find(j=>j.instruction==='下游')?.status).toBe('blocked');
  expect(tasks.latest()?.status).toBe('interrupted');
  const reopened=new WorkbenchStore(f.file);try{expect(reopened.jobs(f.team.group.id).find(j=>j.memberName==='编辑')?.status).toBe('interrupted');}finally{reopened.close();}
 }finally{tasks.close();f.close();}
});

// These callbacks exercise host control flow, not substitute model execution.
test('model roster uses Bot names and public instructions require recognizable member references',async()=>{
 const f=fixture();try{
  const session=new ConversationSession('/a','names',f.store);session.human(f.team.group,'@编辑 检查');
  await session.run(async(_job,prompt)=>{
   expect(prompt).toContain('群内成员姓名与职责');expect(prompt).not.toMatch(/m\d+：/);
   expect(prompt).toContain('@完整Bot姓名');expect(prompt.endsWith('不复述本规则本身。')).toBe(true);expect(prompt).toContain('不固定句数或字数');expect(prompt).toContain('除非用户明确要求在聊天直接给源码或完整报告');return {text:'检查结果',artifacts:[]};
  },()=>{});
 }finally{f.close();}
});
function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'session-outcome-')),file=join(dir,'db');const store=new WorkbenchStore(file);
 const manager=store.create('/a',{name:'主管',role:'协调',kind:'bot',members:[]});
 const team=store.createTeam('/a',manager,{name:'群',purpose:'协作',members:[{name:'编辑',role:'写作'}]});
 return {store,team,file,close(){store.close();rmSync(dir,{recursive:true,force:true});}};
}
test('missing receipts remain responded in both private and group conversations and persist',async()=>{
 const f=fixture();try{
  for(const conversation of [f.team.members[0],f.team.group]){
   const session=new ConversationSession('/a',conversation.id,f.store);session.human(conversation,'请核验结果',f.team.members[0].id);
   const result=await session.run(async()=>({text:'还需核验',artifacts:[]}),()=>{});
   expect(result.status).toBe('responded');expect(f.store.jobs(conversation.id)[0].status).toBe('responded');
  }
  const reopened=new WorkbenchStore(f.file);try{expect(reopened.jobs(f.team.group.id)[0].status).toBe('responded');}finally{reopened.close();}
 }finally{f.close();}
});
test.each(['responded','blocked','failed','completed'] as const)('coordinator summary cannot hide a %s member outcome',async(status)=>{
 const f=fixture();try{
  const session=new ConversationSession('/a','root',f.store);
  session.tool({id:'dispatch',member:f.team.manager!,conversation:f.team.group,instruction:'派发'},'assign_tasks',{tasks:[{memberId:'编辑',instruction:'处理'}]});
  const result=await session.run(async job=>{
   if(job.summary)session.tool(job,'task_result',{status:'completed',summary:'已汇总'});
   else if(status==='failed')throw Error('工具失败');
   else if(status!=='responded')session.tool(job,'task_result',{status,summary:'结果回执'});
   return {text:'答复',artifacts:[]};
  },()=>{});
  expect(result.status).toBe(status);expect(f.store.jobs(f.team.group.id).find(j=>j.memberName==='主管')?.status).toBe('completed');
 }finally{f.close();}
});
test('human priority is FIFO, other conversations cannot join the root, and both queues stop',async()=>{
 const f=fixture();try{
  const session=new ConversationSession('/a','root',f.store),group=f.team.group,id=f.team.members[0].id;
  session.human(group,'原任务',id);session.enqueue(group,[id],'自动待办');const order:string[]=[];
  await session.run(async job=>{
   order.push(job.instruction);
   if(order.length===1){session.human(group,'人工第一条',id);session.human(group,'人工第二条',id);expect(()=>session.human(f.team.manager!,'其他会话')).toThrow('其他会话');}
   session.tool(job,'task_result',{status:'completed',summary:'处理完毕'});return {text:'答复',artifacts:[]};
  },()=>{});
  expect(order).toEqual(['原任务','人工第一条','人工第二条','自动待办']);
  const stopping=new ConversationSession('/a','stop',f.store);stopping.human(group,'人工等待',id);stopping.enqueue(group,[id],'自动等待');stopping.stop();
  expect(f.store.jobs(group.id).slice(0,2).every(j=>j.status==='stopped')).toBe(true);await expect(stopping.run(async()=>{throw Error('不得执行');},()=>{})).rejects.toThrow('停止');
 }finally{f.close();}
});

test('group tool and final response share one short result and keep artifacts',async()=>{
 const f=fixture();try{
  const session=new ConversationSession('/a','public-root',f.store),member=f.team.members[0];session.human(f.team.group,'报到',member.id);
  await session.run(async job=>{
   session.tool(job,'group_message',{content:'已到位，等待素材。'});
   session.tool(job,'group_message',{content:'已到位，等待素材。'});
   session.tool(job,'task_result',{status:'completed',summary:'长'.repeat(301)});
   session.tool(job,'task_result',{status:'completed',summary:'**已到位**，收到素材后整理草稿。'});
   return {text:'重复完整职责介绍'.repeat(100),artifacts:['/a/outputs/draft.md']};
  },()=>{});
  const messages=f.store.messages(f.team.group.id).filter(m=>m.speaker===member.name);
  expect(messages).toHaveLength(1);expect(messages[0].content).toBe('**已到位**，收到素材后整理草稿。');expect(messages[0].artifacts).toEqual(['/a/outputs/draft.md']);
  expect(f.store.messages(f.team.group.id).filter(m=>m.speaker==='系统')).toHaveLength(0);
 }finally{f.close();}
});

test('long public replies are preserved while explicit thinking is removed',async()=>{
 const f=fixture();try{
  const session=new ConversationSession('/a','bad-public',f.store);session.human(f.team.group,'回答',f.team.members[0].id);
  await session.run(async job=>{
   expect(()=>session.tool(job,'group_message',{content:'<think>内部推理</think>'})).toThrow('内部思考');
   return {text:'<think>内部推理</think>'+ '长'.repeat(3000),artifacts:[]};
  },()=>{});
  const text=f.store.messages(f.team.group.id).filter(m=>m.speaker===f.team.members[0].name).map(m=>m.content).join('');
  expect(text).toBe('长'.repeat(3000));expect(text).not.toContain('内部推理');
 }finally{f.close();}
});

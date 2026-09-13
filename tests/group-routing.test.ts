import {test,expect} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {WorkbenchStore} from '../src/state/workbench';
import {ConversationSession} from '../src/runtime/conversation-session';
import {mentioned} from '../src/runtime/group-routing';
test('group routing, actual queue receipts, workspace boundaries, deduplication and stop',()=>{
 const dir=mkdtempSync(join(tmpdir(),'group-routing-'));const store=new WorkbenchStore(join(dir,'db'));
 try{
  const manager=store.create('/a',{name:'总监',role:'管理',kind:'bot',members:[]});
  const team=store.createTeam('/a',manager,{name:'团队',purpose:'协作',members:[{name:'编辑',role:'写作'},{name:'研究员',role:'研究'}]});
  const all=store.list('/a');expect(mentioned('@编辑 请回应',team.group,all)).toEqual([team.members[0].id]);expect(mentioned('@编辑部 不应误中',team.group,all)).toEqual([]);expect(mentioned('@所有人 请接单',team.group,all)).toHaveLength(2);
  const session=new ConversationSession('/a','root',store);const job={id:'manager-job',conversation:team.group,member:team.manager!,instruction:'布置工作'};
  expect(()=>session.tool(job,'assign_tasks',{tasks:[{memberId:'foreign',instruction:'bad'}]})).toThrow();expect(store.jobs(team.group.id)).toHaveLength(0);
  session.tool(job,'assign_tasks',{tasks:[{memberId:'all',instruction:'读取素材并回复'}]});expect(store.jobs(team.group.id)).toHaveLength(2);expect(store.jobs(team.group.id).every(j=>j.status==='queued')).toBe(true);
  session.tool(job,'assign_tasks',{tasks:[{memberId:'all',instruction:'读取素材并回复'}]});expect(store.jobs(team.group.id)).toHaveLength(2);
  expect(()=>session.tool({...job,member:team.members[0]},'assign_tasks',{tasks:[{memberId:'all',instruction:'越权分工'}]})).toThrow();
  session.tool({...job,member:team.members[0]},'group_message',{content:'@研究员 请看同群共享消息'});expect(store.jobs(team.group.id)).toHaveLength(2);
  expect(store.messages(team.group.id).some(m=>m.speaker==='编辑'&&m.content.includes('共享消息'))).toBe(true);
  expect(()=>store.update('/a',team.group.id,'团队','协作',['foreign'])).toThrow();
  store.update('/a',team.group.id,'团队新名','新目标',[team.members[0].id]);expect(store.team('/a',team.group.id).members).toHaveLength(1);
  session.stop();expect(store.jobs(team.group.id).every(j=>j.status==='stopped')).toBe(true);expect(()=>session.human(team.group,'继续')).toThrow();
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
test('current group and exact names/short handles route without copied UUIDs; outcomes are explicit',()=>{
 const dir=mkdtempSync(join(tmpdir(),'group-handles-'));const store=new WorkbenchStore(join(dir,'db'));
 try{
  const manager=store.create('/a',{name:'总监',role:'管理',kind:'bot',members:[]});const team=store.createTeam('/a',manager,{name:'验收群',purpose:'验收',members:[{name:'研究员',role:'研究'},{name:'编辑',role:'写稿'}]});
  const session=new ConversationSession('/a','root',store);const job={id:'job',conversation:team.group,member:team.manager!,instruction:'分工',report:undefined as {status:'completed'|'blocked';summary:string}|undefined};
  session.tool(job,'assign_tasks',{groupId:'current',tasks:[{memberId:'研究员',instruction:'核验'},{memberId:'m3',instruction:'写稿'}]});
  expect(store.jobs(team.group.id).map(j=>j.memberName).sort()).toEqual(['研究员','编辑'].sort());
  session.tool(job,'group_message',{groupId:'验收群',content:'@研究员 @编辑 请结合群内共同约定完成已派发任务。'});expect(store.jobs(team.group.id)).toHaveLength(2);
  expect(()=>session.tool(job,'group_message',{groupId:'unknown',content:'bad'})).toThrow();
  session.tool(job,'task_result',{status:'blocked',summary:'素材尚未提供'});expect(job.report?.status).toBe('blocked');session.stop();
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

test('model-selected broadcast reaches colleagues even without literal mentions and deduplicates retries',()=>{
 const dir=mkdtempSync(join(tmpdir(),'group-broadcast-')),store=new WorkbenchStore(join(dir,'db'));
 try{
  const manager=store.create('/a',{name:'总监',role:'管理',kind:'bot',members:[]});const team=store.createTeam('/a',manager,{name:'团队',purpose:'协作',members:[{name:'编辑',role:'写作'},{name:'研究员',role:'研究'}]});
  const session=new ConversationSession('/a','root',store),job:import('../src/runtime/conversation-session').MemberJob={id:'job',conversation:team.group,member:team.manager!,instruction:'用户希望全员回应'};
  session.tool(job,'group_message',{recipients:'all',content:'用户要求全体确认共同协作安排。'});
  expect(store.jobs(team.group.id).map(j=>j.member).sort()).toEqual(team.members.map(m=>m.id).sort());
  session.tool(job,'group_message',{recipients:'all',content:'用户要求全体确认共同协作安排。'});expect(store.jobs(team.group.id)).toHaveLength(2);
  // E04c：汇总任务禁止唤醒他人（静默语义见 silent-protocol.test.ts）。
  const summaryJob={...job,summary:true};
  expect(()=>session.tool(summaryJob,'group_message',{recipients:'all',content:'汇总阶段不允许唤醒全员'})).toThrow();
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

test('private tasks cannot forward or dispatch into a group even when the bot is its manager',()=>{
 const dir=mkdtempSync(join(tmpdir(),'private-boundary-')),store=new WorkbenchStore(join(dir,'db'));
 try{
  const manager=store.create('/a',{name:'总监',role:'管理',kind:'bot',members:[]});const team=store.createTeam('/a',manager,{name:'团队',purpose:'协作',members:[{name:'编辑',role:'写作'}]});
  const session=new ConversationSession('/a','private',store),job={id:'job',conversation:team.manager!,member:team.manager!,instruction:'私下研究'};
  expect(()=>session.tool(job,'group_message',{groupId:team.group.id,content:'私聊报告',recipients:'all'})).toThrow('跨会话转发');
  expect(()=>session.tool(job,'assign_tasks',{groupId:team.group.id,tasks:[{memberId:'all',instruction:'私聊需求'}]})).toThrow('跨会话转发');
  expect(store.messages(team.group.id)).toHaveLength(0);expect(store.jobs(team.group.id)).toHaveLength(0);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

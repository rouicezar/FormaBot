import {test,expect} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {WorkbenchStore} from '../src/state/workbench';
import {ConversationSession} from '../src/runtime/conversation-session';

test('stop clears queued and held jobs; tools and enqueue reject after stop',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'corr-')),store=new WorkbenchStore(join(dir,'db'));
  try{
    const manager=store.create('/a',{name:'总监',role:'管理',kind:'bot',members:[]});
    const team=store.createTeam('/a',manager,{name:'纠正组',purpose:'协作',members:[{name:'研究',role:'研究'},{name:'写作',role:'写作'}]});
    const session=new ConversationSession('/a','root',store);
    session.tool({id:'j0',conversation:team.group,member:team.manager!,instruction:'派发'},'assign_tasks',{tasks:[
      {memberId:'研究',instruction:'读取素材'},
      {memberId:'写作',instruction:'撰写报告',depends_on:'研究'},
    ]});
    session.stop();
    const jobs=store.jobs(team.group.id);
    for(const job of jobs)expect(['stopped','interrupted']).toContain(job.status);
    expect(()=>session.human(team.group,'@研究 取消旧版')).toThrow(/已停止/);
    const job={id:'jx',conversation:team.group,member:team.members[0]!,instruction:'迟到副作用'};
    expect(()=>session.tool(job,'group_message',{content:'停止后仍想发言'})).toThrow(/任务已停止/);
    expect(()=>session.tool(job,'silent',{reason:'x'})).toThrow(/任务已停止/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('running job keeps its start role version and newer queued work uses the current one',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'corr2-')),store=new WorkbenchStore(join(dir,'db'));
  try{
    const bot=store.create('/a',{name:'助手',role:'旧职责',kind:'bot',members:[]});
    store.queueJob('job-a','root','/a',bot,'旧任务');store.queueJob('job-b','root','/a',bot,'新任务');
    const v1=store.startJob('/a','job-a');
    expect(v1.roleVersion).toBe(1);
    store.update('/a',bot,'助手','新职责');
    const v2=store.startJob('/a','job-b');
    expect(v2.roleVersion).toBe(2);
    expect(store.roleHistory('/a',bot)[0]!.source).toBe('user_edit');
  }finally{rmSync(dir,{recursive:true,force:true});}
});

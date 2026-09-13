import {test,expect} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {WorkbenchStore} from '../src/state/workbench';
import {ConversationSession} from '../src/runtime/conversation-session';

test.each(['mentioned','all'] as const)('group message %s preserves held dependencies without an extra execution',async recipients=>{
 for(const status of ['blocked','completed'] as const){
  const dir=mkdtempSync(join(tmpdir(),'deps-message-')),store=new WorkbenchStore(join(dir,'db'));
  try{
   const manager=store.create('/a',{name:'改写',role:'改写',kind:'bot',members:[]});
   const team=store.createTeam('/a',manager,{name:'交付组',purpose:'先审查后排版',members:[{name:'审查',role:'审查'},{name:'排版',role:'排版'}]});
   const session=new ConversationSession('/a','root',store),sender={id:'dispatch',conversation:team.group,member:team.manager!,instruction:'交付'};
   session.tool(sender,'assign_tasks',{tasks:[{memberId:'审查',instruction:'审查文件'},{memberId:'排版',instruction:'排版文件',depends_on:'审查'}]});
   const receipt=JSON.parse(session.tool(sender,'group_message',{recipients,content:'@排版 文件已交付，请按审查后排版的流程处理。'}));
   const layoutJobs=store.jobs(team.group.id).filter(j=>j.memberName==='排版');
   expect(layoutJobs).toHaveLength(1);expect(layoutJobs[0].status).toBe('held');
   expect(receipt.queued.find((j:{member:string})=>j.member==='排版')).toMatchObject({id:layoutJobs[0].id,status:'held',sharedUpdate:true});
   const executed:string[]=[];
   await session.run(async job=>{executed.push(job.member.name);session.tool(job,'task_result',{status:job.member.name==='审查'?status:'completed',summary:'结果',handoff:job.member.name==='审查'&&status==='blocked'?undefined:'ready'});return {text:'结果',artifacts:[]};},()=>{});
   expect(executed.filter(name=>name==='排版')).toHaveLength(status==='completed'?1:0);
   if(status==='completed')expect(executed.indexOf('排版')).toBeGreaterThan(executed.indexOf('审查'));
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
 }
});

test('blocked predecessor holds dependents; completed predecessor releases them with context',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'deps-')),store=new WorkbenchStore(join(dir,'db'));
  try{
    const manager=store.create('/a',{name:'总监',role:'管理',kind:'bot',members:[]});
    const team=store.createTeam('/a',manager,{name:'依赖组',purpose:'协作',members:[{name:'研究',role:'研究'},{name:'写作',role:'写作'}]});
    const session=new ConversationSession('/a','root',store);
    session.tool({id:'j0',conversation:team.group,member:team.manager!,instruction:'派发'},'assign_tasks',{tasks:[
      {memberId:'研究',instruction:'获取素材'},
      {memberId:'写作',instruction:'撰写报告',depends_on:'研究'},
    ]});
    const jobs=store.jobs(team.group.id);
    expect(jobs.find(j=>j.memberName==='写作')!.status).toBe('held');
    const dispatched:string[]=[];
    const run=session.run(async job=>{
      dispatched.push(job.member.name);
      const status=job.member.name==='研究'?'blocked':'completed';
      session.tool(job,'task_result',{status,summary:status==='blocked'?'素材缺失':'报告完成'});
      return {text:'done',artifacts:[]};
    },()=>{});
    await run;
    // 前置受阻：下游必须保持未派发（F06 修复）；总监汇总可出现。
    expect(dispatched).not.toContain('写作');
    expect(dispatched[0]).toBe('研究');
    const after=store.jobs(team.group.id);
    expect(after.find(j=>j.memberName==='写作')!.status).toBe('blocked');
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('completed predecessor releases the dependent with predecessor context',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'deps-ok-')),store=new WorkbenchStore(join(dir,'db'));
  try{
    const manager=store.create('/a',{name:'总监',role:'管理',kind:'bot',members:[]});
    const team=store.createTeam('/a',manager,{name:'依赖组二',purpose:'协作',members:[{name:'研究',role:'研究'},{name:'写作',role:'写作'}]});
    const session=new ConversationSession('/a','root',store);
    session.tool({id:'j0',conversation:team.group,member:team.manager!,instruction:'派发'},'assign_tasks',{tasks:[
      {memberId:'研究',instruction:'获取素材'},
      {memberId:'写作',instruction:'撰写报告',depends_on:'研究'},
    ]});
    const dispatched:string[]=[];let sawContext=false;
    const run=session.run(async job=>{
      dispatched.push(job.member.name);
      if(job.member.name==='写作')sawContext=job.instruction.includes('前置任务（研究）已完成');
      if(job.member.name==='研究')session.tool(job,'task_result',{status:'completed',summary:'素材已交付',handoff:'ready'});
      return {text:'done',artifacts:[]};
    },()=>{});
    await run;
    expect(dispatched.indexOf('研究')).toBeLessThan(dispatched.indexOf('写作'));
    expect(dispatched.indexOf('写作')).toBeGreaterThan(-1);
    expect(sawContext).toBe(true);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

// Completion of a check is not approval of the item it checked.
test.each(['ready','needs_changes',undefined] as const)('downstream requires explicit readiness: %s',async handoff=>{
 const dir=mkdtempSync(join(tmpdir(),'deps-readiness-')),store=new WorkbenchStore(join(dir,'db'));
 try{
  const owner=store.create('/a',{name:'作者',role:'写作',kind:'bot',members:[]});
  const team=store.createTeam('/a',owner,{name:'复核链',purpose:'审查后交付',members:[{name:'审查',role:'审查'},{name:'排版',role:'排版'}]});
  const session=new ConversationSession('/a','root',store);
  session.tool({id:'dispatch',conversation:team.group,member:team.manager!,instruction:'交付'},'assign_tasks',{tasks:[{memberId:'审查',instruction:'检查'},{memberId:'排版',instruction:'排版',depends_on:'审查'}]});
  const executed:string[]=[];
  const outcome=await session.run(async(job,prompt)=>{
   executed.push(job.member.name);
   if(job.member.name==='审查'){
    expect(prompt).toContain('handoff');
    const report={status:'completed',summary:handoff==='ready'?'检查合格，保留一项可选建议':'检查已完成，文稿需要修改',handoff};
    if(handoff===undefined)expect(()=>session.tool(job,'task_result',report)).toThrow('下游');
    else session.tool(job,'task_result',report);
    // A public notification cannot bypass the held dependency.
    session.tool(job,'group_message',{content:'@排版 检查结果已更新。'});
   }else session.tool(job,'task_result',{status:'completed',summary:'汇总或交付'});
   if(job.member.name==='排版')expect(job.instruction).toContain('保留一项可选建议');
   return {text:'本轮结果',artifacts:[]};
  },()=>{});
  expect(outcome.status).toBe(handoff==='ready'?'completed':'blocked');
  expect(executed.filter(n=>n==='排版')).toHaveLength(handoff==='ready'?1:0);
  expect(store.jobs(team.group.id).filter(j=>j.memberName==='排版')).toHaveLength(1);
  if(handoff==='needs_changes'){
   expect(store.jobs(team.group.id).find(j=>j.memberName==='审查')?.status).toBe('completed');
   expect(store.jobs(team.group.id).find(j=>j.memberName==='排版')?.error).toContain('需要修改');
  }
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

test('a later notification cannot recreate a blocked formal dependency',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'deps-blocked-notice-')),store=new WorkbenchStore(join(dir,'db'));
 try{
  const owner=store.create('/a',{name:'作者',role:'管理',kind:'bot',members:[]}),team=store.createTeam('/a',owner,{name:'链',purpose:'协作',members:[{name:'审查',role:'审查'},{name:'排版',role:'排版'}]});
  const session=new ConversationSession('/a','root',store),sender={id:'dispatch',conversation:team.group,member:team.manager!,instruction:'交付'};
  session.tool(sender,'assign_tasks',{tasks:[{memberId:'审查',instruction:'审查'},{memberId:'排版',instruction:'排版',depends_on:'审查'}]});
  let layoutRuns=0;
  await session.run(async job=>{if(job.member.name==='排版')layoutRuns++;if(job.summary)session.tool(job,'group_message',{content:'结果已汇总'});return {text:'回应没有完成回执',artifacts:[]};},()=>{});
  const reply=JSON.parse(session.tool(sender,'group_message',{content:'@排版 可以排版了。'}));
  expect(reply.queued[0].status).toBe('blocked');expect(store.jobs(team.group.id).filter(j=>j.memberName==='排版')).toHaveLength(1);
  await session.run(async()=>{layoutRuns++;return {text:'不应运行',artifacts:[]};},()=>{});expect(layoutRuns).toBe(0);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

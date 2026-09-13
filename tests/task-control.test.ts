import {test,expect} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {WorkbenchStore} from '../src/state/workbench';
import {ConversationSession} from '../src/runtime/conversation-session';

function fixture(){
  const dir=mkdtempSync(join(tmpdir(),'task-control-'));
  const store=new WorkbenchStore(join(dir,'db'));
  const manager=store.create(dir,{name:'主管',role:'协调',kind:'bot',members:[]});
  const team=store.createTeam(dir,manager,{name:'测试组',purpose:'测试',members:[{name:'研究员',role:'研究'},{name:'编辑',role:'写作'},{name:'审核',role:'审核'}]});
  const session=new ConversationSession(dir,'root',store);
  const assign=(tasks:unknown)=>session.tool({id:'assigner',conversation:team.group,member:team.manager!,instruction:'分工'},'assign_tasks',{tasks});
  return {store,team,session,assign,close(){store.close();rmSync(dir,{recursive:true,force:true});}};
}

test.each(['@编辑 请直接写一段介绍','@编辑？请分析并回复','＠编辑；请分析并回复'])('human mention reaches the member with the complete message and no manager hop: %s',async text=>{
  const f=fixture();try{
    f.session.human(f.team.group,text,f.team.manager!.id);
    const executed:string[]=[];
    await f.session.run(async(job,prompt)=>{
      executed.push(job.member.name);expect(job.instruction).toBe(text);expect(prompt).toContain(text);
      f.session.tool(job,'task_result',{status:'completed',summary:'成员本人回复'});
      return {text:'成员本人回复',artifacts:[]};
    },()=>{});
    expect(executed).toEqual(['编辑']);
    expect(f.store.messages(f.team.group.id).filter(m=>m.authorKind==='bot').map(m=>m.authorId)).toEqual([f.team.members[1].id]);
  }finally{f.close();}
});

test.each(['responded','silent','blocked','failed','start-failed'] as const)('non-completed predecessor %s blocks the whole dependency chain',async outcome=>{
  const f=fixture();try{
    f.assign([{memberId:'研究员',instruction:'研究'},{memberId:'编辑',instruction:'写稿',depends_on:'研究员'},{memberId:'审核',instruction:'审核',depends_on:'编辑'}]);
    const executed:string[]=[];
    const result=await f.session.run(async job=>{
      executed.push(job.member.name);
      if(job.member.name==='研究员'){
        if(outcome==='failed')throw Error('构造执行错误');
        if(outcome==='silent')f.session.tool(job,'silent',{reason:'无需回复'});
        if(outcome==='blocked')f.session.tool(job,'task_result',{status:'blocked',summary:'缺少输入'});
      }else f.session.tool(job,'task_result',{status:'completed',summary:'汇总'});
      return {text:'回复',artifacts:[]};
    },job=>{if(outcome==='start-failed'&&job.member.name==='研究员')throw Error('构造启动错误');});
    expect(executed).not.toContain('编辑');expect(executed).not.toContain('审核');
    const jobs=f.store.jobs(f.team.group.id);
    expect(jobs.filter(j=>['编辑','审核'].includes(j.memberName)).map(j=>j.status)).toEqual(['blocked','blocked']);
    expect(jobs.some(j=>['held','queued','running'].includes(j.status))).toBe(false);
    expect(result.status).not.toBe('completed');
  }finally{f.close();}
});

test('cyclic and ambiguous predecessor references are rejected before any job is stored',()=>{
  const f=fixture();try{
    expect(()=>f.assign([{memberId:'研究员',instruction:'a',depends_on:'编辑'},{memberId:'编辑',instruction:'b',depends_on:'研究员'}])).toThrow(/循环/);
    expect(f.store.jobs(f.team.group.id)).toHaveLength(0);
    expect(()=>f.assign([{memberId:'研究员',instruction:'a'},{memberId:'研究员',instruction:'b'},{memberId:'编辑',instruction:'c',depends_on:'研究员'}])).toThrow(/唯一|多个|多项/);
    expect(f.store.jobs(f.team.group.id)).toHaveLength(0);
  }finally{f.close();}
});

test('completion of the same member in another batch cannot release a different predecessor job',async()=>{
  const f=fixture();try{
    const first=[{memberId:'研究员',instruction:'第一份研究'},{memberId:'编辑',instruction:'第一份写稿',depends_on:'研究员'}];
    const receipt=f.assign(first);expect(f.assign(first)).toBe(receipt);
    f.assign([{memberId:'研究员',instruction:'第二份研究'},{memberId:'审核',instruction:'第二份审核',depends_on:'研究员'}]);
    const executed:string[]=[];
    await f.session.run(async job=>{
      executed.push(job.instruction);
      f.session.tool(job,'task_result',{status:job.instruction==='第二份研究'?'blocked':'completed',summary:'结果',handoff:job.instruction==='第二份研究'?undefined:'ready'});
      return {text:'结果',artifacts:[]};
    },()=>{});
    expect(executed.some(s=>s.includes('第一份写稿'))).toBe(true);
    expect(executed.some(s=>s.includes('第二份审核'))).toBe(false);
    expect(f.store.jobs(f.team.group.id).find(j=>j.memberName==='审核')!.status).toBe('blocked');
  }finally{f.close();}
});

test('a storage failure rolls back every job in the assignment batch',()=>{
  const f=fixture();try{
    const bot=f.team.members[0].id;
    f.store.queueJob('existing','root',f.team.group.id,bot,'existing');
    expect(()=>f.store.queueJobs('root',[
      {id:'new',conversation:f.team.group.id,member:bot,instruction:'new',waiting:true},
      {id:'existing',conversation:f.team.group.id,member:bot,instruction:'collision',waiting:false},
    ])).toThrow();
    expect(f.store.jobs(f.team.group.id).map(job=>job.id)).toEqual(['existing']);
  }finally{f.close();}
});

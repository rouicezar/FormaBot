import {test,expect} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {WorkbenchStore} from '../src/state/workbench';
import {ConversationSession, type MemberJob} from '../src/runtime/conversation-session';

test('silent is group-only, requires a reason, and suppresses public output',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'silent-')),store=new WorkbenchStore(join(dir,'db'));
  try{
    const manager=store.create('/a',{name:'总监',role:'管理',kind:'bot',members:[]});
    const team=store.createTeam('/a',manager,{name:'团队',purpose:'协作',members:[{name:'编辑',role:'写作'}]});
    const group=team.group,member=team.members[0]!;
    const session=new ConversationSession('/a','root',store);
    const job:MemberJob={id:'job',conversation:group,member,instruction:'通知类消息'};

    expect(()=>session.tool(job,'silent',{})).toThrow(/静默需要内部原因/);
    expect(job.silent).toBeUndefined();

    const privateSession=new ConversationSession('/a','private-root',store);
    const privateJob:MemberJob={id:'pjob',conversation:team.manager!,member:team.manager!,instruction:'用户提问'};
    expect(()=>privateSession.tool(privateJob,'silent',{reason:'无关'})).toThrow(/仅适用于群聊/);

    const reply=session.tool(job,'silent',{reason:'纯通知，与本人职责无关'});
    expect(reply.includes('silent')).toBe(true);expect(job.silent).toBe(true);

    // 静默后 run 不发布：完整流程验证。
    const store2=new WorkbenchStore(join(dir,'db2'));
    try{
      const manager2=store2.create('/b',{name:'总监',role:'管理',kind:'bot',members:[]});
      const team2=store2.createTeam('/b',manager2,{name:'团队二',purpose:'协作',members:[{name:'研究员',role:'研究'}]});
      const s2=new ConversationSession('/b','root2',store2);
      s2.human(team2.group,'@研究员 纯通知广播，无需回应');
      const result=await s2.run(async(job)=>{
        const silentJob=s2.tool(job,'silent',{reason:'测试静默'});
        expect(silentJob.includes('silent')).toBe(true);
        return {text:'internal-only',artifacts:[]};
      },()=>{});
      expect(result.status).toBe('silent');
      expect(result.text).not.toContain('internal-only');
      const messages=store2.messages(team2.group.id);
      expect(messages.some(m=>m.content==='internal-only')).toBe(false);
      const jobs=store2.jobs(team2.group.id);
      expect(jobs.some(j=>j.status==='silent')).toBe(true);
    }finally{store2.close();}
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

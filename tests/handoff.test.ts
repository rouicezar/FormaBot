import {test,expect,it} from 'vitest';
import {mkdtempSync,mkdirSync,rmSync,readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {WorkbenchStore} from '../src/state/workbench';
import {ConversationSession} from '../src/runtime/conversation-session';

test('request_handoff shares only the necessary package with the target conversation',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'handoff-')),store=new WorkbenchStore(join(dir,'db'));
  try{
    const manager=store.create('/a',{name:'总监',role:'管理',kind:'bot',members:[]});
    const team=store.createTeam('/a',manager,{name:'移交组',purpose:'协作',members:[{name:'研究员',role:'研究'}]});
    const session=new ConversationSession('/a','private-root',store);
    const privateBot=team.manager!;
    session.human(privateBot,'私聊里的完整上下文：秘密信息 SECRET-CONTEXT');
    const job={id:'j0',conversation:privateBot,member:privateBot,instruction:'用户要求委派'};
    expect(()=>session.tool(job,'request_handoff',{target:'移交组',member:'不存在的成员',task:'做点事'})).toThrow(/参与者/);
    expect(()=>session.tool(job,'request_handoff',{target:'',member:'研究员',task:'x'})).toThrow(/指定委派目标/);
    const reply=session.tool(job,'request_handoff',{target:'移交组',member:'研究员',task:'整理研究报告',context:'用户特别关注结论'});
    expect(reply.includes('"delivered":true')).toBe(true);
    // 委派已入队到目标群，包内不含私聊历史（包保存在 job 指令中）
    const jobs=store.jobs(team.group.id);
    const handoff=jobs.find(j=>j.memberName==='研究员'&&j.instruction.includes('整理研究报告'));
    expect(handoff).toBeTruthy();
    expect(handoff!.instruction).toContain('用户已批准');
    expect(handoff!.instruction).not.toContain('SECRET-CONTEXT');
    expect(handoff!.instruction).toContain('整理研究报告');
  }finally{rmSync(dir,{recursive:true,force:true});}
});

import {createHash} from 'node:crypto';

it('delivery ledger: records facts and blocks completed when a delivered file disappears',async()=>{
  const dir=mkdtempSync(resolve('.tmp/ledger-')),store=new WorkbenchStore(join(dir,'db'));
  try{
    store.ensure('/ws');
    const file=join(dir,'outputs/report.md');
    mkdirSync(join(dir,'outputs'),{recursive:true});
    writeFileSync(file,'交付内容');
    const digest=createHash('sha256').update(readFileSync(file)).digest('hex');
    store.recordDelivery('job-ledger',file,digest,Buffer.byteLength('交付内容'));
    expect(store.ledgerFor('job-ledger')).toHaveLength(1);
    expect(store.verifyDeliveries('job-ledger')).toEqual({missing:[],empty:[]});
    unlinkSync(file);
    expect(store.verifyDeliveries('job-ledger')).toEqual({missing:[file],empty:[]});
    store.close();
  }finally{rmSync(dir,{recursive:true,force:true});}
});

it('task_result completed is rejected when registered deliverables are missing',async()=>{
  const dir=mkdtempSync(resolve('.tmp/ledger2-')),store=new WorkbenchStore(join(dir,'db'));
  try{
    const manager=store.create('/a',{name:'总监',role:'管理',kind:'bot',members:[]});
    const team=store.createTeam('/a',manager,{name:'账本组',purpose:'协作',members:[{name:'写手',role:'写作'}]});
    const session=new ConversationSession('/a','root',store);
    const job={id:'jw',conversation:team.group,member:team.members[0]!,instruction:'写报告'};
    const file=join(dir,'fake-outside.md');
    writeFileSync(file,'内容');
    store.recordDelivery(job.id,file,createHash('sha256').update('内容').digest('hex'),6);
    expect(()=>session.tool(job,'task_result',{status:'completed',summary:'完成了'})).not.toThrow();
    const file2=join(dir,'fake-gone.md');
    writeFileSync(file2,'内容2');
    store.recordDelivery('jw2',file2,createHash('sha256').update('内容2').digest('hex'),6);
    const job2:import('../src/runtime/conversation-session').MemberJob={id:'jw2',conversation:team.group,member:team.members[0]!,instruction:'再写'};
    unlinkSync(file2);
    expect(()=>session.tool(job2,'task_result',{status:'completed',summary:'声称完成'})).toThrow(/交付文件已不存在/);
    expect(job2.report).toBeUndefined();
  }finally{rmSync(dir,{recursive:true,force:true});}
});

import {test,expect} from 'vitest';
import {mkdtempSync,rmSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {WorkbenchStore} from '../src/state/workbench';
import {ConversationSession, type MemberJob} from '../src/runtime/conversation-session';

test('empty or whitespace-only deliverables reject completed; missing files still rejected',()=>{
  const dir=mkdtempSync(join(tmpdir(),'e07b-empty-')),store=new WorkbenchStore(join(dir,'db'));
  try{
    const ws=mkdtempSync(join(tmpdir(),'e07b-ws-'));
    const good=join(ws,'good.md'),blank=join(ws,'blank.md'),space=join(ws,'space.md');
    writeFileSync(good,'正文');writeFileSync(blank,'');writeFileSync(space,'   \n\t  ');
    store.recordDelivery('j1',good,'x',5);store.recordDelivery('j1',blank,'x',0);
    expect(store.verifyDeliveries('j1')).toEqual({missing:[],empty:[blank]});
    store.recordDelivery('j2',space,'x',8);
    expect(store.verifyDeliveries('j2')).toEqual({missing:[],empty:[space]});
    store.recordDelivery('j3',join(ws,'gone.md'),'x',10);
    expect(store.verifyDeliveries('j3')).toEqual({missing:[join(ws,'gone.md')],empty:[]});
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

test('jobs that used web_search must cite a source link and date before reporting completed',()=>{
  const dir=mkdtempSync(join(tmpdir(),'e07b-src-')),store=new WorkbenchStore(join(dir,'db'));
  try{
    store.create('/a',{name:'总监',role:'管理',kind:'bot',members:[]});
    const [manager,member]=store.list('/a');
    const session=new ConversationSession('/a','root',store);
    const job:MemberJob={id:'j',conversation:manager,member,instruction:'研究'};
    expect(()=>session.tool({...job,searched:true},'task_result',{status:'completed',summary:'结论就是这样的。'})).toThrow(/来源.*链接.*日期|至少一个原文链接/);
    // 报告自带来源+日期 → 放行。
    expect(session.tool({...job,searched:true},'task_result',{status:'completed',summary:'结论见 https://example.com/a（2026-01 发布）。'})).toContain('"recorded":true');
    // 来源写在交付文件里 → 放行。
    const ws=mkdtempSync(join(tmpdir(),'e07b-ws-'));const file=join(ws,'r.md');
    writeFileSync(file,'依据：https://example.com/src，2025年12月。');
    store.recordDelivery('j2',file,'x',40);
    expect(session.tool({...job,id:'j2',searched:true},'task_result',{status:'completed',summary:'见交付文件。'})).toContain('"recorded":true');
    // 未使用搜索的任务不受此门约束。
    expect(session.tool({...job,id:'j3'},'task_result',{status:'completed',summary:'无来源结论。'})).toContain('"recorded":true');
    // blocked 不要求来源。
    expect(session.tool({...job,id:'j4',searched:true},'task_result',{status:'blocked',summary:'搜索不可用。'})).toContain('"recorded":true');
    expect(readFileSync(file,'utf8')).toContain('2025年12月');
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

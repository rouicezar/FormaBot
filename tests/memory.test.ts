import { test, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { WorkbenchStore } from '../src/state/workbench';
import { ConversationSession, type MemberJob } from '../src/runtime/conversation-session';

const open=()=>{const dir=mkdtempSync(join(tmpdir(),'formabot-memory-')),file=join(dir,'wb.sqlite');return {dir,file,store:new WorkbenchStore(file)};};

test('migration creates bot_memories at user_version 4 idempotently',()=>{
  const opened=open();const {dir,file}=opened;let store=opened.store;
  try{
    store.ensure('/space');store.close();
    const db=new DatabaseSync(file);
    expect(Number(db.prepare('PRAGMA user_version').get()!.user_version)).toBe(4);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='bot_memories'").get()).toBeTruthy();
    db.exec(`CREATE TABLE IF NOT EXISTS bot_memories(id INTEGER PRIMARY KEY AUTOINCREMENT, bot_id TEXT NOT NULL, conversation_id TEXT NOT NULL, content TEXT NOT NULL, source_kind TEXT NOT NULL, source_ref TEXT NOT NULL, created_at TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, supersedes INTEGER);
      CREATE INDEX IF NOT EXISTS bot_memories_scope ON bot_memories(bot_id, conversation_id, active);
      PRAGMA user_version=4;`);
    db.close();
    const again=new WorkbenchStore(file);again.close(); // reopen must not fail
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('memory scope, correction chain and validation',()=>{
  const opened=open();const {dir,file}=opened;let store=opened.store;
  try{
    store.ensure('/space');const bot=store.list('/space')[0]!;
    const conv=store.create('/space',{kind:'bot',name:'研究员',role:'研究',members:[]});
    const other=store.create('/space',{kind:'bot',name:'编辑',role:'编辑',members:[]});
    const first=store.addMemory({workspace:'/space',botId:conv,conversationId:conv,content:'发布前必须经过用户确认。',sourceKind:'user_message',sourceRef:'job-1'});
    expect(store.memories(conv,conv).map(m=>m.id)).toEqual([first]);
    // 范围隔离：同 Bot 的其他会话查不到；其他 Bot 在同一会话也查不到。
    expect(store.memories(conv,other)).toEqual([]);
    expect(store.memories(other,conv)).toEqual([]);
    // 纠正链：新记录使旧记录失活但保留，链可追溯。
    const second=store.addMemory({workspace:'/space',botId:conv,conversationId:conv,content:'2026 年起发布前只需用户口头同意。',sourceKind:'user_message',sourceRef:'job-2',supersedes:first});
    expect(store.memories(conv,conv).map(m=>m.id)).toEqual([second]);
    const chain=store.memoryChain(second);
    expect(chain.map(m=>m.content)).toEqual(['发布前必须经过用户确认。','2026 年起发布前只需用户口头同意。']);
    expect(chain[0].active).toBe(false);
    // 非法纠正：跨 Bot、跨会话、重复纠正均拒绝。
    expect(()=>store.addMemory({workspace:'/space',botId:other,conversationId:conv,content:'x',sourceKind:'user_message',sourceRef:'j',supersedes:first})).toThrow();
    expect(()=>store.addMemory({workspace:'/space',botId:conv,conversationId:other,content:'x',sourceKind:'user_message',sourceRef:'j',supersedes:first})).toThrow();
    expect(()=>store.addMemory({workspace:'/space',botId:conv,conversationId:conv,content:'x',sourceKind:'user_message',sourceRef:'j',supersedes:first})).toThrow();
    expect(()=>store.addMemory({workspace:'/space',botId:conv,conversationId:conv,content:'',sourceKind:'user_message',sourceRef:'j'})).toThrow();
    expect(()=>store.addMemory({workspace:'/space',botId:conv,conversationId:conv,content:'x'.repeat(2001),sourceKind:'user_message',sourceRef:'j'})).toThrow();
    // 手动停用/删除按工作空间校验。
    store.deactivateMemory('/space',second);
    expect(store.memories(conv,conv)).toEqual([]);
    expect(()=>store.deactivateMemory('/other-space',first)).toThrow();
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

test('deleting a bot or its group removes scoped memories; restart preserves the rest',()=>{
  const opened=open();const {dir,file}=opened;let store=opened.store;
  try{
    store.ensure('/space');const bot=store.list('/space')[0]!;
    const other=store.create('/space',{kind:'bot',name:'编辑',role:'编辑',members:[]});
    const group=store.create('/space',{kind:'group',name:'内容组',role:'协同',members:[bot.id,other]});
    store.addMemory({workspace:'/space',botId:bot.id,conversationId:bot.id,content:'私聊偏好：输出中文。',sourceKind:'user_message',sourceRef:'j1'});
    store.addMemory({workspace:'/space',botId:bot.id,conversationId:group,content:'群内约定：周五交稿。',sourceKind:'user_message',sourceRef:'j2'});
    store.close();store=new WorkbenchStore(file); // 重启保留
    expect(store.workspaceMemories('/space')).toHaveLength(2);
    store.deleteGroup('/space',group);
    expect(store.workspaceMemories('/space').map(m=>m.content)).toEqual(['私聊偏好：输出中文。']);
    store.deleteBot('/space',bot.id);
    expect(store.workspaceMemories('/space')).toEqual([]);
    expect(store.list('/space').some(c=>c.id===other)).toBe(true);
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

test('remember tool records conversation-scoped memories and supports corrections',()=>{
  const dir=mkdtempSync(join(tmpdir(),'formabot-remember-')),store=new WorkbenchStore(join(dir,'db'));
  try{
    const manager=store.create('/a',{name:'总监',role:'管理',kind:'bot',members:[]});
    const team=store.createTeam('/a',manager,{name:'团队',purpose:'协作',members:[{name:'编辑',role:'写作'}]});
    const group=team.group,member=team.members[0]!;
    const session=new ConversationSession('/a','root',store);
    const job:MemberJob={id:'job',conversation:group,member,instruction:'任务'};

    expect(()=>session.tool(job,'remember',{})).toThrow(/请提供要记住的事实/);
    expect(()=>session.tool(job,'remember',{content:'x'.repeat(2001)})).toThrow(/2000 字以内/);
    expect(()=>session.tool(job,'remember',{content:'事实',supersedes:999})).toThrow(/记忆不存在|不属于本会话|已被纠正|无效/);

    const reply=session.tool(job,'remember',{content:'未经用户确认不得对外发布。'});
    expect(reply.includes('"recorded":true')).toBe(true);
    const stored=store.memories(member.id,group.id);
    expect(stored).toHaveLength(1);
    expect(stored[0].content).toBe('未经用户确认不得对外发布。');
    expect(stored[0].sourceKind).toBe('bot_task');
    expect(stored[0].sourceRef).toBe('job');
    // 纠正：引用旧记忆编号，旧记录失活但链保留。
    session.tool(job,'remember',{content:'2026 年起允许发布到测试站点。',supersedes:stored[0].id});
    expect(store.memories(member.id,group.id).map(m=>m.content)).toEqual(['2026 年起允许发布到测试站点。']);
    expect(store.memoryChain(store.memories(member.id,group.id)[0].id)).toHaveLength(2);
    // 范围隔离：即使同一会话的其他 Bot 也查不到；私聊会话天然隔离。
    expect(store.memories(team.manager!.id,group.id)).toEqual([]);
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

test('prompt injects memories outside history truncation and never leaks private memory into group prompt',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'formabot-inject-')),store=new WorkbenchStore(join(dir,'db'));
  try{
    const manager=store.create('/a',{name:'总监',role:'管理',kind:'bot',members:[]});
    const team=store.createTeam('/a',manager,{name:'团队',purpose:'协作',members:[{name:'研究员',role:'研究'}]});
    const group=team.group,member=team.members[0]!;
    const session=new ConversationSession('/a','root',store);
    // 构造 80 条历史，使 slice(-70) 截断早期消息。
    for(let i=0;i<80;i++)store.add(group.id,'你',`普通消息 ${i}：早期约束 should-be-truncated-${i}`,undefined,{authorKind:'human'});
    const job:MemberJob={id:'j0',conversation:group,member,instruction:'占位'};
    session.tool(job,'remember',{content:'未经确认不得发布。'});
    // 私聊会话中的另一条记忆：绝不能进入群聊 prompt。
    const privJob:MemberJob={id:'jp',conversation:team.manager!,member:team.manager!,instruction:'私聊'};
    const privSession=new ConversationSession('/a','root',store);
    privSession.tool(privJob,'remember',{content:'私聊专属：我的 SECRET-PREF。'});
    let groupPrompt='',privatePrompt='';
    session.human(group,'@研究员 新任务');
    await session.run(async(j,prompt)=>{groupPrompt=prompt;return {text:'好的',artifacts:[]};},()=>{});
    expect(groupPrompt).toContain('【记忆');
    expect(groupPrompt).toContain('未经确认不得发布。');
    expect(groupPrompt).not.toContain('SECRET-PREF');
    expect(groupPrompt.indexOf('【记忆')).toBeLessThan(groupPrompt.indexOf('以下仅为本会话共享历史'));
    expect(groupPrompt).not.toContain('should-be-truncated-0'); // 早期消息确实被截断
    expect(groupPrompt).toContain('should-be-truncated-79');
    // 私聊 prompt 注入私聊记忆，不注入群记忆。
    privSession.human(team.manager!,'新任务');
    await privSession.run(async(j,prompt)=>{privatePrompt=prompt;return {text:'好的',artifacts:[]};},()=>{});
    expect(privatePrompt).toContain('SECRET-PREF');
    expect(privatePrompt).not.toContain('未经确认不得发布。');
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

test('main-process teamTool route wires every session tool (wiring regression guard)',async()=>{
  // E08a-2 live 测试曾抓获：main.ts 的 teamTool 路由漏掉 remember，静默落到 list_team 兜底。
  const source=await import('node:fs').then(fs=>fs.promises.readFile(new URL('../src/desktop/main.ts',import.meta.url),'utf8'));
  for(const tool of ['group_message','assign_tasks','task_result','request_role_change','silent','remember']){
    expect(source,`main.ts must route ${tool} to session.tool`).toContain(`'${tool}'`);
  }
  expect(source,'main.ts must mark jobs that used web_search (E07b source gate)').toContain('执行 web_search');
  expect(source,'document-driven create_team must require user approval (E09e)').toContain('按文档建队审批');
});

test('member model binding persists, validates and clears back to global',()=>{
  const opened2=open();const {dir,file}=opened2;let store=opened2.store;
  try{
    store.ensure('/space');const [bot]=store.list('/space');
    expect(store.memberModel('/space',bot.id)).toBeUndefined();
    store.setMemberModel('/space',bot.id,{provider:'deepseek',model:'deepseek-v4-flash'});
    expect(store.memberModel('/space',bot.id)).toEqual({provider:'deepseek',model:'deepseek-v4-flash'});
    expect(store.memberModels('/space')).toEqual({[bot.id]:{provider:'deepseek',model:'deepseek-v4-flash'}});
    store.close();store=new WorkbenchStore(file);
    expect(store.memberModel('/space',bot.id)?.model).toBe('deepseek-v4-flash');
    expect(()=>store.setMemberModel('/space',bot.id,{provider:'deepseek',model:'bad model!'})).toThrow(/模型名称无效/);
    expect(()=>store.setMemberModel('/space','no-such-bot',{provider:'deepseek',model:'m'})).toThrow(/不属于/);
    store.setMemberModel('/space',bot.id,null);
    expect(store.memberModel('/space',bot.id)).toBeUndefined();
    expect(store.memberModels('/space')).toEqual({});
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

test('scale indexes cover hot query paths (F12): plans use indexes, not full scans',()=>{
  const opened3=open();const {dir,file}=opened3;let store=opened3.store;
  try{
    store.ensure('/space');const [bot]=store.list('/space');
    const group=store.create('/space',{kind:'group',name:'规模组',role:'协同',members:[bot.id]});
    // 构造规模数据：多个会话、大量消息与任务。
    for(let c=0;c<10;c++){const g=store.create('/space',{kind:'group',name:`规模组 ${c}`,role:'协同',members:[bot.id]});for(let i=0;i<300;i++)store.add(g,'你',`填充消息 ${c}-${i}`,undefined,{authorKind:'human'});for(let i=0;i<50;i++)store.queueJob(`job-${c}-${i}`,'root',g,bot.id,'任务');}
    for(let i=0;i<400;i++)store.add(group,'你',`本体消息 ${i}`,undefined,{authorKind:'human'});
    store.close();
    const db=new DatabaseSync(file);
    const plan=(sql:string,params:(string|number)[])=>db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params).map(r=>String(r.detail));
    const msgPlan=plan('SELECT * FROM (SELECT * FROM messages WHERE conversation=? ORDER BY id DESC LIMIT 100) ORDER BY id',[group]);
    expect(msgPlan.some(d=>d.includes('messages_conversation')||d.includes('USING INDEX'))).toBe(true);
    const jobPlan=plan('SELECT j.*,c.name AS memberName FROM group_jobs j JOIN conversations c ON c.id=j.member WHERE j.conversation=? ORDER BY j.rowid DESC LIMIT 80',[group]);
    expect(jobPlan.some(d=>d.includes('group_jobs_conversation')||d.includes('USING INDEX'))).toBe(true);
    db.close();
    store=new WorkbenchStore(file); // 重启幂等
    expect(store.messages(group).length).toBeLessThanOrEqual(100);
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

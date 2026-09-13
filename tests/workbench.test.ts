import { test, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkbenchStore } from '../src/state/workbench';
test('workspace, private chats and group history remain isolated across restart',()=>{
  const dir=mkdtempSync(join(tmpdir(),'formabot-chat-')),file=join(dir,'chat.sqlite');let store=new WorkbenchStore(file);
  try{
    store.ensure('/space/a');const bot=store.list('/space/a')[0];
    const b=store.create('/space/a',{kind:'bot',name:'编辑',role:'编辑稿件',members:[]});
    const group=store.create('/space/a',{kind:'group',name:'内容组',role:'协同工作',members:[bot.id,b]});
    store.add(bot.id,'你','private marker','private-task');store.finish('private-task',bot.name,'私聊回复',['/space/a/private.md']);
    store.add(group,'你','group marker','group-task');store.finish('group-task','编辑','群回复',['/space/a/public.md']);
    store.ensure('/space/b');expect(store.list('/space/b')).toHaveLength(1);
    expect(()=>store.select('/space/b',group)).toThrow();
    expect(()=>store.create('/space/b',{kind:'group',name:'无效',role:'',members:[b]})).toThrow();
    store.saveLayout({left:270,right:490,leftOpen:false,rightOpen:true});store.close();store=new WorkbenchStore(file);
    expect(store.selected('/space/a')?.id).toBe(group);expect(store.messages(group).map(m=>m.content).join()).not.toContain('private marker');
    expect(store.messages(b)).toEqual([]);expect(store.messages(bot.id)[0].content).toBe('private marker');
    expect(store.artifact('/space/b','group-task','/space/a/public.md')).toBe(false);expect(store.artifact('/space/a','group-task','/space/a/public.md')).toBe(true);
    expect(store.layout()).toEqual({left:270,right:490,leftOpen:false,rightOpen:true});
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
test('agent team creation persists exact roster and coordinator, is atomic and retry-safe',()=>{
  const dir=mkdtempSync(join(tmpdir(),'formabot-team-')),file=join(dir,'chat.sqlite');let store=new WorkbenchStore(file);
  const names=['情报侦察员','选题策划师','口播稿书写员','视频策划员','数据复盘师'];
  try{
    store.ensure('/a');const manager=store.list('/a')[0];const input={name:'抖音内容团队',purpose:'生产并复盘抖音内容',members:names.map(name=>({name,role:`负责${name}岗位的实际工作、产出与汇报`}))};
    expect(()=>store.createTeam('/b',manager.id,input)).toThrow();
    const before=store.list('/a').length;
    expect(()=>store.createTeam('/a',manager.id,{...input,members:[input.members[0],{name:'无职责',role:''}]})).toThrow();expect(store.list('/a')).toHaveLength(before);
    const team=store.createTeam('/a',manager.id,input);expect(team.members.map(m=>m.name)).toEqual(names);expect(team.group.managerId).toBe(manager.id);expect(team.group.members).toHaveLength(5);
    expect(team.members.every(m=>m.role.includes(manager.name))).toBe(true);expect(store.selected('/a')?.id).toBe(manager.id);
    expect(store.createTeam('/a',manager.id,input).group.id).toBe(team.group.id);expect(store.list('/a')).toHaveLength(7);
    expect(()=>store.createTeam('/a',manager.id,{...input,members:input.members.slice(0,4)})).toThrow();expect(store.list('/a')).toHaveLength(7);
    store.close();store=new WorkbenchStore(file);expect(store.team('/a',team.group.id).members).toHaveLength(5);expect(store.createTeam('/a',manager.id,input).group.id).toBe(team.group.id);
    expect(()=>store.team('/b',team.group.id)).toThrow();expect(store.list('/b')).toHaveLength(0);
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

test('names are unique per workspace and kind across creation, rename, team creation and restart',()=>{
  const dir=mkdtempSync(join(tmpdir(),'formabot-names-')),file=join(dir,'db');let store=new WorkbenchStore(file);
  try{
    const bot=store.create('/a',{kind:'bot',name:'Editor',role:'写作',members:[]});
    expect(()=>store.create('/a',{kind:'bot',name:' editor ',role:'研究',members:[]})).toThrow('已存在');
    const other=store.create('/a',{kind:'bot',name:'研究员',role:'研究',members:[]});
    expect(()=>store.update('/a',other,'EDITOR','改岗')).toThrow('已存在');
    expect(store.list('/a').find(c=>c.id===other)?.role).toBe('研究');
    store.update('/a',bot,'Editor','新职责');
    const group=store.create('/a',{kind:'group',name:'工作群',role:'协作',members:[bot]});
    expect(()=>store.create('/a',{kind:'group',name:' 工作群 ',role:'',members:[other]})).toThrow('已存在');
    const second=store.create('/a',{kind:'group',name:'第二群',role:'',members:[other]});
    expect(()=>store.update('/a',second,'工作群','',[bot])).toThrow('已存在');
    expect(store.team('/a',second).group.members).toEqual([other]);
    const before=store.list('/a').length;
    expect(()=>store.createTeam('/a',other,{name:'新团队',purpose:'',members:[{name:'新成员',role:'写作'},{name:'editor',role:'写作'}]})).toThrow('已存在');
    expect(()=>store.createTeam('/a',other,{name:'工作群',purpose:'',members:[{name:'新成员',role:'写作'}]})).toThrow('已存在');
    expect(()=>store.createTeam('/a',other,{name:'新团队',purpose:'',members:[{name:'Bot',role:'写作'},{name:'bot',role:'研究'}]})).toThrow('不能重复');
    expect(store.list('/a')).toHaveLength(before);
    store.create('/b',{kind:'bot',name:'Editor',role:'',members:[]});
    store.create('/a',{kind:'group',name:'Editor',role:'',members:[bot]});
    store.close();store=new WorkbenchStore(file);
    expect(()=>store.create('/a',{kind:'bot',name:'Editor',role:'',members:[]})).toThrow('已存在');
    expect(store.team('/a',group).group.name).toBe('工作群');
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

test('bot deletion removes owned records and memberships, preserves peers, and survives restart',()=>{
 const dir=mkdtempSync(join(tmpdir(),'formabot-delete-')),file=join(dir,'db');let store=new WorkbenchStore(file);
 try{
  const manager=store.create('/a',{kind:'bot',name:'总监',role:'协调',members:[]});
  const team=store.createTeam('/a',manager,{name:'团队',purpose:'协作',members:[{name:'编辑',role:'写稿'},{name:'研究',role:'研究'}]});const bot=team.members[0],peer=team.members[1];
  store.add(bot.id,'你','私聊资料','private-root');store.deliver(bot.id,bot.name,'私人回复','private-job',[]);
  store.queueJob('private-job','private-root',bot.id,bot.id,'私聊任务');store.jobStatus('private-job','completed');
  store.queueJob('group-job','group-root',team.group.id,bot.id,'群任务');store.jobStatus('group-job','completed');
  store.deliver(team.group.id,bot.name,'本人成果','group-job',[]);store.deliver(team.group.id,'改名前的编辑','历史姓名成果','group-job',[]);store.deliver(team.group.id,peer.name,'他人成果','peer-job',[]);
  store.select('/a',bot.id);expect(()=>store.deleteBot('/other',bot.id)).toThrow();
  const removed=store.deleteBot('/a',bot.id);expect(removed.jobIds.sort()).toEqual(['group-job','private-job']);expect(removed.privateRoots).toEqual(['private-root']);
  expect(store.messages(bot.id)).toEqual([]);expect(store.messages(team.group.id).map(m=>m.content)).toEqual(['他人成果']);expect(store.jobs(team.group.id)).toEqual([]);
  expect(store.team('/a',team.group.id).group.members).toEqual([peer.id]);expect(store.selected('/a')?.id).not.toBe(bot.id);
  store.close();store=new WorkbenchStore(file);expect(store.pendingBotCleanup()).toHaveLength(1);store.finishBotCleanup(bot.id);expect(store.pendingBotCleanup()).toEqual([]);
  store.deleteBot('/a',manager);expect(store.team('/a',team.group.id).manager).toBeUndefined();expect(store.team('/a',team.group.id).members[0].id).toBe(peer.id);
  const only=store.create('/only',{kind:'bot',name:'独立',role:'',members:[]});store.deleteBot('/only',only);store.ensure('/only');expect(store.list('/only')).toEqual([]);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
test('active tasks prevent bot deletion without partial changes',()=>{
 const dir=mkdtempSync(join(tmpdir(),'formabot-delete-active-'));const store=new WorkbenchStore(join(dir,'db'));
 try{const bot=store.create('/a',{kind:'bot',name:'编辑',role:'',members:[]});store.queueJob('job','root',bot,bot,'工作');expect(()=>store.deleteBot('/a',bot)).toThrow('停止');expect(store.list('/a')).toHaveLength(1);expect(store.pendingBotCleanup()).toEqual([]);}finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

test('sidebar actions persist and copies have new identity and no chat history',()=>{
 const dir=mkdtempSync(join(tmpdir(),'sidebar-')),file=join(dir,'db');let store=new WorkbenchStore(file);
 try{
  const bot=store.create('/a',{kind:'bot',name:'编辑',role:'写稿',members:[]});store.add(bot,'你','私人消息');
  store.sidebarAction('/a',bot,'pin',true);store.sidebarAction('/a',bot,'section','内容部');store.sidebarAction('/a',bot,'unread',true);store.sidebarAction('/a',bot,'hide',true);
  const copy=store.sidebarAction('/a',bot,'duplicate');expect(copy).not.toBe(bot);expect(store.messages(copy)).toEqual([]);expect(store.list('/a').find(c=>c.id===copy)?.name).toBe('编辑 副本');
  expect(store.sidebarAction('/a',bot,'duplicate')).not.toBe(copy);expect(()=>store.sidebarAction('/b',bot,'pin',true)).toThrow();
  store.close();store=new WorkbenchStore(file);expect(store.list('/a').find(c=>c.id===bot)?.sidebar).toEqual({pinned:true,section:'内容部',unread:true,hidden:true});
  store.select('/a',bot);expect(store.list('/a').find(c=>c.id===bot)?.sidebar?.unread).toBe(false);store.sidebarAction('/a',bot,'hide',false);expect(store.list('/a').find(c=>c.id===bot)?.sidebar?.hidden).toBe(false);
  const team=store.createTeam('/a',bot,{name:'团队',purpose:'协作',members:[{name:'研究员',role:'研究'}]});const groupCopy=store.sidebarAction('/a',team.group.id,'duplicate');expect(store.team('/a',groupCopy).manager?.id).toBe(bot);expect(store.team('/a',groupCopy).group.members).toEqual(team.group.members);
  store.deliver(team.group.id,'研究员','群结果','group-job',[]);store.queueJob('group-job','root',team.group.id,team.members[0].id,'样例');store.jobStatus('group-job','completed');
  store.queueJob('peer-group-job','root',groupCopy,team.members[0].id,'其他群任务');store.jobStatus('peer-group-job','completed');expect(store.deleteGroup('/a',team.group.id).privateRoots).toEqual([]);expect(store.messages(team.group.id)).toEqual([]);expect(store.list('/a').some(c=>c.id===team.members[0].id)).toBe(true);expect(store.messages(bot)).toHaveLength(1);expect(store.team('/a',groupCopy).group.members).toEqual(team.group.members);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

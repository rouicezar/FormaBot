import {test,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {WorkbenchStore} from '../src/state/workbench';
import {ConversationSession} from '../src/runtime/conversation-session';
const temporary=()=>mkdtempSync(join(tmpdir(),'identity-'));
function legacy(file:string){const db=new DatabaseSync(file);db.exec(`PRAGMA journal_mode=WAL;
 CREATE TABLE conversations(id TEXT PRIMARY KEY,workspace TEXT,name TEXT,role TEXT,kind TEXT,members TEXT);
 CREATE TABLE messages(id INTEGER PRIMARY KEY,conversation TEXT,speaker TEXT,content TEXT,task TEXT,artifacts TEXT DEFAULT '[]');
 CREATE TABLE group_jobs(id TEXT PRIMARY KEY,root TEXT,conversation TEXT,member TEXT,instruction TEXT,status TEXT,error TEXT DEFAULT '');
 INSERT INTO conversations VALUES('a','/w','同名','写稿','bot','[]'),('b','/w','同名','审核','bot','[]'),('g','/w','群','协作','group','["a","b"]');
 INSERT INTO group_jobs VALUES('ja','root','g','a','写稿','completed',''),('jb','root','g','b','审核','completed','');
 INSERT INTO messages(conversation,speaker,content,task) VALUES('g','旧名字','写稿结果','ja'),('g','同名','审核结果','jb'),('g','同名','无任务证据',NULL),('g','你','用户消息','root');`);return db;}
test('legacy migration snapshots committed WAL, preserves ambiguous history and is idempotent',()=>{
 const dir=temporary(),file=join(dir,'db'),old=legacy(file);let store:WorkbenchStore|undefined;
 try{
  // Keep the old connection open so migration must capture WAL rather than copy just the main file.
  store=new WorkbenchStore(file);expect(store.messages('g').map(m=>[m.authorKind,m.authorId,m.roleVersion])).toEqual([['bot','a',undefined],['bot','b',undefined],['unknown',undefined,undefined],['unknown',undefined,undefined]]);
  expect(store.roleHistory('/w','a')[0]).toMatchObject({version:1,role:'写稿',source:'migration'});
  const files=readdirSync(join(dir,'backups'));expect(files).toHaveLength(1);const snapshot=join(dir,'backups',files[0]);expect(statSync(snapshot).mode&0o777).toBe(0o600);
  const backup=new DatabaseSync(snapshot);expect(backup.prepare('SELECT COUNT(*) AS n FROM messages').get()?.n).toBe(4);expect(backup.prepare('PRAGMA user_version').get()?.user_version).toBe(0);backup.close();
  store.close();store=new WorkbenchStore(file);expect(readdirSync(join(dir,'backups'))).toHaveLength(1);expect(store.messages('g')).toHaveLength(4);
  store.update('/w','a','新名字','写稿');expect(store.messages('g')[0]).toMatchObject({speaker:'旧名字',authorId:'a'});
  store.deleteBot('/w','a');expect(store.messages('g').map(m=>m.content)).toEqual(['审核结果','无任务证据','用户消息']);
 }finally{store?.close();old.close();rmSync(dir,{recursive:true,force:true});}
});
test('migration errors roll back and preserve a recoverable snapshot; future schemas refuse writes',()=>{
 const dir=temporary(),file=join(dir,'db'),old=legacy(file);
 try{old.exec('ALTER TABLE messages ADD COLUMN author_kind TEXT');expect(()=>new WorkbenchStore(file)).toThrow();expect(old.prepare("SELECT 1 FROM sqlite_master WHERE name='bot_role_versions'").get()).toBeUndefined();expect(old.prepare('SELECT COUNT(*) n FROM messages').get()?.n).toBe(4);expect(old.prepare('PRAGMA user_version').get()?.user_version).toBe(0);expect(readdirSync(join(dir,'backups'))).toHaveLength(1);old.exec('PRAGMA user_version=99');expect(()=>new WorkbenchStore(file)).toThrow('更新版本');expect(readdirSync(join(dir,'backups'))).toHaveLength(1);
 }finally{old.close();rmSync(dir,{recursive:true,force:true});}
});
test('roles are versioned atomically; rename, copy, team creation, deletion and restart preserve identity semantics',()=>{
 const dir=temporary(),file=join(dir,'db');let store=new WorkbenchStore(file);
 try{
  const id=store.create('/w',{name:'编辑',role:'写稿',kind:'bot',members:[]});
  store.deliver(id,'编辑','旧回复','old',[],{authorKind:'bot',authorId:id,roleVersion:1});store.update('/w',id,'撰稿员','写稿');expect(store.roleHistory('/w',id)).toHaveLength(1);
  store.update('/w',id,'撰稿员','审核稿件');store.update('/w',id,'撰稿员','审核稿件');expect(store.roleHistory('/w',id).map(v=>v.version)).toEqual([2,1]);expect(()=>store.update('/w',id,'撰稿员','旧表单覆盖',undefined,1)).toThrow('职责已更新');
  const copy=store.sidebarAction('/w',id,'duplicate');expect(store.roleHistory('/w',copy)[0]).toMatchObject({version:1,source:'duplicate',role:'审核稿件'});
  expect(()=>store.update('/w',id,'撰稿员 副本','不应保存')).toThrow();expect(store.roleHistory('/w',id)).toHaveLength(2);
  const team=store.createTeam('/w',id,{name:'团队',purpose:'工作',members:[{name:'研究员',role:'调研'}]});expect(store.roleHistory('/w',team.members[0].id)[0]).toMatchObject({version:1,source:'team_create',actorId:id});
  expect(()=>store.roleHistory('/other',id)).toThrow();store.close();store=new WorkbenchStore(file);
  expect(store.list('/w').find(c=>c.id===id)).toMatchObject({id,name:'撰稿员',role:'审核稿件',roleVersion:2});expect(store.messages(id)[0]).toMatchObject({speaker:'编辑',authorId:id,roleVersion:1});
  store.deleteBot('/w',id);const db=new DatabaseSync(file);expect(db.prepare('SELECT 1 FROM bot_role_versions WHERE bot_id=?').get(id)).toBeUndefined();db.close();
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
test('queued jobs refresh authoritative roles while running jobs retain their pinned version and authorship',async()=>{
 const dir=temporary(),store=new WorkbenchStore(join(dir,'db'));
 try{
  const id=store.create('/w',{name:'编辑',role:'写稿',kind:'bot',members:[]}),group=store.create('/w',{name:'群',role:'协作',kind:'group',members:[id]});
  const session=new ConversationSession('/w','root',store);session.human(store.team('/w',group).group,'处理素材',id);
  store.update('/w',id,'审核员','检查事实与证据');
  await session.run(async(job,prompt)=>{expect(job.member).toMatchObject({id,roleVersion:2,role:'检查事实与证据'});expect(prompt).toContain('当前权威职责：检查事实与证据');expect(store.jobs(group)[0].roleVersion).toBe(2);store.update('/w',id,'数据员','分析数据');return {text:'缺少来源，请补充证据。',artifacts:[]};},()=>{});
  expect(store.messages(group).at(-1)).toMatchObject({authorKind:'bot',authorId:id,speaker:'审核员',roleVersion:2});
  const privateSession=new ConversationSession('/w','private',store);privateSession.human(store.list('/w').find(c=>c.id===id)!,'分析给定数据');
  await privateSession.run(async(job,prompt)=>{expect(job.member.roleVersion).toBe(3);expect(prompt).toContain('当前权威职责：分析数据');expect(prompt).not.toContain('缺少来源，请补充证据');return {text:'请提供数据。',artifacts:[]};},()=>{});
  expect(store.messages(id).at(-1)).toMatchObject({authorId:id,roleVersion:3});
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

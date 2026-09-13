import { DatabaseSync } from 'node:sqlite';
import {migrateWorkbench} from './workbench-migrations';
import { randomUUID } from 'node:crypto';
import {statSync,openSync,readSync,closeSync} from 'node:fs';
import type { ArtifactEntry, Conversation, ChatMessage, Layout, RoleVersion, MessageAuthor } from '../shared/contracts';
const nameKey=(name:string)=>name.trim().normalize('NFC').toLowerCase();
export interface BotMemory{id:number;botId:string;conversationId:string;content:string;sourceKind:string;sourceRef:string;createdAt:string;active:boolean;supersedes?:number}
const BotMemoryRow=(r:Record<string,unknown>):BotMemory=>({id:Number(r.id),botId:String(r.bot_id),conversationId:String(r.conversation_id),content:String(r.content),sourceKind:String(r.source_kind),sourceRef:String(r.source_ref),createdAt:String(r.created_at),active:Number(r.active)===1,supersedes:r.supersedes!=null?Number(r.supersedes):undefined});
export class WorkbenchStore {
  private db:DatabaseSync;
  constructor(file:string){
    this.db=new DatabaseSync(file);
    try{migrateWorkbench(this.db,file);this.db.exec("PRAGMA journal_mode=WAL; UPDATE group_jobs SET status='interrupted',error='应用退出后中断，未自动重跑' WHERE status IN ('queued','running');");}catch(error){this.db.close();throw error;}
  }
  list(workspace:string):Conversation[]{
    return this.db.prepare('SELECT c.*,v.version AS roleVersion,v.role AS currentRole,t.manager FROM conversations c LEFT JOIN bot_role_versions v ON v.bot_id=c.id AND v.version=(SELECT MAX(version) FROM bot_role_versions WHERE bot_id=c.id) LEFT JOIN teams t ON c.id=t.group_id WHERE c.workspace=? ORDER BY c.rowid').all(workspace).map(row=>({id:String(row.id),name:String(row.name),role:String(row.currentRole??row.role),roleVersion:row.roleVersion?Number(row.roleVersion):undefined,kind:row.kind as 'bot'|'group',members:JSON.parse(String(row.members)),managerId:row.manager?String(row.manager):undefined,sidebar:(this.pref(`sidebar:${row.id}`) as Conversation['sidebar'])??{}}));
  }
  ensure(workspace:string){const key=`initialized:${workspace}`;if(this.pref(key))return;if(!this.list(workspace).length)this.create(workspace,{name:'助手',role:'协助用户完成工作空间中的任务。',kind:'bot',members:[]});this.setPref(key,true);}
  private assertNameAvailable(workspace:string,kind:Conversation['kind'],name:string,excludeId?:string){
    if(this.list(workspace).some(c=>c.id!==excludeId&&c.kind===kind&&nameKey(c.name)===nameKey(name)))throw Error(`${kind==='bot'?'Bot':'群组'}名称“${name.trim()}”已存在，请使用其他名称。`);
  }
  create(workspace:string,input:Omit<Conversation,'id'>,source:RoleVersion['source']='user_create',executionPath?:string,sourceBotId?:string){
    const sourceModel=sourceBotId?this.memberModel(workspace,sourceBotId):undefined;
    if(sourceBotId&&input.kind!=='bot')throw Error('仅 Bot 可复用成员配置。');
    if(!input||!['bot','group'].includes(input.kind)||typeof input.name!=='string'||!input.name.trim()||input.name.length>80||typeof input.role!=='string'||input.role.length>8000)throw Error('请填写有效名称和职责。');
    const bots=this.list(workspace).filter(c=>c.kind==='bot');
    const members=input.kind==='group'?input.members:[];
    if(!Array.isArray(members)||members.length>50||members.some(id=>!bots.some(b=>b.id===id))||(input.kind==='group'&&!members.length))throw Error('群组需要选择现有成员。');
    this.db.exec('BEGIN IMMEDIATE');
    try{
      this.assertNameAvailable(workspace,input.kind,input.name);
      const id=randomUUID();this.db.prepare('INSERT INTO conversations VALUES(?,?,?,?,?,?)').run(id,workspace,input.name.trim(),input.role,input.kind,JSON.stringify([...new Set(members)]));if(input.kind==='bot')this.saveRole(id,input.role,source);this.setPref(`execution-space:${id}`,executionPath??this.pref(`default-execution:${workspace}`)??workspace);if(sourceModel)this.setPref(`member-model:${id}`,sourceModel);this.select(workspace,id);this.db.exec('COMMIT');return id;
    }catch(error){if(this.db.isTransaction)this.db.exec('ROLLBACK');throw error;}
  }
  createTeam(workspace:string,managerId:string,value:unknown){
    const input=value as {name:string;purpose:string;members:{name:string;role:string}[]};
    const manager=this.list(workspace).find(c=>c.id===managerId&&c.kind==='bot');
    if(!manager)throw Error('协调成员不属于当前工作空间。');
    if(!input||typeof input.name!=='string'||!input.name.trim()||input.name.length>80||typeof input.purpose!=='string'||input.purpose.length>4000||!Array.isArray(input.members)||input.members.length<1||input.members.length>20)throw Error('团队需有名称、目标和 1–20 位具备职责的成员。');
    const members=input.members.map(m=>{
      if(!m||typeof m.name!=='string'||!m.name.trim()||m.name.length>80||typeof m.role!=='string'||!m.role.trim()||m.role.length>7500)throw Error('每位成员都需要有效名称和明确职责。');
      return {name:m.name.trim(),role:m.role.trim()};
    });
    if(new Set(members.map(m=>nameKey(m.name))).size!==members.length)throw Error('团队内成员名称不能重复。');
    const name=input.name.trim();
    this.db.exec('BEGIN IMMEDIATE');
    try{
      const existing=this.db.prepare('SELECT group_id,roster FROM teams WHERE workspace=? AND manager=? AND name=?').get(workspace,managerId,name);
      if(existing){
        const roster=JSON.parse(String(existing.roster)) as {name:string;role:string}[];
        if(roster.map(m=>m.name).sort().join('\n')!==members.map(m=>m.name).sort().join('\n'))throw Error('同名团队已存在且成员不同，请查询现有团队或使用不同群名。');
        this.db.exec('COMMIT');return this.team(workspace,String(existing.group_id));
      }
      this.assertNameAvailable(workspace,'group',name);
      for(const member of members)this.assertNameAvailable(workspace,'bot',member.name);
      const insert=this.db.prepare('INSERT INTO conversations VALUES(?,?,?,?,?,?)');
      const ids=members.map(m=>{const id=randomUUID();insert.run(id,workspace,m.name,`${m.role}\n向协调人 ${manager.name} 汇报工作；遵循所在工作空间已有授权。`,'bot','[]');this.saveRole(id,`${m.role}\n向协调人 ${manager.name} 汇报工作；遵循所在工作空间已有授权。`,'team_create',managerId);return id;});
      const group=randomUUID();insert.run(group,workspace,name,`${input.purpose}\n协调人：${manager.name}。${members.length} 位专业成员向协调人汇报，协调人对用户负责。`,'group',JSON.stringify(ids));
      for(const id of [...ids,group])this.setPref(`execution-space:${id}`,this.executionWorkspace(workspace,managerId).path);
      this.db.prepare('INSERT INTO teams VALUES(?,?,?,?,?)').run(workspace,managerId,name,group,JSON.stringify(members));
      this.db.exec('COMMIT');return this.team(workspace,group);
    }catch(error){if(this.db.isTransaction)this.db.exec('ROLLBACK');throw error;}
  }
  team(workspace:string,id:string){
    const all=this.list(workspace),group=all.find(c=>c.id===id&&c.kind==='group');
    if(!group)throw Error('群组不属于当前工作空间。');
    return {group,manager:all.find(c=>c.id===group.managerId),members:all.filter(c=>group.members.includes(c.id))};
  }
  update(workspace:string,id:string,name:string,role:string,members?:string[],expectedRoleVersion?:number,executionPath?:string|null){
    if(executionPath!==undefined)throw Error('工作空间创建后已固定，请为新项目创建新的 Bot 或群组。');
    if(typeof name!=='string'||!name.trim()||name.length>80||typeof role!=='string'||role.length>8000)throw Error('名称或职责无效。');
    const all=this.list(workspace),current=all.find(c=>c.id===id);if(!current)throw Error('会话不存在。');
    if(members!==undefined&&(current.kind!=='group'||!Array.isArray(members)||!members.length||members.length>50||members.some(id=>!all.some(c=>c.kind==='bot'&&c.id===id))))throw Error('群成员必须是本空间已有 Bot，且至少保留一人。');
    this.db.exec('BEGIN IMMEDIATE');try{
      if(current.kind==='bot'&&expectedRoleVersion!==undefined&&current.roleVersion!==expectedRoleVersion)throw Error('职责已更新，请重新打开编辑资料后再修改。');
      // Existing duplicate names may retain their name while editing duties; never introduce another collision.
      if(nameKey(name)!==nameKey(current.name))this.assertNameAvailable(workspace,current.kind,name,id);
      if(current.kind==='bot'&&role!==current.role)this.saveRole(id,role,'user_edit');
      this.db.prepare('UPDATE conversations SET name=?,role=?,members=? WHERE id=?').run(name.trim(),role,JSON.stringify(members?[...new Set(members)]:current.members),id);
      this.db.prepare('UPDATE teams SET name=? WHERE group_id=?').run(name.trim(),id);this.db.exec('COMMIT');
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  sidebarAction(workspace:string,id:string,action:string,value?:boolean|string){
    const item=this.list(workspace).find(c=>c.id===id);if(!item)throw Error('会话不存在。');
    if(action==='duplicate'){
      let number=1,name=`${item.name} 副本`;const names=new Set(this.list(workspace).filter(c=>c.kind===item.kind).map(c=>nameKey(c.name)));
      while(names.has(nameKey(name)))name=`${item.name} 副本 ${++number}`;
      if(name.length>80)throw Error('名称过长，请缩短名称后创建副本。');
      const copied=this.create(workspace,{name,role:item.role,kind:item.kind,members:item.members},'duplicate');
      if(item.kind==='bot'){const model=this.memberModel(workspace,id);if(model)this.setMemberModel(workspace,copied,model);}
      if(item.kind==='group'&&item.managerId){const team=this.db.prepare('SELECT roster FROM teams WHERE group_id=?').get(id);this.db.prepare('INSERT INTO teams VALUES(?,?,?,?,?)').run(workspace,item.managerId,name,copied,String(team?.roster??'[]'));}
      return copied;
    }
    if(!['pin','unread','hide','section'].includes(action))throw Error('不支持此侧栏操作。');
    const meta={...item.sidebar};
    if(action==='section'){if(typeof value!=='string'||value.trim().length>40)throw Error('分组名称最多40字。');meta.section=value.trim();}
    else{if(typeof value!=='boolean')throw Error('侧栏状态无效。');if(action==='pin')meta.pinned=value;if(action==='unread')meta.unread=value;if(action==='hide')meta.hidden=value;}
    this.setPref(`sidebar:${id}`,meta);return id;
  }
  deleteGroup(workspace:string,id:string){
    this.db.exec('BEGIN IMMEDIATE');try{
      if(!this.list(workspace).some(c=>c.id===id&&c.kind==='group'))throw Error('群组不存在。');
      if(this.db.prepare("SELECT 1 FROM group_jobs WHERE status IN ('running','queued') LIMIT 1").get())throw Error('请先停止当前任务，再删除群组。');
      const jobs=this.db.prepare('SELECT id,root FROM group_jobs WHERE conversation=?').all(id);const roots=[...new Set(jobs.map(j=>String(j.root)))];
      this.db.prepare('DELETE FROM messages WHERE conversation=?').run(id);this.db.prepare('DELETE FROM group_jobs WHERE conversation=?').run(id);this.db.prepare('DELETE FROM teams WHERE group_id=?').run(id);
      this.db.prepare('DELETE FROM bot_memories WHERE conversation_id=?').run(id);
      this.db.prepare('DELETE FROM conversations WHERE id=?').run(id);
      this.db.prepare('DELETE FROM preferences WHERE key=? OR (key=? AND value=?)').run(`sidebar:${id}`,`selected:${workspace}`,JSON.stringify(id));
      const privateRoots=roots.filter(root=>!this.db.prepare('SELECT 1 FROM group_jobs WHERE root=? LIMIT 1').get(root));
      const cleanup={id,jobIds:jobs.map(j=>String(j.id)),privateRoots,roots};this.setPref(`deleted-bot:${id}`,cleanup);this.db.exec('COMMIT');return cleanup;
    }catch(error){if(this.db.isTransaction)this.db.exec('ROLLBACK');throw error;}
  }
  deleteBot(workspace:string,id:string){
    this.db.exec('BEGIN IMMEDIATE');
    try{
      const all=this.list(workspace),bot=all.find(c=>c.id===id&&c.kind==='bot');if(!bot)throw Error('Bot不存在或不属于当前工作空间。');
      if(this.db.prepare("SELECT 1 FROM group_jobs WHERE status IN ('running','queued') LIMIT 1").get())throw Error('请先停止当前任务，再删除Bot。');
      const jobs=this.db.prepare('SELECT id,root FROM group_jobs WHERE member=? OR conversation=?').all(id,id);
      const privateRoots=this.db.prepare('SELECT DISTINCT root FROM group_jobs WHERE conversation=? AND root NOT IN (SELECT root FROM group_jobs WHERE conversation<>?)').all(id,id).map(r=>String(r.root));
      const roots=[...new Set(jobs.map(r=>String(r.root)))];
      for(const group of all.filter(c=>c.kind==='group')){
        const belongs=group.members.includes(id)||group.managerId===id;
        if(belongs){
          const sameName=all.filter(c=>c.kind==='bot'&&c.name===bot.name&&(group.members.includes(c.id)||group.managerId===c.id));
          if(sameName.length>1&&this.db.prepare("SELECT 1 FROM messages WHERE conversation=? AND speaker=? AND author_kind='unknown' LIMIT 1").get(group.id,bot.name))throw Error('群内存在同名Bot，历史发言身份无法区分，请先核对后再删除。');
          // Unknown legacy authors remain unassigned; never delete another Bot by name.
          this.db.prepare('DELETE FROM messages WHERE conversation=? AND author_id=?').run(group.id,id);
          this.db.prepare('UPDATE conversations SET members=? WHERE id=?').run(JSON.stringify(group.members.filter(member=>member!==id)),group.id);
          const team=this.db.prepare('SELECT roster FROM teams WHERE group_id=?').get(group.id);
          if(team)this.db.prepare('UPDATE teams SET roster=?,manager=CASE WHEN manager=? THEN ? ELSE manager END WHERE group_id=?').run(JSON.stringify((JSON.parse(String(team.roster)) as {name:string}[]).filter(m=>m.name!==bot.name)),id,'',group.id);
        }
      }
      for(const job of jobs)this.db.prepare('DELETE FROM messages WHERE task=?').run(job.id);
      this.db.prepare('DELETE FROM messages WHERE conversation=?').run(id);
      this.db.prepare('DELETE FROM group_jobs WHERE member=? OR conversation=?').run(id,id);
      this.db.prepare('DELETE FROM messages WHERE author_id=?').run(id);
      this.db.prepare('DELETE FROM bot_role_versions WHERE bot_id=?').run(id);
      this.db.prepare('DELETE FROM bot_memories WHERE bot_id=?').run(id);
      this.db.prepare('DELETE FROM conversations WHERE id=?').run(id);
      this.db.prepare('DELETE FROM preferences WHERE key=?').run(`sidebar:${id}`);
      this.db.prepare('DELETE FROM preferences WHERE key=? AND value=?').run(`selected:${workspace}`,JSON.stringify(id));
      this.setPref(`initialized:${workspace}`,true);
      const cleanup={id,jobIds:jobs.map(j=>String(j.id)),privateRoots,roots};
      this.setPref(`deleted-bot:${id}`,cleanup);this.db.exec('COMMIT');return cleanup;
    }catch(error){if(this.db.isTransaction)this.db.exec('ROLLBACK');throw error;}
  }
  pendingBotCleanup(){return this.db.prepare("SELECT value FROM preferences WHERE key LIKE 'deleted-bot:%'").all().map(r=>JSON.parse(String(r.value)) as {id:string;jobIds:string[];privateRoots:string[];roots:string[]});}
  finishBotCleanup(id:string){this.db.prepare('DELETE FROM preferences WHERE key=?').run(`deleted-bot:${id}`);}
  selected(workspace:string){const saved=this.pref(`selected:${workspace}`);return this.list(workspace).find(c=>c.id===saved)??this.list(workspace)[0];}
  select(workspace:string,id:string){if(!this.list(workspace).some(c=>c.id===id))throw Error('会话不属于此工作空间。');this.setPref(`selected:${workspace}`,id);const meta=(this.pref(`sidebar:${id}`) as Conversation['sidebar'])??{};if(meta.unread)this.setPref(`sidebar:${id}`,{...meta,unread:false});}
  messages(id:string):ChatMessage[]{return this.db.prepare('SELECT * FROM (SELECT * FROM messages WHERE conversation=? ORDER BY id DESC LIMIT 100) ORDER BY id').all(id).map(r=>({id:Number(r.id),authorKind:r.author_kind as MessageAuthor['authorKind'],authorId:r.author_id?String(r.author_id):undefined,roleVersion:r.role_version?Number(r.role_version):undefined,speaker:String(r.speaker),content:String(r.content),taskId:r.task?String(r.task):undefined,artifacts:JSON.parse(String(r.artifacts))}));}
  private saveRole(id:string,role:string,source:RoleVersion['source'],actorId?:string){
    this.db.prepare('INSERT INTO bot_role_versions VALUES(?,(SELECT COALESCE(MAX(version),0)+1 FROM bot_role_versions WHERE bot_id=?),?,?,?,?)').run(id,id,role,source,actorId??null,new Date().toISOString());
  }
  roleRequests(workspace:string){return (this.pref(`role-requests:${workspace}`) as {id:string;requesterName:string;requesterId:string;targetId:string;targetName:string;role:string;reason:string}[]|undefined)??[];}
  requestRoleChange(workspace:string,request:{requesterName:string;requesterId:string;targetId:string;targetName:string;role:string;reason:string}){const list=this.roleRequests(workspace);if(list.length>=20)throw Error('待处理的改岗请求过多，请先在设置中处理。');const id=(globalThis.crypto?.randomUUID?.()??`${Date.now()}-${Math.random()}`);this.setPref(`role-requests:${workspace}`,[...list,{id,...request}]);return id;}
  resolveRoleRequest(workspace:string,id:string,approve:boolean){const list=this.roleRequests(workspace);const request=list.find(r=>r.id===id);if(!request)throw Error('改岗请求不存在或已处理。');this.setPref(`role-requests:${workspace}`,list.filter(r=>r.id!==id));
    if(!approve)return false;
    const target=this.list(workspace).find(c=>c.id===request.targetId);if(!target||target.kind!=='bot')throw Error('改岗目标不存在或不是 Bot。');
    this.db.exec('BEGIN IMMEDIATE');try{if(target.role!==request.role)this.saveRole(request.targetId,request.role,'user_approved',request.requesterId);this.db.prepare('UPDATE conversations SET role=? WHERE id=?').run(request.role,request.targetId);this.db.exec('COMMIT');return true;}catch(error){if(this.db.isTransaction)this.db.exec('ROLLBACK');throw error;}
  }
  setManager(workspace:string,groupId:string,managerId:string){
    this.db.exec('BEGIN IMMEDIATE');try{
      const group=this.list(workspace).find(c=>c.id===groupId&&c.kind==='group');if(!group)throw Error('群组不存在。');
      if(managerId===group.managerId){this.db.exec('COMMIT');return false;}
      if(!group.members.includes(managerId))throw Error('新协调人必须是本群普通成员。');
      this.db.prepare('UPDATE teams SET manager=? WHERE workspace=? AND group_id=?').run(managerId,workspace,groupId);
      this.db.exec('COMMIT');return true;
    }catch(error){if(this.db.isTransaction)this.db.exec('ROLLBACK');throw error;}
  }
  handoffRules(workspace:string){return (this.pref(`handoff-rules:${workspace}`) as {requesterId:string;target:string;member:string}[]|undefined)??[];}
  addHandoffRule(workspace:string,rule:{requesterId:string;target:string;member:string}){const rules=this.handoffRules(workspace);if(!rules.some(r=>r.requesterId===rule.requesterId&&r.target===rule.target&&r.member===rule.member))this.setPref(`handoff-rules:${workspace}`,[...rules,rule]);}
  removeHandoffRule(workspace:string,rule:{requesterId:string;target:string;member:string}){this.setPref(`handoff-rules:${workspace}`,this.handoffRules(workspace).filter(r=>!(r.requesterId===rule.requesterId&&r.target===rule.target&&r.member===rule.member)));}
  executionWorkspace(catalog:string,conversationId:string,defaultPath=catalog){
    if(!this.list(catalog).some(c=>c.id===conversationId))throw Error('会话不属于当前工作台。');
    const override=this.pref(`execution-space:${conversationId}`);return {path:typeof override==='string'?override:catalog,inherited:typeof override!=='string'};
  }
  pinJobWorkspace(catalog:string,jobId:string,path:string){
    const row=this.db.prepare('SELECT c.workspace FROM group_jobs j JOIN conversations c ON c.id=j.conversation WHERE j.id=?').get(jobId);if(row?.workspace!==catalog)throw Error('任务不属于当前工作台。');
    const previous=this.pref(`job-space:${jobId}`);if(previous!==undefined&&previous!==path)throw Error('任务工作空间已固定。');this.setPref(`job-space:${jobId}`,path);
  }
  jobWorkspace(catalog:string,jobId:string){
    const path=this.pref(`job-space:${jobId}`);return typeof path==='string'?path:catalog;
  }
  reviewContext(workspace:string,memberId:string){
    const groups=this.list(workspace).filter(c=>c.kind==='group'&&(c.members.includes(memberId)||c.managerId===memberId));
    return groups.flatMap(group=>this.db.prepare(`SELECT j.*,c.name AS member_name FROM group_jobs j JOIN conversations c ON c.id=j.member WHERE j.conversation=? AND EXISTS(SELECT 1 FROM group_jobs own WHERE own.root=j.root AND own.conversation=j.conversation AND own.member=?) ORDER BY j.rowid DESC LIMIT 60`).all(group.id,memberId).map(r=>({taskId:String(r.id),root:String(r.root),groupId:group.id,groupName:group.name,memberId:String(r.member),memberName:String(r.member_name),instruction:String(r.instruction),status:String(r.status),artifacts:this.ledgerFor(String(r.id)).map(f=>({path:f.path,createdAt:f.created}))})));
  }
  roundMessages(conversationId:string,root:string){return this.db.prepare(`SELECT m.speaker,m.content,m.artifacts FROM messages m JOIN group_jobs j ON j.id=m.task WHERE m.conversation=? AND j.root=? ORDER BY m.id`).all(conversationId,root).map(r=>({speaker:String(r.speaker),content:String(r.content),artifacts:JSON.parse(String(r.artifacts)) as string[]}));}
  artifactHistory(workspace:string,conversationId:string):ArtifactEntry[]{
    const selected=this.list(workspace).find(c=>c.id===conversationId);if(!selected)return [];
    const rows=this.db.prepare(`SELECT m.id,m.task,m.artifacts,m.conversation,c.name FROM messages m JOIN conversations c ON c.id=m.conversation WHERE c.workspace=? AND m.task IS NOT NULL AND (m.conversation=? OR (?='bot' AND m.author_kind='bot' AND m.author_id=?)) ORDER BY m.id DESC`).all(workspace,conversationId,selected.kind,conversationId);
    const seen=new Set<string>();const entries:ArtifactEntry[]=[];
    for(const row of rows)for(const path of JSON.parse(String(row.artifacts)) as string[]){
      const taskId=String(row.task),key=JSON.stringify([taskId,path]);if(seen.has(key))continue;seen.add(key);
      const stamp=this.db.prepare('SELECT created FROM delivery_ledger WHERE job_id=? AND path=? ORDER BY id DESC LIMIT 1').get(taskId,path);
      entries.push({taskId,path,conversationId:String(row.conversation),conversationName:String(row.name),messageId:Number(row.id),createdAt:stamp?String(stamp.created):undefined});
    }
    return entries.sort((a,b)=>a.createdAt&&b.createdAt?b.createdAt.localeCompare(a.createdAt):b.messageId-a.messageId);
  }
  recordDelivery(jobId:string,path:string,sha256:string,bytes:number){this.db.prepare('INSERT INTO delivery_ledger(job_id,path,sha256,bytes,created) VALUES(?,?,?,?,?)').run(jobId,path,sha256,bytes,new Date().toISOString());}
  ledgerFor(jobId:string){return this.db.prepare('SELECT path,sha256,bytes,created FROM delivery_ledger WHERE job_id=? ORDER BY id').all(jobId).map(r=>({path:String(r.path),sha256:String(r.sha256),bytes:Number(r.bytes),created:String(r.created)}));}
  verifyDeliveries(jobId:string):{missing:string[];empty:string[]}{
    const missing:string[]=[],empty:string[]=[];
    for(const entry of this.ledgerFor(jobId)){
      try{
        const size=statSync(entry.path).size;
        if(size===0){empty.push(entry.path);continue;}
        // E07b：非空但全是空白同样拒验；只读文件头最多 4KB 判断。
        const fd=openSync(entry.path,'r');try{const buf=Buffer.alloc(Math.min(size,4096));const read=readSync(fd,buf,0,buf.length,0);if(buf.subarray(0,read).toString('utf8').trim()==='')empty.push(entry.path);}finally{closeSync(fd);}
      }catch{missing.push(entry.path);}
    }
    return {missing,empty};
  }
  roleHistory(workspace:string,id:string):RoleVersion[]{
    if(!this.list(workspace).some(c=>c.id===id&&c.kind==='bot'))throw Error('Bot 不属于当前工作空间。');
    return this.db.prepare('SELECT * FROM bot_role_versions WHERE bot_id=? ORDER BY version DESC').all(id).map(r=>({version:Number(r.version),role:String(r.role),source:r.source as RoleVersion['source'],actorId:r.actor_id?String(r.actor_id):undefined,createdAt:String(r.created_at)}));
  }
  // E08a：业务事实记忆。范围固定为记录它的会话，绝不默认跨会话注入；纠正走 supersedes 版本链，旧记录保留可追溯。
  addMemory(input:{workspace:string;botId:string;conversationId:string;content:string;sourceKind:string;sourceRef:string;supersedes?:number}):number{
    if(typeof input.content!=='string'||!input.content.trim()||input.content.length>2000)throw Error('记忆内容需在 1–2000 字之间。');
    if(!this.list(input.workspace).some(c=>c.id===input.botId&&c.kind==='bot'))throw Error('记忆主体必须是本工作空间的 Bot。');
    if(!this.list(input.workspace).some(c=>c.id===input.conversationId))throw Error('记忆适用会话不存在。');
    this.db.exec('BEGIN IMMEDIATE');try{
      if(input.supersedes!==undefined){
        const target=this.db.prepare('SELECT bot_id,conversation_id,active FROM bot_memories WHERE id=?').get(input.supersedes);
        if(!target||String(target.bot_id)!==input.botId||String(target.conversation_id)!==input.conversationId||!Number(target.active))throw Error('被纠正的记忆不存在、不属于本会话或已被纠正。');
        this.db.prepare('UPDATE bot_memories SET active=0,supersedes=NULL WHERE id=?').run(input.supersedes);
      }
      const row=this.db.prepare('INSERT INTO bot_memories(bot_id,conversation_id,content,source_kind,source_ref,created_at,active,supersedes) VALUES(?,?,?,?,?,?,1,?)').run(input.botId,input.conversationId,input.content.trim(),input.sourceKind,input.sourceRef,new Date().toISOString(),input.supersedes??null);
      this.db.exec('COMMIT');return Number(row.lastInsertRowid);
    }catch(error){if(this.db.isTransaction)this.db.exec('ROLLBACK');throw error;}
  }
  memories(botId:string,conversationId:string):BotMemory[]{
    return this.db.prepare('SELECT * FROM bot_memories WHERE bot_id=? AND conversation_id=? AND active=1 ORDER BY id').all(botId,conversationId).map(BotMemoryRow);
  }
  workspaceMemories(workspace:string):BotMemory[]{
    return this.db.prepare('SELECT m.* FROM bot_memories m JOIN conversations c ON c.id=m.bot_id WHERE c.workspace=? ORDER BY m.id DESC').all(workspace).map(BotMemoryRow);
  }
  memoryChain(id:number):BotMemory[]{ // 从给定记录沿 supersedes 向旧追溯，返回旧→新完整纠正链。
    const chain:BotMemory[]=[];const seen=new Set<number>();
    let cursor=this.db.prepare('SELECT * FROM bot_memories WHERE id=?').get(id);
    while(cursor&&!seen.has(Number(cursor.id))){seen.add(Number(cursor.id));chain.unshift(BotMemoryRow(cursor));cursor=cursor.supersedes!=null?this.db.prepare('SELECT * FROM bot_memories WHERE id=?').get(cursor.supersedes):undefined;}
    return chain;
  }
  deactivateMemory(workspace:string,id:number){
    if(!this.db.prepare('SELECT 1 FROM bot_memories m JOIN conversations c ON c.id=m.bot_id WHERE m.id=? AND c.workspace=?').get(id,workspace))throw Error('记忆不存在。');
    this.db.prepare('UPDATE bot_memories SET active=0 WHERE id=?').run(id);
  }
  deleteMemory(workspace:string,id:number){
    if(!this.db.prepare('SELECT 1 FROM bot_memories m JOIN conversations c ON c.id=m.bot_id WHERE m.id=? AND c.workspace=?').get(id,workspace))throw Error('记忆不存在。');
    this.db.prepare('DELETE FROM bot_memories WHERE id=?').run(id);
  }
  startJob(workspace:string,id:string):Conversation{
    this.db.exec('BEGIN IMMEDIATE');try{
      const job=this.db.prepare("SELECT * FROM group_jobs WHERE id=? AND status='queued'").get(id);
      const member=job&&this.list(workspace).find(c=>c.id===job.member&&c.kind==='bot');
      if(!member?.roleVersion)throw Error('任务成员或当前职责版本不存在。');
      this.db.prepare("UPDATE group_jobs SET role_version=?,status='running' WHERE id=?").run(member.roleVersion,id);
      this.db.exec('COMMIT');return member;
    }catch(error){if(this.db.isTransaction)this.db.exec('ROLLBACK');throw error;}
  }
  add(id:string,speaker:string,content:string,task?:string,author:MessageAuthor={authorKind:'unknown'}){
    this.db.prepare('INSERT INTO messages(conversation,speaker,content,task,author_kind,author_id,role_version) VALUES(?,?,?,?,?,?,?)').run(id,speaker,content,task??null,author.authorKind,author.authorId??null,author.roleVersion??null);
  }
  deliver(conversation:string,speaker:string,content:string,task:string,artifacts:string[],author:MessageAuthor={authorKind:'unknown'}){
    this.db.prepare('INSERT INTO messages(conversation,speaker,content,task,artifacts,author_kind,author_id,role_version) VALUES(?,?,?,?,?,?,?,?)').run(conversation,speaker,content,task,JSON.stringify(artifacts),author.authorKind,author.authorId??null,author.roleVersion??null);
  }
  publish(conversation:string,speaker:string,content:string,task:string,artifacts:string[],author:MessageAuthor={authorKind:'unknown'}){
    const existing=this.db.prepare("SELECT id,artifacts FROM messages WHERE conversation=? AND task=? AND author_kind=? AND author_id IS ? AND role_version IS ? AND (author_kind<>'unknown' OR speaker=?) ORDER BY id DESC LIMIT 1").get(conversation,task,author.authorKind,author.authorId??null,author.roleVersion??null,speaker);
    if(existing){const files=[...new Set([...JSON.parse(String(existing.artifacts)),...artifacts])];this.db.prepare('UPDATE messages SET content=?,artifacts=? WHERE id=?').run(content,JSON.stringify(files),existing.id);}
    else this.deliver(conversation,speaker,content,task,artifacts,author);
  }
  finish(task:string,speaker:string,content:string,artifacts:string[]){const row=this.db.prepare('SELECT conversation FROM messages WHERE task=? LIMIT 1').get(task);if(row)this.deliver(String(row.conversation),speaker,content,task,artifacts);}
  jobs(conversation:string){return this.db.prepare('SELECT j.*,c.name AS memberName FROM group_jobs j JOIN conversations c ON c.id=j.member WHERE j.conversation=? ORDER BY j.rowid DESC LIMIT 80').all(conversation).map(r=>({id:String(r.id),roleVersion:r.role_version?Number(r.role_version):undefined,member:String(r.member),memberName:String(r.memberName),instruction:String(r.instruction),status:String(r.status),error:String(r.error)}));}
  queueJob(id:string,root:string,conversation:string,member:string,instruction:string){this.db.prepare('INSERT INTO group_jobs(id,root,conversation,member,instruction,status) VALUES(?,?,?,?,?,?)').run(id,root,conversation,member,instruction,'queued');}
  queueJobs(root:string,jobs:{id:string;conversation:string;member:string;instruction:string;waiting:boolean}[]){
    this.db.exec('BEGIN IMMEDIATE');
    try{
      for(const job of jobs){
        this.queueJob(job.id,root,job.conversation,job.member,job.instruction);
        if(job.waiting)this.jobStatus(job.id,'held','等待前置任务完成');
      }
      this.db.exec('COMMIT');
    }catch(error){if(this.db.isTransaction)this.db.exec('ROLLBACK');throw error;}
  }
  jobStatus(id:string,status:string,error=''){this.db.prepare('UPDATE group_jobs SET status=?,error=? WHERE id=?').run(status,error,id);}
  taskConversation(task:string){return this.db.prepare('SELECT conversation FROM messages WHERE task=? LIMIT 1').get(task)?.conversation as string|undefined;}
  artifact(workspace:string,task:string,path:string){return this.db.prepare('SELECT m.artifacts FROM messages m JOIN conversations c ON c.id=m.conversation WHERE c.workspace=? AND m.task=?').all(workspace,task).some(r=>(JSON.parse(String(r.artifacts)) as string[]).includes(path));}
  // E09a：成员独立模型绑定。凭据不在此层校验（主进程按已存 Key 校验）；删除绑定即回退全局。
  memberModel(workspace:string,botId:string):{provider:string;model:string}|undefined{
    if(!this.list(workspace).some(c=>c.id===botId&&c.kind==='bot'))throw Error('Bot 不属于当前工作空间。');
    const value=this.pref(`member-model:${botId}`) as {provider?:unknown;model?:unknown}|undefined;
    if(!value||typeof value.provider!=='string'||typeof value.model!=='string'||!value.model.trim())return undefined;
    return {provider:value.provider,model:value.model.trim()};
  }
  setMemberModel(workspace:string,botId:string,input:{provider:string;model:string}|null){
    if(!this.list(workspace).some(c=>c.id===botId&&c.kind==='bot'))throw Error('Bot 不属于当前工作空间。');
    if(input===null){this.db.prepare('DELETE FROM preferences WHERE key=?').run(`member-model:${botId}`);return;}
    if(!/^[a-zA-Z0-9][a-zA-Z0-9._:/+-]{0,159}$/.test(input.model??''))throw Error('模型名称无效。');
    this.setPref(`member-model:${botId}`,{provider:input.provider,model:input.model.trim()});
  }
  memberModels(workspace:string):Record<string,{provider:string;model:string}>{
    const result:Record<string,{provider:string;model:string}>={};
    for(const c of this.list(workspace))if(c.kind==='bot'){const m=this.memberModel(workspace,c.id);if(m)result[c.id]=m;}
    return result;
  }
  pref(key:string):unknown{const row=this.db.prepare('SELECT value FROM preferences WHERE key=?').get(key);return row?JSON.parse(String(row.value)):undefined;}
  setPref(key:string,value:unknown){this.db.prepare('INSERT OR REPLACE INTO preferences VALUES(?,?)').run(key,JSON.stringify(value));}
  layout():Layout{return (this.pref('layout') as Layout)??{left:240,right:420,leftOpen:true,rightOpen:false};}
  saveLayout(v:Layout){if(!v||!Number.isFinite(v.left)||!Number.isFinite(v.right)||typeof v.leftOpen!=='boolean'||typeof v.rightOpen!=='boolean')throw Error('布局无效。');this.setPref('layout',{left:Math.max(180,Math.min(500,v.left)),right:Math.max(280,Math.min(1000,v.right)),leftOpen:v.leftOpen,rightOpen:v.rightOpen});}
  approvalRules(workspace:string){return (this.pref(`approvals:${workspace}`) as {host:string;action:string;decision:'always_allow'|'require'}[]|undefined)??[];}
  addApprovalRule(workspace:string,rule:{host:string;action:string;decision:'always_allow'|'require'}){const rules=this.approvalRules(workspace);if(!rules.some(r=>r.host===rule.host&&r.action===rule.action&&r.decision===rule.decision))this.setPref(`approvals:${workspace}`,[...rules,rule]);}
  deleteApprovalRule(workspace:string,rule:{host:string;action:string;decision:'always_allow'|'require'}){this.setPref(`approvals:${workspace}`,this.approvalRules(workspace).filter(r=>!(r.host===rule.host&&r.action===rule.action&&r.decision===rule.decision)));}
  close(){this.db.close();}
}

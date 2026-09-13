// Offline adversarial checks. Scheduler callbacks are control-flow fixtures, not model tasks.
import {build} from 'esbuild';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,linkSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

const dir=mkdtempSync(resolve('.tmp/design-audit-'));
const results=[];
const record=(id,observed)=>{results.push({id,observed});console.log(JSON.stringify({id,observed}));};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
for(const [name,file] of Object.entries({store:'state/workbench',session:'runtime/conversation-session',local:'tools/local',hardlinks:'tools/hardlinks'}))
  await build({entryPoints:[`src/${file}.ts`],outfile:join(dir,`${name}.mjs`),bundle:true,platform:'node',format:'esm'});
const {WorkbenchStore}=await import(pathToFileURL(join(dir,'store.mjs')));
const {ConversationSession}=await import(pathToFileURL(join(dir,'session.mjs')));
const {localTool}=await import(pathToFileURL(join(dir,'local.mjs')));
const {breakWorkspaceHardlinks}=await import(pathToFileURL(join(dir,'hardlinks.mjs')));
const workspace=join(dir,'workspace');mkdirSync(workspace);mkdirSync(join(workspace,'outputs'));
const store=new WorkbenchStore(join(dir,'audit.sqlite'));
const managerId=store.create(workspace,{name:'主管',role:'审查用构造职责',kind:'bot',members:[]});
const team=store.createTeam(workspace,managerId,{name:'审查组',purpose:'构造数据',members:[{name:'编辑',role:'旧职责'},{name:'研究员',role:'研究'}]});
const node=resolve('.local/runtime/node'),worker=resolve('dist/runtime/file-worker.mjs');
const invoke=(tool,input,signal=new AbortController().signal)=>localTool(workspace,node,worker,tool,input,[],signal);
try{
  const outside=join(dir,'outside-marker.txt');writeFileSync(outside,'AUDIT_OUTSIDE_ONLY');
  linkSync(outside,join(workspace,'linked.txt'));
  await assert.rejects(invoke('read',{path:'linked.txt'}),/硬链接/);
  // E02a 修复后：任务启动路径（runTask）会先 breakWorkspaceHardlinks；这里按同一入口打断后，
  // bash 写 linked.txt 不得再穿透到工作空间外的原文件。
  const sweep=breakWorkspaceHardlinks(workspace);
  try{
    await invoke('bash',{command:'printf AUDIT_CHANGED > linked.txt'});
    const outsideAfter=readFileSync(outside,'utf8');
    record('E01-hardlink',{brokenLinks:sweep.broken.length,blocked:outsideAfter==='AUDIT_OUTSIDE_ONLY'?null:`外部文件被写透：${outsideAfter}`});
  }catch(error){record('E01-hardlink',{brokenLinks:sweep.broken.length,blocked:String(error)});}
  finally{ if(sweep.broken.length===0) record('E01-hardlink-sweep-miss',{note:'工作空间内硬链接未被识别，反例仍存在'}); }

  const background=join(workspace,'outputs/background.txt');const abort=new AbortController();
  await invoke('bash',{command:'(sleep 1; printf LATE_WRITE > outputs/background.txt) </dev/null >/dev/null 2>&1 & echo accepted'},abort.signal);
  abort.abort();await pause(1400);
  // E02a 修复后：工具 close 时无条件回收同组后台残余，延迟写入不应发生。
  record('E02-background-after-stop',{writtenAfterToolReturnedAndAbort:existsSync(background)});

  const detached=join(workspace,'outputs/detached.txt');const abortDetached=new AbortController();
  // Spawn only a bounded marker writer (1 s lifetime) in its own process group.
  const childCode=`setTimeout(()=>require('node:fs').writeFileSync(${JSON.stringify(detached)},'DETACHED_WRITE'),1000)`;
  const parentCode=`require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(childCode)}],{detached:true,stdio:'ignore'}).unref();setTimeout(()=>{},5000)`;
  const quote=s=>"'"+s.replaceAll("'","'\\''")+"'";
  const pending=invoke('bash',{command:`${quote(node)} -e ${quote(parentCode)}`},abortDetached.signal).catch(e=>String(e));
  await pause(300);abortDetached.abort();await pending;await pause(1200);
  record('E03-detached-after-stop',{writtenAfterAbort:existsSync(detached)});

  // E02b-1：逃逸后代继承沙箱；出站网络仅回环。外网请求必须失败（DNS/连接被 Seatbelt 拒绝）。
  try{
    await invoke('bash',{command:'curl -s -m 8 -o /dev/null https://example.com'});
    record('E09-egress',{externalBlocked:false,note:'沙箱内仍可访问外网，反例仍存在'});
  }catch(error){ record('E09-egress',{externalBlocked:true,detail:String(error).slice(0,140)}); }
  const {spawn:spawnPlain}=await import('node:child_process');
  const srv=spawnPlain('/usr/bin/python3',['-m','http.server','18099','--bind','127.0.0.1'],{cwd:dir,stdio:'ignore'});
  await pause(800);
  try{
    const code=await invoke('bash',{command:'curl -s -m 5 -o /dev/null -w "%{http_code}" http://127.0.0.1:18099/'});
    record('E10-loopback',{localReachable:code.trim()==='200',code:code.trim()});
  }catch(error){ record('E10-loopback',{localReachable:false,detail:String(error).slice(0,140)}); }
  finally{ srv.kill(); }

  const session=new ConversationSession(workspace,'interrupt-root',store);
  session.human(team.group,'@编辑 按旧版执行');
  let release;const gate=new Promise(r=>release=r);let entered;const started=new Promise(r=>entered=r);const order=[];
  const run=session.run(async(job,prompt)=>{
    order.push(job.instruction);
    if(order.length===1){entered();await gate;writeFileSync(join(workspace,'outputs/stale.txt'),'OLD_ACTION');record('E04-active-prompt',{containsCorrection:prompt.includes('取消旧版')});}
    return {text:'调度夹具结束，无模型调用',artifacts:[]};
  },()=>{});
  await started;session.human(team.group,'@编辑 取消旧版');session.human(team.group,'@编辑 最新要求');release();await run;
  record('E04-instructions',{order,staleActionHappened:existsSync(join(workspace,'outputs/stale.txt'))});

  const incomplete=new ConversationSession(workspace,'responded-root',store);incomplete.human(team.group,'@编辑 需要交付');
  const output=await incomplete.run(async()=>({text:'只有回复，无回执',artifacts:[]}),()=>{});
  record('E05-completion',{sessionResolved:!!output,memberStatus:store.jobs(team.group.id)[0].status});

  const stale=store.createTeam(workspace,managerId,{name:'审查组',purpose:'新目标',members:[{name:'编辑',role:'新职责'},{name:'研究员',role:'研究'}]});
  record('E06-team-retry',{returnedOldRole:stale.members.find(m=>m.name==='编辑').role.includes('旧职责'),returnedOldPurpose:stale.group.role.includes('构造数据')});
  store.update(workspace,team.group.id,team.group.name,team.group.role,[team.members[0].id]);
  const replay=store.createTeam(workspace,managerId,{name:'审查组',purpose:'构造数据',members:[{name:'编辑',role:'旧职责'},{name:'研究员',role:'研究'}]});
  record('E06-roster-drift',{requestedMembers:2,returnedMembers:replay.members.length});

  const privateBot=store.list(workspace).find(c=>c.id===managerId);
  const history=new ConversationSession(workspace,'history-root',store);history.human(privateBot,'初始指令：未经确认不要发布');
  for(let i=0;i<71;i++)store.add(privateBot.id,'你',`无关构造历史 ${i}`);
  let constraintVisible=false;
  // Use a fresh current task so the old instruction is only in history.
  history.stop();const fresh=new ConversationSession(workspace,'fresh-root',store);fresh.human(privateBot,'继续处理');
  await fresh.run(async(_job,prompt)=>{constraintVisible=prompt.includes('未经确认不要发布');return {text:'调度测试',artifacts:[]};},()=>{});
  record('E07-history',{oldConstraintVisible:constraintVisible});

  const file=join(workspace,'outputs/version.txt');writeFileSync(file,'VERSION_1');store.deliver(privateBot.id,'主管','构造交付','artifact-one',[file]);writeFileSync(file,'VERSION_2');
  record('E08-artifact-drift',{oldDeliveryStillAuthorized:store.artifact(workspace,'artifact-one',file),oldDeliveryPreview:JSON.parse(await invoke('preview',{path:file})).content});

  // E06b 修复后：depends_on 声明依赖，前置受阻时下游不得派发。
  const pipelineTeam=store.createTeam(workspace,managerId,{name:'依赖审查组',purpose:'构造依赖',members:[{name:'前置研究',role:'研究'},{name:'后续写作',role:'写作'}]});
  const pipeline=new ConversationSession(workspace,'pipeline-root',store);
  pipeline.tool({id:'dispatcher',conversation:pipelineTeam.group,member:pipelineTeam.manager,instruction:'构造派发'},'assign_tasks',{tasks:[{memberId:'前置研究',instruction:'获取必需素材'},{memberId:'后续写作',instruction:'必须等待研究完成',depends_on:'前置研究'}]});
  const pipelineOrder=[];
  await pipeline.run(async(job)=>{
    pipelineOrder.push(job.member.name);
    pipeline.tool(job,'task_result',{status:job.member.name==='前置研究'?'blocked':'completed',summary:'调度层构造回执，无模型调用'});
    return {text:'调度夹具',artifacts:[]};
  },()=>{}).catch(()=>{});
  record('E12-dependencies',{order:pipelineOrder,dependentDispatchedAfterBlocked:pipelineOrder.includes('后续写作'),dependentHeld:!pipelineOrder.includes('后续写作')});
  console.log(`Evidence: ${dir}`);
}finally{
  store.close();writeFileSync(join(dir,'results.json'),JSON.stringify(results,null,2));
  // Keep only tiny synthetic evidence; all processes above have bounded lifetimes.
  for(const name of ['store.mjs','session.mjs','local.mjs'])rmSync(join(dir,name),{force:true});
}

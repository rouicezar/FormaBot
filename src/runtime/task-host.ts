import { net } from 'electron';
import { webSearch } from '../tools/web-search';
import { fork } from 'node:child_process';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { localTool } from '../tools/local';
import { breakWorkspaceHardlinks } from '../tools/hardlinks';

export interface TaskLaunch {node:string;root:string;home:string;workspace:string;provider:string;model:string;key:string;prompt:string;protectedPaths:string[];readOnly?:boolean;outputDir?:string;images?:{data:string;mimeType:'image/png'}[]}
export const TOOL_WHITELIST=['read','write','edit','bash','browser','web_search','create_team','list_team','group_message','assign_tasks','task_result','silent','request_role_change','request_handoff','review_context','request_rework','remember','list_skills','read_skill'];
export async function dispatchTool(options:TaskLaunch,tool:string,input:unknown,deps:{signal:AbortSignal;authorized:()=>boolean;browser:(input:unknown,signal:AbortSignal)=>Promise<string>;onEvent:(text:string)=>void;onArtifact:(path:string)=>void;teamTool:(tool:string,input:unknown)=>string|Promise<string>}):Promise<string>{
  const {signal,authorized,browser,onEvent,onArtifact,teamTool}=deps;
  if(signal.aborted)throw new Error('任务已停止。');
  if(!authorized())throw new Error('工作空间未授权或任务已停止。');
  if(!TOOL_WHITELIST.includes(tool))throw new Error('未知工具。');
  if(options.readOnly&&(tool==='write'||tool==='edit'))throw new Error('汇总阶段不能代成员产出交付文件；请如实在群内汇总各成员状态。');
  onEvent(`执行 ${tool}`);
  const value=await (['create_team','list_team','group_message','assign_tasks','task_result','silent','request_role_change','request_handoff','review_context','request_rework','remember','list_skills','read_skill'].includes(tool)?Promise.resolve(teamTool(tool,input)):tool==='web_search'?webSearch(options,input,signal,net.fetch):tool==='browser'?browser(input,signal):localTool(options.workspace,options.node,join(options.root,'dist/runtime/file-worker.mjs'),tool,input,options.protectedPaths,signal));
  if(tool==='write'||tool==='edit')onArtifact(value.trim());
  onEvent(`${tool} 完成${tool==='write'||tool==='edit'?`：${value}`:''}`);
  return value;
}
export async function runTask(options:TaskLaunch,signal:AbortSignal,authorized:()=>boolean,browser:(input:unknown,signal:AbortSignal)=>Promise<string>,onEvent:(text:string)=>void,onArtifact:(path:string)=>void=()=>{},teamTool:(tool:string,input:unknown)=>string|Promise<string>=()=>{throw Error('团队工具未接入');},onConnected:()=>void=()=>{},onText:(text:string)=>void=()=>{}):Promise<string>{
  let yielded=false;let yieldTask=()=>{};
  const toolsAbort=new AbortController();
  const abortTools=()=>toolsAbort.abort();signal.addEventListener('abort',abortTools,{once:true});
  let lastActivity=Date.now();const touch=()=>{lastActivity=Date.now();};
  const token=randomUUID();let queue=Promise.resolve();const pending=new Set<Promise<unknown>>();
  const server=createServer((req,res)=>{
    const respond=(value:unknown,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
    if(req.method!=='POST'||req.headers.authorization!==`Bearer ${token}`){respond({ok:false,error:'Forbidden'},403);return;}
    let body='';req.on('data',chunk=>{body+=String(chunk);if(body.length>1500000)req.destroy();});
    req.on('end',()=>{
      const work=queue.then(async()=>{
        try {
          if(signal.aborted||toolsAbort.signal.aborted||!authorized())throw new Error('工作空间未授权或任务已停止。');
          const {tool,input}=JSON.parse(body);
          const value=await dispatchTool(options,tool,input,{signal:toolsAbort.signal,authorized,browser,onEvent:(t)=>{touch();onEvent(t);},onArtifact,teamTool});
          respond({ok:true,value});
          if(tool==='request_rework'){yielded=true;yieldTask();}
        }catch(error){respond({ok:false,error:error instanceof Error?error.message:'工具失败'});}
      });queue=work;pending.add(work);void work.finally(()=>pending.delete(work));
    });
  });
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const address=server.address();if(!address||typeof address==='string')throw new Error('无法启动本地工具服务。');
  mkdirSync(options.home,{recursive:true,mode:0o700});
  try { breakWorkspaceHardlinks(options.workspace); }
  catch (error) { throw new Error(error instanceof Error ? error.message : '硬链接安全检查失败。'); }
  try {
    return await new Promise<string>((resolve,reject)=>{
      const proxy=Object.fromEntries(['HTTP_PROXY','HTTPS_PROXY','NO_PROXY','http_proxy','https_proxy','no_proxy'].filter(key=>process.env[key]).map(key=>[key,process.env[key]]));
      const child=fork(join(options.root,'dist/runtime/task-sidecar.mjs'),[],{execPath:options.node,execArgv:[],cwd:options.home,detached:true,stdio:['ignore','ignore','pipe','ipc'],env:{...proxy,NODE_USE_ENV_PROXY:'1',PATH:'/usr/bin:/bin:/usr/sbin:/sbin',HOME:options.home,TMPDIR:options.home,LANG:'en_US.UTF-8'}});
      let text='';let failed=false;let timeout=false;
      const idleTimer=setInterval(()=>{if(Date.now()-lastActivity>120000){touch();abortTools();kill();const idle=new Error('任务空转超过 2 分钟，已暂停，可重新入队继续。');idle.name='TaskTimeout';reject(idle);}},15000);
      child.stderr?.resume();
      const kill=()=>{if(child.pid)try{process.kill(-child.pid,'SIGKILL');}catch{}};
      yieldTask=()=>{abortTools();kill();};
      const timer=setTimeout(()=>{timeout=true;abortTools();kill();const pause=new Error('任务超过 10 分钟，已暂停，可重新入队继续。');pause.name='TaskTimeout';reject(pause);},600000);
      signal.addEventListener('abort',kill,{once:true});
      child.on('message',(msg:{type:string;text:string})=>{touch();if(msg.type==='connected')onConnected();if(msg.type==='text'&&!signal.aborted)onText(msg.text);if(msg.type==='failed'){failed=true;text=msg.text;}if(msg.type==='result')text=msg.text;});
      child.once('error',error=>{clearTimeout(timer);clearInterval(idleTimer);signal.removeEventListener('abort',kill);abortTools();reject(error);});
      child.once('exit',async code=>{
        clearTimeout(timer);clearInterval(idleTimer);signal.removeEventListener('abort',kill);abortTools();await Promise.allSettled(pending);
        if(signal.aborted)reject(new Error('任务已停止。'));
        else if(timeout){const pause=new Error('任务超过 10 分钟，已暂停，可重新入队继续。');pause.name='TaskTimeout';reject(pause);}
        else if(yielded)resolve('返工已转达原群，等待上游处理后继续复核。');
        else if(code!==0||failed||!text)reject(new Error(text||'执行进程异常退出。'));
        else resolve(text);
      });
      child.send({...options,url:`http://127.0.0.1:${address.port}`,token});
      if(signal.aborted)kill();
    });
  }finally{signal.removeEventListener('abort',abortTools);abortTools();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
}

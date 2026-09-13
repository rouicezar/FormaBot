import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { relative, isAbsolute } from 'node:path';

export function inside(root: string, path: string) { const rel = relative(root,path); return rel === '' || (!rel.startsWith('..'+ '/') && rel !== '..' && !isAbsolute(rel)); }
export function sandboxProfile(workspace: string, node: string, worker: string, protectedPaths: string[]) {
  const q = JSON.stringify;
  return `(version 1)
(deny default)
(allow process-exec)
(allow process-fork)
(allow signal (target children))
(allow process-info* (target self))
(allow sysctl-read)
(deny sysctl-read (sysctl-name-regex "^kern.proc"))
(allow mach-lookup)
(deny mach-lookup (global-name "com.apple.securityd") (global-name "com.apple.secd") (global-name "com.apple.cfprefsd.agent"))
(allow file-read-metadata)
(allow file-read-data (literal "/"))
(allow file-read* (subpath "/System") (subpath "/usr") (subpath "/bin") (subpath "/sbin") (subpath "/dev") (subpath "/private/etc") (literal ${q(node)}) (literal ${q(worker)}) (subpath ${q(workspace)}))
(allow file-write* (subpath ${q(workspace)}) (literal "/dev/null"))
(deny file-link)
${protectedPaths.map(path => `(deny file-read* file-write* (subpath ${q(path)}))`).join('\n')}
(allow network* (remote ip "localhost:*"))
(allow network-bind (local ip "localhost:*"))
(allow network-inbound (local ip "localhost:*"))`;
}

export function localTool(root: string, node: string, worker: string, tool: string, input: unknown, protectedPaths: string[], signal: AbortSignal): Promise<string> {
  if (process.platform !== 'darwin') return Promise.reject(new Error('当前执行层仅完成 macOS 接入。'));
  const workspace = realpathSync(root);
  if(tool==='bash'&&(typeof (input as {command?:unknown})?.command!=='string'||!(input as {command:string}).command.trim()))return Promise.reject(new Error('Bash command 必须为非空字符串。'));
  if (protectedPaths.some(p => inside(p,workspace))) return Promise.reject(new Error('不能使用应用凭据目录作为工作空间。'));
  const args = tool === 'bash' ? ['/bin/bash','--noprofile','--norc','-c',String((input as {command?: unknown})?.command ?? '')] : [node,worker];
  return new Promise((resolve,reject) => {
    if (signal.aborted) { reject(new Error('任务已停止。')); return; }
    const child = spawn('/usr/bin/sandbox-exec',['-p',sandboxProfile(workspace,node,worker,protectedPaths),...args], {
      cwd:workspace, detached:true, env:{PATH:'/usr/bin:/bin:/usr/sbin:/sbin',HOME:workspace,TMPDIR:workspace,LANG:'en_US.UTF-8'}, stdio:['pipe','pipe','pipe'],
    });
    let output=''; let error=''; let overflow=false;
    const kill=()=>{ if(child.pid)try{process.kill(-child.pid,'SIGKILL');}catch{} };
    const timer=setTimeout(kill,60000);
    signal.addEventListener('abort',kill,{once:true});
    child.stdout.on('data',data=>{output+=String(data);if(output.length>(tool==='preview'?6000000:200000)){overflow=true;kill();}});
    child.stderr.on('data',data=>{error=(error+String(data)).slice(-10000);});
    child.on('error',reject);
    child.on('close',(code)=>{
      clearTimeout(timer);signal.removeEventListener('abort',kill);
      // F02 工具级收敛：父进程已退出，但同组后台残余（如 `(cmd)&`）仍可能存活，统一回收。
      kill();
      if(signal.aborted)reject(new Error('任务已停止。'));
      else if(overflow)reject(new Error('工具输出超过限制。'));
      else if(code!==0)reject(new Error(`工具执行失败 (${code})：${error}`));
      else resolve(output);
    });
    child.stdin.on('error',()=>{});
    child.stdin.end(tool==='bash'?'':JSON.stringify({workspace,tool,input}));
  });
}

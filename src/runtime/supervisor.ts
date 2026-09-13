import { fork } from 'node:child_process';
import { join } from 'node:path';

export function probeBundledRuntime(node: string, entry: string, home: string, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('Runtime probe aborted.')); return; }
    const child = fork(entry, [home], {
      execPath: node, execArgv: [], cwd: home,
      env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME: home, TMPDIR: home, LANG: 'en_US.UTF-8' },
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'], detached: process.platform !== 'win32',
    });
    let ready = false;
    let tail = '';
    let timedOut = false;
    child.stderr?.on('data', chunk => { tail = (tail + String(chunk)).slice(-3000); });
    child.on('message', message => { ready = !!message && typeof message === 'object' && (message as { type?: string }).type === 'runtime-ready'; });
    const terminate = () => {
      if (child.pid) {
        try { process.kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGKILL'); } catch { /* exit handler settles */ }
      }
    };
    signal?.addEventListener('abort', terminate, { once: true });
    const timer = setTimeout(() => { timedOut = true; terminate(); }, 35000);
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', terminate); };
    child.once('error', error => { cleanup(); reject(error); });
    child.once('exit', code => {
      cleanup();
      if (code === 0 && ready && !timedOut && !signal?.aborted) resolve('内置 Harness 已通过启动与退出检查；任务工具接入中');
      else reject(new Error(`Harness probe failed (${code}, timeout=${timedOut}): ${tail}`));
    });
  });
}

export function runtimePaths(root: string, resources: string, packaged: boolean) {
  return {
    node: join(packaged ? resources : join(root, '.local'), 'runtime', 'node'),
    entry: join(root, 'dist', 'runtime', 'sidecar.mjs'),
  };
}

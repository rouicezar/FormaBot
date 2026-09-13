import { probeHarness } from './probe';

const home = process.argv[2];
if (!home || !process.send) throw new Error('FormaBot runtime requires an owned IPC channel.');
try {
  const result = await probeHarness(home);
  process.send!({ type: 'runtime-ready', ...result });
} catch (error) {
  // Probe uses no credentials; detailed diagnostic is for local development logs only.
  process.stderr.write(`${error instanceof Error ? error.message : 'Harness startup failed'}\n`);
  process.send!({ type: 'runtime-error', error: '执行内核启动失败，请保留本地诊断记录。' });
  process.exitCode = 1;
} finally { process.disconnect?.(); }

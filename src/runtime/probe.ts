import { DeepSeekHarness } from '@deepseek-ai/dsh-sdk-client';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Boot/close only. This probe never queues a prompt or requests a model. */
export async function probeHarness(home: string) {
  await mkdir(home, { recursive: true, mode: 0o700 });
  const patch = join(home, 'probe.patch.json');
  const disabled = ['persistent-bash', 'persistent-pwsh', 'str-replace-editor', 'terminal-bash', 'terminal-pwsh', 'pty'];
  await writeFile(patch, JSON.stringify([
    ...disabled.map(id => ({ id, disabled: true })),
    { id: 'sandbox-policy', config: { mode: 'read-only', workspaceRoot: home } },
  ]));
  const harness = new DeepSeekHarness({
    profile: 'sdk-minimal', dshHome: home,
    dshBin: fileURLToPath(import.meta.resolve('@deepseek-ai/dsh/package.json')).replace(/package\.json$/, 'lib/bin.js'),
    patches: [patch], processCwd: home, cwd: home,
    provider: 'deepseek-official', model: 'deepseek-v4-flash', initializeTimeoutMs: 20000,
    env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME: home, TMPDIR: home, LANG: 'en_US.UTF-8', DSH_TELEMETRY_DISABLED: '1' },
  });
  try { await harness.start(); return { status: 'ready', version: '0.1.2-rc.1' }; }
  finally { await harness.close(); }
}

import { it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { probeBundledRuntime } from '../src/runtime/supervisor';

it('boots and closes the actual bundled Node + Harness without model requests or system Node', async () => {
  const home = mkdtempSync(resolve('.tmp/runtime-probe-'));
  try {
    const result = await probeBundledRuntime(resolve('.local/runtime/node'), resolve('dist/runtime/sidecar.mjs'), home);
    expect(result).toContain('启动与退出检查');
  } finally { rmSync(home, { recursive: true, force: true }); }
}, 45000);

it('rejects a missing bundled runtime instead of falling back to a system executable', async () => {
  const home = mkdtempSync(resolve('.tmp/runtime-missing-'));
  try {
    await expect(probeBundledRuntime(resolve(home, 'missing-node'), resolve('dist/runtime/sidecar.mjs'), home)).rejects.toThrow('ENOENT');
  } finally { rmSync(home, { recursive: true, force: true }); }
});

it('cancels a live probe and does not report ready', async () => {
  const home = mkdtempSync(resolve('.tmp/runtime-cancel-'));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 50);
  try {
    await expect(probeBundledRuntime(resolve('.local/runtime/node'), resolve('dist/runtime/sidecar.mjs'), home, controller.signal)).rejects.toThrow('probe failed');
  } finally { clearTimeout(timer); rmSync(home, { recursive: true, force: true }); }
}, 10000);

import { _electron as electron } from 'playwright-core';
import { mkdir, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';

const bundle = resolve('build/mac-arm64/FormaBot.app');
const resources = join(bundle, 'Contents/Resources');
await stat(join(resources, 'runtime/node'));
await stat(join(resources, 'app/node_modules/@deepseek-ai/dsh/lib/bin.js'));
const cwd = resolve('.tmp/package-smoke');
await mkdir(cwd, { recursive: true });
const env = { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME: process.env.HOME, TMPDIR: process.env.TMPDIR };
let app;
try {
  app = await electron.launch({ executablePath: join(bundle, 'Contents/MacOS/FormaBot'), cwd, env, timeout: 30000 });
  const page = await app.firstWindow();
  // UI 工作台分支中设置面板默认隐藏，仅断言运行组件文本就绪，不要求可见。
  await page.locator('#runtime', { hasText: '运行组件已就绪' }).waitFor({ state: 'attached', timeout: 40000 });
  assert.equal(await page.locator('#provider option').count(), 4);
  const state=await page.evaluate(()=>window.forma.state());
  assert.equal(await page.locator('#run').isDisabled(),!(state.value.model?.hasKey&&state.value.workspace));
  const facts = await app.evaluate(({ app }) => ({ packaged: app.isPackaged, root: app.getAppPath() }));
  assert.equal(facts.packaged, true);
  assert.equal(facts.root, join(resources, 'app'));
  await page.screenshot({ path: join(cwd, 'packaged-app.png'), fullPage: true });
  console.log('PASS: packaged app opened from unrelated cwd with minimal PATH; bundled Node + DSH boot/close successful; 4 providers. No model request made.');
} finally { await app?.close(); }

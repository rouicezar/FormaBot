import { _electron as electron } from 'playwright-core';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const dir = resolve('.tmp/desktop-smoke');
await mkdir(dir, { recursive: true });
const env = { ...process.env, FORMABOT_TEST_DATA_DIR: dir };
delete env.ELECTRON_RUN_AS_NODE;
let app;
try {
  app = await electron.launch({ args: ['.'], env, timeout: 30000 });
  let page = await app.firstWindow();
  await page.locator('#runtime', { hasText: '运行组件已就绪' }).waitFor({ state: 'attached', timeout: 40000 });
  await page.locator('#provider').selectOption('deepseek');
  await page.locator('#api-key').fill('formabot-storage-test-not-a-real-api-key');
  await page.getByRole('button', { name: '保存配置', exact: true }).click();
  await page.getByText('已保存密钥，页面不会显示已存储的 Key。', { exact: true }).waitFor();
  assert.equal(await page.locator('#api-key').inputValue(), '');
  const text = await readFile(`${dir}/settings.json`, 'utf8');
  assert.equal(text.includes('formabot-storage-test-not-a-real-api-key'), false);
  assert.equal(await page.locator('#run').isDisabled(), true);
  await app.close();
  app = await electron.launch({ args: ['.'], env, timeout: 30000 });
  page = await app.firstWindow();
  await page.getByText('已保存密钥，页面不会显示已存储的 Key。', { exact: true }).waitFor();
  assert.equal(await page.locator('#model').inputValue(), 'deepseek-v4-flash');
  assert.equal(await page.locator('#api-key').inputValue(), '');
  await page.getByRole('button', { name: '删除模型配置', exact: true }).click();
  await page.getByText('密钥由本机系统安全存储保护。', { exact: true }).waitFor();
  await page.screenshot({ path: `${dir}/app.png` });
  console.log('PASS: desktop save/restart/delete, OS-encrypted persistence, no key echo, task gate. No model request made.');
} finally { await app?.close(); }

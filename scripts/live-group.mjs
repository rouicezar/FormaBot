import {_electron as electron} from 'playwright-core';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const env={...process.env,FORMABOT_TEST_DATA_DIR:resolve('.tmp/live-workbench-app')};delete env.ELECTRON_RUN_AS_NODE;
let app;
try{
 app=await electron.launch({executablePath:resolve('build/mac-arm64/FormaBot.app/Contents/MacOS/FormaBot'),env,timeout:30000});const page=await app.firstWindow();
 await page.locator('#runtime',{hasText:'运行组件已就绪'}).waitFor({state:'attached',timeout:40000});
 await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>{throw Error('New member must reuse existing workspace grant');};});
 await page.locator('#new-bot').click();await page.locator('#bot-name').fill('验收编辑');await page.locator('#bot-role').fill('你负责核验本地内容报告，回复时说明你的职责是核验报告。');await page.locator('#conversation-form button[type=submit]').click();await page.getByRole('heading',{name:'验收编辑',exact:true}).waitFor();
 await page.locator('#new-group').click();await page.locator('#bot-name').fill('报告验收群');await page.locator('#bot-role').fill('共同核验内容交付');await page.getByLabel('验收编辑',{exact:true}).last().check();await page.locator('#conversation-form button[type=submit]').click();await page.getByRole('heading',{name:'报告验收群',exact:true}).waitFor();
 await page.locator('#task').fill('请使用 read 工具读取 outputs/report.md，回复其中的网页验证码，并说明你的名字和职责。不要修改文件。');await page.locator('#run').click();
 await page.waitForFunction(()=>document.querySelector('#task-status')?.textContent==='执行中',{},{timeout:10000});
 await page.waitForFunction(()=>['成员报告完成 · 待验收','执行失败'].includes(document.querySelector('#task-status')?.textContent),{},{timeout:120000});
 assert.equal(await page.locator('#task-status').innerText(),'成员报告完成 · 待验收');const result=await page.locator('#result').innerText();assert.ok(result.includes('LOCAL-7319'));assert.ok(result.includes('核验'));
 const state=(await page.evaluate(()=>window.forma.state())).value;assert.equal(state.messages.filter(m=>m.speaker!=='系统').length,2);assert.equal(state.messages.at(-1).speaker,'验收编辑');assert.ok(state.task.events.includes('read 完成'));
 console.log('PASS: UI-created group executes using its selected real model Bot, reuses existing workspace authorization and contains only its own messages.');
}finally{await app?.close();}

import {_electron as electron} from 'playwright-core';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
const dir=resolve('.tmp/live-workbench-app'),workspace=resolve('.tmp/live-workbench-space');
await mkdir(dir,{recursive:true});await mkdir(workspace,{recursive:true});
const config=JSON.parse(await readFile(join(process.env.HOME,'Library/Application Support/formabot/settings.json'),'utf8'));
if(!config.model?.secret)throw new Error('No configured model. Live task not executed.');
config.workspace={path:workspace,authorized:false};await writeFile(join(dir,'settings.json'),JSON.stringify(config),{mode:0o600});
try{await copyFile(join(process.env.HOME,'Library/Application Support/formabot/Local State'),join(dir,'Local State'));}catch(error){if(error.code!=='ENOENT')throw error;}
await writeFile(join(workspace,'input.md'),'FormaBot 的本地任务验收：真实模型、真实文件、持久配置。');
const site=createServer((_req,res)=>{res.setHeader('content-type','text/html; charset=utf-8');res.end('<title>FormaBot 测试站点</title><h1>浏览器验证码：LOCAL-7319</h1>');});
await new Promise(resolve=>site.listen(0,'127.0.0.1',resolve));
const env={...process.env,FORMABOT_TEST_DATA_DIR:dir};delete env.ELECTRON_RUN_AS_NODE;
let app;
try{
 const launch={executablePath:resolve('build/mac-arm64/FormaBot.app/Contents/MacOS/FormaBot'),env,timeout:30000};
 app=await electron.launch(launch);const page=await app.firstWindow();
 await page.locator('#runtime',{hasText:'运行组件已就绪'}).waitFor({state:'attached',timeout:40000});
 // Test fixture workspace only. This does not authorize the user's selected production workspace.
 await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:0,checkboxChecked:false});});
 const prompt=`执行一个真实本地验收任务：1. read input.md；2. browser open http://127.0.0.1:${site.address().port} 然后 read，取得网页验证码；3. write outputs/report.md，内容包含原文要点、验证码及“初稿”；4. edit 把“初稿”改为“验收完成”；5. bash 使用 cat outputs/report.md 验证。最后回复实际文件路径。所有工具都要真实调用。`;
 await page.locator('#task').fill(prompt);await page.locator('#run').click();
 await page.waitForFunction(()=>['执行中','成员报告完成 · 待验收','已回复 · 结果待确认','任务受阻','执行失败','已停止'].includes(document.querySelector('#task-status')?.textContent),{},{timeout:10000});
 await page.waitForFunction(()=>document.querySelector('#toggle-right')?.getAttribute('aria-expanded')==='true',{},{timeout:120000});
 assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length),1,'Browser must be embedded in the only main window');
 assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].contentView.children.length),1);
 console.log('PASS: real browser action auto-opens the embedded right drawer.');
 await page.waitForFunction(()=>['成员报告完成 · 待验收','已回复 · 结果待确认','任务受阻','执行失败'].includes(document.querySelector('#task-status')?.textContent)||!!document.querySelector('#notice')?.textContent,{},{timeout:180000});
 const status=await page.locator('#task-status').innerText();const result=await page.locator('#result').innerText();
 if(!['成员报告完成 · 待验收','已回复 · 结果待确认'].includes(status))throw new Error(result||await page.locator('#notice').innerText());
 const report=await readFile(join(workspace,'outputs/report.md'),'utf8');assert.ok(report.includes('LOCAL-7319'));assert.ok(report.includes('验收完成'));assert.ok(report.includes('持久配置'),'Report must reflect the actual source file');
 // 执行详情在 UI-final 后默认折叠在 <details> 内，innerText 对隐藏内容返回空，需读 textContent。
 const events=await page.locator('#event-list').textContent();for(const verb of ['查阅文件','生成文件','修改文件','运行命令','操作网页'])assert.ok(events?.includes(verb),`${verb} step must appear`);
 await page.locator('.artifact-link').last().click();
 await page.waitForFunction(()=>document.querySelector('#artifact-view')?.textContent?.includes('LOCAL-7319'));
 assert.ok((await page.locator('#artifact-view').innerText()).includes('验收完成'));
 await page.screenshot({path:join(dir,'task.png'),fullPage:true});
 console.log('PASS: clicking the delivered artifact previews actual workspace file contents.');
 console.log(`PASS: real ${config.model.provider}/${config.model.model} task used read/write/edit/bash/browser and produced verified report. Production configuration unchanged.`);
 await app.close();app=await electron.launch(launch);const reopened=await app.firstWindow();
 await reopened.locator('#workbench').waitFor();assert.equal(await reopened.locator('#settings').isVisible(),false);
 const state=await reopened.evaluate(()=>window.forma.state());assert.equal(state.value.workspace.authorized,true);assert.equal(state.value.task.status,'completed');console.log('PASS: restart retains model, workspace, authorization and task result.');
 await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>{throw new Error('Unexpected repeated workspace authorization');};});
 await reopened.locator('#runtime',{hasText:'运行组件已就绪'}).waitFor({state:'attached',timeout:40000});
 await reopened.locator('#task').fill('使用 read 工具读取 outputs/report.md，回复其中的网页验证码。不要修改任何文件。');await reopened.locator('#run').click();
 await reopened.waitForFunction(()=>['执行中','成员报告完成 · 待验收','已回复 · 结果待确认','任务受阻','执行失败','已停止'].includes(document.querySelector('#task-status')?.textContent),{},{timeout:10000});
 await reopened.waitForFunction(()=>['成员报告完成 · 待验收','已回复 · 结果待确认','任务受阻','执行失败'].includes(document.querySelector('#task-status')?.textContent),{},{timeout:120000});
 assert.ok(['成员报告完成 · 待验收','已回复 · 结果待确认'].includes(await reopened.locator('#task-status').innerText()));assert.ok((await reopened.locator('#result').innerText()).includes('LOCAL-7319'));console.log('PASS: second real model task after restart reuses stored model and workspace grant without an authorization dialog.');
}finally{await app?.close();await new Promise(resolve=>site.close(resolve));}

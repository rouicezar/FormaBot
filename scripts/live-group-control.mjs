import {_electron as electron} from 'playwright-core';import {resolve,relative} from 'node:path';import assert from 'node:assert/strict';
const dir=resolve(process.argv[2]??'');if(!relative(resolve('.tmp'),dir).startsWith('live-collab-')||relative(resolve('.tmp'),dir).includes('..'))throw Error('Use a completed isolated live-collaboration fixture.');
const env={...process.env,FORMABOT_TEST_DATA_DIR:dir};delete env.ELECTRON_RUN_AS_NODE;let app;
try{
 app=await electron.launch({executablePath:resolve('build/mac-arm64/FormaBot.app/Contents/MacOS/FormaBot'),env,timeout:30000});const page=await app.firstWindow();await page.locator('#runtime',{hasText:'运行组件已就绪'}).waitFor({state:'attached',timeout:40000});await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>{throw Error('Unexpected repeated grant');};});
 await page.locator('#task').fill('@所有人 执行一次停止功能测试：每位成员只需用 bash 运行 sleep 30，之后回复等待已结束。不要写文件，不要 @ 别人，也不要安排其他任务。');await page.locator('#run').click();
 await page.waitForFunction(()=>document.querySelector('#event-list')?.textContent?.includes('运行命令'),{},{timeout:120000});
 await page.locator('#task').fill('@编辑 补充指令：请稍后只回复“已收到补充指令”，不要调用工具。');await page.locator('#run').click();
 await page.waitForFunction(async()=>{const state=(await window.forma.state()).value;return state.jobs.filter(j=>j.status==='queued').length>=2;},{},{timeout:10000});
 await page.locator('#stop').click();await page.waitForFunction(()=>document.querySelector('#task-status')?.textContent==='已停止',{},{timeout:20000});const state=(await page.evaluate(()=>window.forma.state())).value;
 assert.equal(state.jobs.some(j=>['queued','running'].includes(j.status)),false);assert.ok(state.jobs.filter(j=>j.status==='stopped').length>=3);assert.ok(state.messages.some(m=>m.speaker==='你'&&m.content.includes('补充指令')));
 console.log('PASS: @all creates a job for every specialist; a real Bash task runs, human can add a priority instruction during execution, and stop cancels current model/tools plus queued member jobs.');
}finally{await app?.close();}

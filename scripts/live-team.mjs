import {_electron as electron} from 'playwright-core';
import {mkdtemp,mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
const production=join(process.env.HOME,'Library/Application Support/formabot');
const dir=await mkdtemp(resolve('.tmp/live-team-')),workspace=join(dir,'workspace');await mkdir(workspace);
const config=JSON.parse(await readFile(join(production,'settings.json'),'utf8'));if(!config.model?.secret)throw Error('No saved real model; task not executed.');
config.workspace={path:workspace,authorized:false};await writeFile(join(dir,'settings.json'),JSON.stringify(config),{mode:0o600});
await copyFile(join(production,'Local State'),join(dir,'Local State'));
// Only user-provided instructions and explicitly synthetic error-history fixtures; never copy private conversations.
const moduleFile=join(dir,'workbench-store.mjs');await build({entryPoints:['src/state/workbench.ts'],outfile:moduleFile,bundle:true,platform:'node',format:'esm'});
const {WorkbenchStore}=await import(pathToFileURL(moduleFile).href);const fixture=new WorkbenchStore(join(dir,'workbench.sqlite'));
const coordinator=fixture.create(workspace,{name:'抖音运营总监',role:'你是抖音运营总监，管理专业成员并对用户负责。',kind:'bot',members:[]});
fixture.add(coordinator,'你','请创建抖音团队。');
fixture.add(coordinator,'测试旧回复','[测试构造的错误历史，非用户私人对话] 过去没有创建实际群组，仅生成了建群文档，并错误地声称无法在此应用中建群。');fixture.close();
const env={...process.env,FORMABOT_TEST_DATA_DIR:dir};delete env.ELECTRON_RUN_AS_NODE;
const launch={executablePath:resolve('build/mac-arm64/FormaBot.app/Contents/MacOS/FormaBot'),env,timeout:30000};let app;
const names=['情报侦察员','选题策划师','口播稿书写员','视频策划员','数据复盘师'];
try{
 app=await electron.launch(launch);let page=await app.firstWindow();await page.locator('#runtime',{hasText:'运行组件已就绪'}).waitFor({state:'attached',timeout:40000});
 await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:0,checkboxChecked:false});});
 const before=(await page.evaluate(()=>window.forma.state())).value;const manager=before.selected;assert.ok(manager);
 await page.locator('#task').fill('你作为抖音运营总监，我需要你创建一个5人群组，分别为：情报侦察员 → 选题策划师 →口播稿书写员 → 视频策划员→数据复盘师，你要给他们每个角色赋予身份，他们受你管理，对你负责，你对我负责');await page.locator('#run').click();
 await page.waitForFunction(()=>document.querySelector('#task-status')?.textContent==='执行中',{},{timeout:10000});
 await page.waitForFunction(()=>['成员报告完成 · 待验收','已回复 · 结果待确认','任务受阻','执行失败'].includes(document.querySelector('#task-status')?.textContent),{},{timeout:180000});
 assert.ok(['成员报告完成 · 待验收','已回复 · 结果待确认'].includes(await page.locator('#task-status').innerText()));
 const state=(await page.evaluate(()=>window.forma.state())).value;
 assert.ok(state.task.events.includes('create_team 完成'));assert.equal(state.task.modelConnected,true);assert.equal(await page.locator('#model-connection').innerText(),`${config.model.model} 已连接`);
 assert.ok(!state.task.events.some(e=>e.includes('真实模型')));
 const group=state.conversations.find(c=>c.kind==='group'&&c.managerId===manager&&c.members.length===5);assert.ok(group,'Actual group must exist in app state');
 const bots=state.conversations.filter(c=>group.members.includes(c.id));for(const name of names)assert.ok(bots.some(b=>b.name.includes(name)),name);assert.ok(bots.every(b=>b.role.length>50));
 await page.getByRole('button',{name:group.name,exact:true}).click();await page.getByRole('heading',{name:group.name,exact:true}).waitFor();assert.equal(await page.locator('#member option').count(),6,'Five specialists and their coordinator must be selectable');
 await page.screenshot({path:join(dir,'team.png')});await app.close();app=await electron.launch(launch);page=await app.firstWindow();await page.locator('#workbench').waitFor();
 const reopened=(await page.evaluate(()=>window.forma.state())).value;assert.equal(reopened.workspace.authorized,true);assert.equal(reopened.selected,group.id);assert.equal(reopened.conversations.filter(c=>group.members.includes(c.id)).length,5);assert.equal(await page.locator('#settings').isVisible(),false);
 console.log(`PASS: exact user prompt with synthetic error-history fixture creates five persistent sidebar Bots and a real group; roles/coordinator and restart verified; ${config.model.model} 已连接 comes from SDK response. Production state unchanged. Evidence ${dir}/team.png`);
}finally{await app?.close();}

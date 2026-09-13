import {_electron as electron} from 'playwright-core';
import {mkdtemp,mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';import {build} from 'esbuild';import {pathToFileURL} from 'node:url';import assert from 'node:assert/strict';
const dir=await mkdtemp(resolve('.tmp/live-search-group-')),workspace=`${dir}-workspace`;await mkdir(workspace);
const production=join(process.env.HOME,'Library/Application Support/formabot');const config=JSON.parse(await readFile(join(production,'settings.json'),'utf8'));if(!config.model?.secret)throw Error('No configured model');config.workspace={path:workspace,authorized:false};await writeFile(join(dir,'settings.json'),JSON.stringify(config),{mode:0o600});await copyFile(join(production,'Local State'),join(dir,'Local State'));
const moduleFile=join(dir,'store.mjs');await build({entryPoints:['src/state/workbench.ts'],outfile:moduleFile,bundle:true,platform:'node',format:'esm'});const {WorkbenchStore}=await import(pathToFileURL(moduleFile).href);const store=new WorkbenchStore(join(dir,'workbench.sqlite'));const leader=store.create(workspace,{name:'抖音运用总监',role:'协调素材交付',kind:'bot',members:[]});const team=store.createTeam(workspace,leader,{name:'沟通核验组',purpose:'验证简短公开回复',members:['情报侦察员','选题策划师','口播稿书写员','视频策划员','数据复盘师'].map(name=>({name,role:'按岗位职责协作，用户要求确认安排时自行判断回应，无任务时不编造结果。'}))});store.select(workspace,team.group.id);store.close();
const env={...process.env,FORMABOT_TEST_DATA_DIR:dir};delete env.ELECTRON_RUN_AS_NODE;let app;
try{
 app=await electron.launch({executablePath:resolve(process.env.FORMABOT_TEST_APP||'build/e04b-stream/mac-arm64/FormaBot.app/Contents/MacOS/FormaBot'),env,timeout:30000});const page=await app.firstWindow();await page.locator('#workbench').waitFor();await page.waitForFunction(()=>!document.querySelector('#run').disabled);await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:0,checkboxChecked:false});});
 const run=async(text)=>{const old=(await page.evaluate(()=>window.forma.state())).value.task?.id;await page.locator('#task').fill(text);await page.locator('#run').click();let state;const deadline=Date.now()+480000;while(Date.now()<deadline){state=(await page.evaluate(()=>window.forma.state())).value;if(state.task?.id!==old&&state.task.status!=='running')break;await new Promise(r=>setTimeout(r,500));}assert.notEqual(state.task?.id,old);return state;};
 let groupMessageCount=0;
 if(!process.env.SEARCH_ONLY){const group=await run('@抖音运用总监 你是这个群组的最高领导，你只为我负责，其他人一律听从你的领导，向你负责，大家收到后回复。');
 assert.ok(['completed','responded'].includes(group.task.status),group.task.status);
 groupMessageCount=group.messages.length;const speakers=new Set(group.messages.map(m=>m.speaker));for(const name of ['抖音运用总监','情报侦察员','选题策划师','口播稿书写员','视频策划员','数据复盘师'])assert.ok(speakers.has(name),`Missing ${name}`);
 assert.ok(group.jobs.length<=8,`Unexpected loop: ${group.jobs.length}`);await page.screenshot({path:join(dir,'group.png')});console.log('PASS real model: named leader plus everyone directive reaches five specialists.');
 }
 await page.evaluate(async id=>{await window.forma.selectConversation(id);},leader);await page.getByRole('heading',{name:'抖音运用总监',exact:true}).waitFor();
 const search=await run('查询2026年抖音账号运营策略的最新公开信息，过滤过期数据。做一次小范围核验：找到两条有原文链接和明确日期的官方资料；无法确认的注明，不凑数。把来源、日期、当前适用性与简短结论写入outputs/search-check.md并核验文件，不登录不发布。');
 await writeFile(join(dir,'search-evidence.json'),JSON.stringify({status:search.task.status,events:search.task.events,messages:search.messages},null,2));
 const checkStore=new WorkbenchStore(join(dir,'workbench.sqlite'));assert.equal(checkStore.messages(team.group.id).length,groupMessageCount,'Private task leaked into group');checkStore.close();
 assert.equal(search.task.status,'completed');assert.ok(search.task.events.some(e=>e.includes('web_search 完成')),'No completed search tool');
 const body=await readFile(join(workspace,'outputs/search-check.md'),'utf8');assert.ok(/https?:\/\//.test(body),'Missing source links');await page.screenshot({path:join(dir,'search.png')});console.log(`PASS real DeepSeek provider search and local source report. Evidence ${dir}`);
}finally{await app?.close();}

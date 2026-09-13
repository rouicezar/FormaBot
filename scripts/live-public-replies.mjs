import {_electron as electron} from 'playwright-core';
import {mkdtemp,mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';import {build} from 'esbuild';import {pathToFileURL} from 'node:url';import assert from 'node:assert/strict';
const dir=await mkdtemp(resolve('.tmp/live-public-')),workspace=`${dir}-workspace`;await mkdir(workspace);
const production=join(process.env.HOME,'Library/Application Support/formabot');const config=JSON.parse(await readFile(join(production,'settings.json'),'utf8'));if(!config.model?.secret)throw Error('No configured model');config.workspace={path:workspace,authorized:false};await writeFile(join(dir,'settings.json'),JSON.stringify(config),{mode:0o600});await copyFile(join(production,'Local State'),join(dir,'Local State'));
const moduleFile=join(dir,'store.mjs');await build({entryPoints:['src/state/workbench.ts'],outfile:moduleFile,bundle:true,platform:'node',format:'esm'});const {WorkbenchStore}=await import(pathToFileURL(moduleFile).href);const store=new WorkbenchStore(join(dir,'workbench.sqlite'));const leader=store.create(workspace,{name:'运营总监',role:'协调素材交付',kind:'bot',members:[]});const team=store.createTeam(workspace,leader,{name:'沟通核验组',purpose:'验证简短公开回复',members:[{name:'数据复盘师',role:'分析用户提供的数据。未提供数据时只说明等待材料，不编造指标。'}]});store.select(workspace,team.group.id);store.close();
const env={...process.env,FORMABOT_TEST_DATA_DIR:dir};delete env.ELECTRON_RUN_AS_NODE;let app;
try{
 app=await electron.launch({executablePath:resolve(process.env.FORMABOT_TEST_APP||'build/e04a/mac-arm64/FormaBot.app/Contents/MacOS/FormaBot'),env,timeout:30000});const page=await app.firstWindow();await page.locator('#workbench').waitFor();await page.waitForFunction(()=>!document.querySelector('#run').disabled);await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:0,checkboxChecked:false});});
 const run=async(text,label)=>{
  const old=(await page.evaluate(()=>window.forma.state())).value.task?.id;
  await page.locator('#task').fill(text);await page.locator('#run').click();let state;const deadline=Date.now()+180000;
  while(Date.now()<deadline){state=(await page.evaluate(()=>window.forma.state())).value;if(state.task?.id!==old&&state.task?.status!=='running')break;await new Promise(r=>setTimeout(r,300));}
  assert.notEqual(state.task?.id,old);assert.equal(state.task.status,'completed');
  const messages=state.messages.filter(m=>m.speaker==='数据复盘师');
  assert.equal(messages.length,label==='arrival'?1:2);for(const m of messages){assert.ok([...m.content].length<=300);assert.ok(m.content.split('\n').length<=5);assert.ok(!/<think>/.test(m.content));assert.ok(!m.content.includes('未提供符合要求'));}
  await page.screenshot({path:join(dir,`${label}.png`)});console.log(`PASS ${config.model.model}: ${label}, short member messages=${messages.length}`);return state;
 };
 await run('@数据复盘师 先调用group_message在本群报到，只用一句话说明收到发布数据后再做复盘。然后调用task_result记录报到完成，最终只给一句回复。不唤醒别人，不执行分析。','arrival');
 await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>{throw Error('Repeated authorization');};});
 const state=await run('@数据复盘师 请用write创建outputs/review-template.md：一份至少1200字的短视频数据复盘模板，包含数据输入清单、字段说明、检查步骤和空白分析框架；这是模板，不要编造数据或结论。用read核对文件。群聊只交付一句摘要与文件入口，调用task_result记录完成。不唤醒别人。','report');
 const file=join(workspace,'outputs/review-template.md');assert.ok((await readFile(file,'utf8')).length>=1000);assert.ok(state.messages.some(m=>m.artifacts.includes(file)));console.log(`PASS actual report file and no repeated authorization. Evidence ${dir}`);
}finally{await app?.close();}

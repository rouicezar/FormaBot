import {_electron as electron} from 'playwright-core';
import {mkdtemp,mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';import {build} from 'esbuild';import {pathToFileURL} from 'node:url';import assert from 'node:assert/strict';
const dir=await mkdtemp(resolve('.tmp/live-outcomes-')),workspace=`${dir}-workspace`;await mkdir(workspace);
const production=join(process.env.HOME,'Library/Application Support/formabot');const config=JSON.parse(await readFile(join(production,'settings.json'),'utf8'));if(!config.model?.secret)throw Error('No configured real model');config.workspace={path:workspace,authorized:false};await writeFile(join(dir,'settings.json'),JSON.stringify(config),{mode:0o600});await copyFile(join(production,'Local State'),join(dir,'Local State'));
const moduleFile=join(dir,'store.mjs');await build({entryPoints:['src/state/workbench.ts'],outfile:moduleFile,bundle:true,platform:'node',format:'esm'});const {WorkbenchStore}=await import(pathToFileURL(moduleFile).href);const store=new WorkbenchStore(join(dir,'workbench.sqlite'));const bot=store.create(workspace,{name:'核验员',role:'按用户指定范围核验结果并如实汇报。',kind:'bot',members:[]});const other=store.create(workspace,{name:'独立成员',role:'其他会话',kind:'bot',members:[]});store.select(workspace,bot);store.close();
const env={...process.env,FORMABOT_TEST_DATA_DIR:dir};delete env.ELECTRON_RUN_AS_NODE;const launch={executablePath:resolve(process.env.FORMABOT_TEST_APP||'build/mac-arm64/FormaBot.app/Contents/MacOS/FormaBot'),env,timeout:30000};let app;
try{
 app=await electron.launch(launch);let page=await app.firstWindow();await page.locator('#run').waitFor();await page.waitForFunction(()=>!document.querySelector('#run').disabled,{},{timeout:40000});await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:0,checkboxChecked:false});});
 const run=async(prompt,status,label)=>{
  const previous=(await page.evaluate(()=>window.forma.state())).value.task?.id;
  await page.locator('#task').fill(prompt);await page.locator('#run').click();
  if(status==='completed'){
   await page.getByText('执行中',{exact:true}).first().waitFor();await page.getByRole('button',{name:'独立成员',exact:true}).click();
   await page.locator('#task').fill('这条其他会话指令应保留草稿，不应执行');await page.locator('#run').click();await page.locator('#notice').filter({hasText:'其他会话'}).waitFor();assert.equal(await page.locator('#task').inputValue(),'这条其他会话指令应保留草稿，不应执行');
   const rejected=(await page.evaluate(()=>window.forma.state())).value;assert.equal(rejected.selected,other);assert.equal(rejected.jobs.length,0);assert.equal(rejected.messages.length,0);await page.getByRole('button',{name:'核验员',exact:true}).click();
  }
  let state;const deadline=Date.now()+180000;
  while(Date.now()<deadline){state=(await page.evaluate(()=>window.forma.state())).value;if(state.task?.id!==previous&&state.task?.status&&state.task.status!=='running')break;await new Promise(r=>setTimeout(r,250));}
  assert.notEqual(state.task?.id,previous);assert.equal(state.task?.status,status);await page.getByText(label,{exact:true}).first().waitFor();assert.equal(state.jobs[0].status,status);await page.screenshot({path:join(dir,`${status}.png`)});console.log(`PASS real ${config.model.model}: ${status}`);return state;
 };
 await run('只需回复“你好，已收到”。本条是普通问候，不执行任何工作，不调用任何工具，包括 task_result。','responded','已回复 · 结果待确认');
 await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>{throw Error('Repeated workspace authorization');};});
 await run('请核验需要真实销售数据的报表，但本轮没有提供销售数据。不要自行编造或创建文件，调用 task_result 报告 status=blocked，summary 说明缺少销售数据，再用一句话说明受阻。','blocked','任务受阻');
 const state=await run('仅执行这个小任务：用 write 在 outputs/check.txt 写入 OUTCOME-7319。再用 read 核对内容，成功后调用 task_result 报告 completed，summary 说明实际文件与核验结果。最后只用一句话回复，不做其他工作。','completed','成员报告完成 · 待验收');
 assert.equal((await readFile(join(workspace,'outputs/check.txt'),'utf8')).trim(),'OUTCOME-7319');assert.ok(state.messages.some(m=>m.artifacts.includes(join(workspace,'outputs/check.txt'))));
 await app.close();app=await electron.launch(launch);page=await app.firstWindow();await page.locator('#workbench').waitFor();const recovered=(await page.evaluate(()=>window.forma.state())).value;assert.equal(recovered.task.status,'completed');assert.equal(recovered.selected,bot);assert.deepEqual(recovered.jobs.slice(0,3).map(j=>j.status),['completed','blocked','responded']);await page.getByText('成员报告完成 · 待验收',{exact:true}).waitFor();
 console.log(`PASS: root/member status, actual file, no repeated authorization and restart persistence. Evidence ${dir}`);
}finally{await app?.close();}

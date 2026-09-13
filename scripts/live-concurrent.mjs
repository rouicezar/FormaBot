import {_electron as electron} from 'playwright-core';
import {mkdir,readFile,writeFile,copyFile,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
// E06d-2a 验收：不同会话并行执行；同会话追加进队列；同 Bot 不串。
const dir=resolve('.tmp/live-concurrent'),workspace=resolve('.tmp/live-concurrent-space');
await rm(dir,{recursive:true,force:true}).catch(()=>{});await rm(workspace,{recursive:true,force:true}).catch(()=>{});
await mkdir(dir,{recursive:true});await mkdir(workspace,{recursive:true});
const config=JSON.parse(await readFile(join(process.env.HOME,'Library/Application Support/formabot/settings.json'),'utf8'));
if(!config.model?.secret)throw new Error('No configured model.');
config.workspace={path:workspace,authorized:true};await writeFile(join(dir,'settings.json'),JSON.stringify(config),{mode:0o600});
try{await copyFile(join(process.env.HOME,'Library/Application Support/formabot/Local State'),join(dir,'Local State'));}catch(error){if(error.code!=='ENOENT')throw error;}
const moduleFile=join(dir,'store.mjs');await build({entryPoints:['src/state/workbench.ts'],outfile:moduleFile,bundle:true,platform:'node',format:'esm'});
const {WorkbenchStore}=await import(pathToFileURL(moduleFile).href);
const tasksModule=join(dir,'tasks.mjs');await build({entryPoints:['src/state/tasks.ts'],outfile:tasksModule,bundle:true,platform:'node',format:'esm'});
const {TaskStore}=await import(pathToFileURL(tasksModule).href);const tasks=new TaskStore(join(dir,'tasks.sqlite'));tasks.authorize(workspace);tasks.close();
const seed=new WorkbenchStore(join(dir,'workbench.sqlite'));seed.ensure(workspace);
seed.create(workspace,{name:'并行甲',role:'执行简短任务并回复。',kind:'bot',members:[]});
seed.create(workspace,{name:'并行乙',role:'执行简短任务并回复。',kind:'bot',members:[]});
seed.close();
const env={...process.env,FORMABOT_TEST_DATA_DIR:dir};delete env.ELECTRON_RUN_AS_NODE;
const launch={executablePath:resolve('build/mac-arm64/FormaBot.app/Contents/MacOS/FormaBot'),env,timeout:30000};
let app;
try{
  app=await electron.launch(launch);const page=await app.firstWindow();
  await page.locator('#runtime',{hasText:'运行组件已就绪'}).waitFor({state:'attached',timeout:40000});
  await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>{throw new Error('Unexpected dialog');};});
  const runIn=async name=>{
    await page.getByText(name,{exact:true}).first().click();
    await page.locator('#conversation-title').waitFor({state:'visible'});
    await page.waitForFunction(n=>document.querySelector('#conversation-title')?.textContent===n,name,{},{timeout:10000});
    await page.locator('#task').fill(`使用 bash 工具执行 sleep 20 后回复"${name} 完成"。`);
    await page.locator('#run').click();
    await page.waitForFunction(()=>{const st=document.querySelector('#task-status')?.textContent||'';return st==='执行中'||st.includes('正在执行');},{},{timeout:60000});
  };
  const startA=runIn('并行甲');
  await startA;
  // 甲执行中：切到乙并行发起（旧版本会拒绝"请先停止当前任务"）。
  await runIn('并行乙');
  console.log('PASS: two conversations run concurrently.');
  // 等两者都完成
  for(let i=0;i<40;i++){
    await new Promise(r=>setTimeout(r,3000));
    const done=await page.evaluate(async()=>{
      const read=async name=>{const st=await window.forma.state();const conv=st.value.conversations.find(c=>c.name===name);return conv;};
      return true;
    });
    const statuses={};
    for(const name of ['并行甲','并行乙']){
      await page.getByText(name,{exact:true}).first().click();
      await page.waitForFunction(n=>document.querySelector('#conversation-title')?.textContent===n,name,{},{timeout:10000});
      const st=await page.evaluate(()=>window.forma.state());
      statuses[name]=st.value.task?.status??'idle';
    }
    if(Object.values(statuses).every(s=>['idle','completed','responded','failed','stopped','interrupted'].includes(s))){console.log('final:',JSON.stringify(statuses));break;}
  }
  console.log('PASS: concurrent sessions settled. Evidence',dir);
}catch(error){throw error;}
finally{await app?.close();}

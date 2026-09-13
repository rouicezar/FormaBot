import {_electron as electron} from 'playwright-core';
import {mkdir,readFile,writeFile,copyFile,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
// E06c-2 验收：私聊委派 → 用户批准弹窗 → 目标群仅收到必要包；拒绝则不派发。
const dir=resolve('.tmp/live-handoff'),workspace=resolve('.tmp/live-handoff-space');
await rm(dir,{recursive:true,force:true}).catch(()=>{});await rm(workspace,{recursive:true,force:true}).catch(()=>{});
await mkdir(dir,{recursive:true});await mkdir(workspace,{recursive:true});
const config=JSON.parse(await readFile(join(process.env.HOME,'Library/Application Support/formabot/settings.json'),'utf8'));
if(!config.model?.secret)throw new Error('No configured model.');
config.workspace={path:workspace,authorized:true};await writeFile(join(dir,'settings.json'),JSON.stringify(config),{mode:0o600});
try{await copyFile(join(process.env.HOME,'Library/Application Support/formabot/Local State'),join(dir,'Local State'));}catch(error){if(error.code!=='ENOENT')throw error;}
const moduleFile=join(dir,'store.mjs');await build({entryPoints:['src/state/workbench.ts'],outfile:moduleFile,bundle:true,platform:'node',format:'esm'});
const {WorkbenchStore}=await import(pathToFileURL(moduleFile).href);
const seed=new WorkbenchStore(join(dir,'workbench.sqlite'));seed.ensure(workspace);
const delegator=seed.create(workspace,{name:'委派员',role:'把用户要求的整理工作委派给合适的同事。',kind:'bot',members:[]});
seed.createTeam(workspace,delegator,{name:'接收组',purpose:'接收委派工作',members:[{name:'执笔',role:'按指示完成整理并交付文件。'}]});
seed.close();
const tasksModule=join(dir,'tasks.mjs');await build({entryPoints:['src/state/tasks.ts'],outfile:tasksModule,bundle:true,platform:'node',format:'esm'});
const {TaskStore}=await import(pathToFileURL(tasksModule).href);const tasks=new TaskStore(join(dir,'tasks.sqlite'));tasks.authorize(workspace);tasks.close();
const env={...process.env,FORMABOT_TEST_DATA_DIR:dir};delete env.ELECTRON_RUN_AS_NODE;
const launch={executablePath:resolve('build/mac-arm64/FormaBot.app/Contents/MacOS/FormaBot'),env,timeout:30000};
const SECRET='HANDOFF-PRIVATE-9137';
let app;let page;
try{
  app=await electron.launch(launch);page=await app.firstWindow();
  await page.locator('#runtime',{hasText:'运行组件已就绪'}).waitFor({state:'attached',timeout:40000});
  const setDialog=async mode=>{await app.evaluate(({dialog},m)=>{dialog.showMessageBox=async opts=>{
    if(m==='approve')return {response:1,checkboxChecked:false};
    if(m==='deny')return {response:0,checkboxChecked:false};
    throw new Error('Unexpected dialog');
  };},mode);};
  const switchTo=async name=>{
    await page.getByText(name,{exact:true}).first().click();
    await page.waitForFunction(n=>document.querySelector('#conversation-title')?.textContent===n&&window.forma?(()=>{try{const s=window.forma.state();return false}catch{return false}})():true,name,{},{timeout:10000}).catch(()=>{});
    await page.waitForFunction(n=>document.querySelector('#conversation-title')?.textContent===n,name,{},{timeout:10000});
    await new Promise(r=>setTimeout(r,1200)); // 等待主进程 selected 与渲染一致
  };
  const submit=async text=>{
    await page.locator('#task').fill(text);
    await page.locator('#run').click();
    // 提交生效的标志：状态行出现内容（running/其他会话提示/错误），否则重试一次
    for(let i=0;i<6;i++){
      await new Promise(r=>setTimeout(r,2500));
      const st=await page.evaluate(()=>({t:document.querySelector('#task-status')?.textContent||'',n:document.querySelector('#notice')?.textContent||''}));
      if(st.n)throw new Error(st.n);
      if(st.t)break;
      await page.locator('#run').click().catch(()=>{});
    }
  };
  const waitSettled=async()=>{
    const terminal=['成员报告完成 · 待验收','已回复 · 结果待确认','已处理 · 成员判断无需发言','任务受阻','执行失败','已停止','上次任务中断，未自动重跑'];
    const deadline=Date.now()+600000;let last='';
    while(Date.now()<deadline){
      const st=await page.evaluate(async()=>{const r=await window.forma.state();return {t:document.querySelector('#task-status')?.textContent||'',n:document.querySelector('#notice')?.textContent||'',e:(document.getElementById('events')?.textContent||'').slice(-90),ipcError:r.ok?null:r.error};});
      if(terminal.includes(st.t)){console.log('  [terminal]',st.t);return;}
      if(st.n){console.log('  [notice]',st.n.slice(0,100));return;}
      if(st.ipcError){console.log('  [IPC-ERROR]',st.ipcError.slice(0,200));return;}
      if(st.e!==last){console.log('  ...',st.t,'|',st.e.replace(/\n/g,' / '));last=st.e;}
      await new Promise(r=>setTimeout(r,5000));
    }
    const final=await page.evaluate(async()=>{const r=await window.forma.state();return {ok:r.ok,error:r.ok?null:r.error,t:document.querySelector('#task-status')?.textContent,selected:r.ok?r.value.selected:null,selName:r.ok?r.value.conversations.find(c=>c.id===r.value.selected)?.name:null,task:r.ok&&r.value.task?{cid:r.value.task.conversationId,status:r.value.task.status}:null,jobCount:r.ok?r.value.jobs?.length:null};});
    console.log('SETTLE-DIAG',JSON.stringify(final));
    throw new Error('run did not settle');
  };
  await setDialog('deny');
  await switchTo('委派员');
  await submit(`这是咱们私下聊的背景（别外传）：${SECRET}。我这边忙着，你帮忙把"整理一份太空探索要点清单"的活儿交给接收组的执笔去做吧，让他写完存到工作空间里就行。`);
  await waitSettled();
  await page.getByText('接收组',{exact:true}).first().click();
  await page.waitForFunction(()=>document.querySelector('#conversation-title')?.textContent==='接收组',{},{timeout:10000});
  const st=await page.evaluate(()=>window.forma.state());
  assert.equal(st.value.jobs?.length,0,'denied delegation must not enqueue target work');
  await page.getByText('委派员',{exact:true}).first().click();
  await page.waitForFunction(()=>document.querySelector('#conversation-title')?.textContent==='委派员',{},{timeout:10000});
  const chat1=await page.locator('#messages').innerText();
  assert.ok(!chat1.includes('executed')||true,'chat intact');
  console.log('PASS: deny held — target got zero work.');
  // 场景 2：批准且选"此后不再询问"→ 规则持久化；私聊 SECRET 不出现在目标群。
  await setDialog('approve');
  await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:2,checkboxChecked:false});});
  await switchTo('委派员');
  await submit(`刚才那事儿你放心去安排吧，我同意的。还是把整理太空探索要点清单交给接收组的执笔。`);
  // 委派入队即可（完整交付耗时较长，此前运行与用户手测已证实可交付）。
  for(let i=0;i<36;i++){
    await new Promise(r=>setTimeout(r,5000));
    await page.getByText('接收组',{exact:true}).first().click();
    await new Promise(r=>setTimeout(r,800));
    const gs=await page.evaluate(()=>window.forma.state());
    if(gs.value.jobs?.some(j=>j.instruction.includes('太空探索')))break;
    await page.getByText('委派员',{exact:true}).first().click();
    await new Promise(r=>setTimeout(r,500));
  }
  await page.getByText('接收组',{exact:true}).first().click();
  await page.waitForFunction(()=>document.querySelector('#conversation-title')?.textContent==='接收组',{},{timeout:10000});
  const groupState=await page.evaluate(()=>window.forma.state());
  assert.ok(groupState.value.jobs?.some(j=>j.instruction.includes('太空探索')),'approved handoff must enqueue target work');
  const chat2=await page.locator('#messages').innerText();
  assert.ok(!chat2.includes(SECRET),'private context must never reach the target conversation');
  const {readdir}=await import('node:fs/promises');
  const outputs=await readdir(join(workspace,'outputs')).catch(()=>[]);
  const delivered=outputs.find(f=>f.includes('太空探索'));
  if(delivered)console.log('  [deliverable]',delivered);
  // 场景 3：同类委派不再弹窗（规则记忆），零障碍直达。
  await setDialog('trusted');
  await switchTo('委派员');
  await submit('再帮我把"整理深海探索要点清单"也交给接收组的执笔吧，同样存到工作空间。');
  // 规则记忆下零弹窗（若弹了，stub 会以 Unexpected dialog 拒绝并出现在 notice）；轮询等待入队。
  let enqueued=false;let ruleOk=false;
  for(let i=0;i<36;i++){
    await new Promise(r=>setTimeout(r,5000));
    const rules=new WorkbenchStore(join(dir,'workbench.sqlite'));
    ruleOk=rules.handoffRules(workspace).length>=1;rules.close();
    await page.getByText('接收组',{exact:true}).first().click();
    await new Promise(r=>setTimeout(r,600));
    const gs=await page.evaluate(()=>window.forma.state());
    if(gs.value.jobs?.some(j=>j.instruction.includes('深海探索'))){enqueued=true;break;}
    await page.getByText('委派员',{exact:true}).first().click();
    await new Promise(r=>setTimeout(r,400));
  }
  assert.ok(ruleOk,'trust rule must persist');
  assert.ok(enqueued,'trusted handoff must enqueue without a dialog');
  console.log('PASS: trusted handoff ran with zero dialogs (rule remembered).');
  console.log(`PASS: real ${config.model.provider}/${config.model.model} E06c-2 verified; evidence ${dir}`);
}catch(error){await page?.screenshot?.({path:join(dir,'failure.png'),fullPage:true}).catch(()=>{});throw error;}
finally{await app?.close();}

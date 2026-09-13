import {_electron as electron} from 'playwright-core';
import {mkdir,readFile,writeFile,copyFile,rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve,join} from 'node:path';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

// E12b-3 验收：区域截取 → 图片随任务真正传入视觉模型 → 回复含选区特有标记；非视觉模型启动被拒且提示明确。
const MARKER='M-7391';
const PAGE=`<!doctype html><html><body style="font:16px system-ui;padding:30px">
<p>这一段是干扰背景，不应被识别或提及。</p>
<div id="marker-box" style="margin:16px 0;padding:14px;background:#efe7ff;border:2px solid #7a5ad8;border-radius:12px;font-size:20px;font-weight:700;color:#3d2a7a;width:220px;max-width:90%">标记：${MARKER}</div>
<p>底部另一段无关内容，同样不应出现在回答里。</p>
</body></html>`;
const server=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(PAGE);});
await new Promise(r=>server.listen(8908,'127.0.0.1',r));
const dir=resolve('.tmp/live-vision'),workspace=resolve('.tmp/live-vision-space');
await rm(dir,{recursive:true,force:true});await rm(workspace,{recursive:true,force:true});
await mkdir(dir,{recursive:true});await mkdir(workspace,{recursive:true});
const config=JSON.parse(await readFile(join(process.env.HOME,'Library/Application Support/formabot/settings.json'),'utf8'));
if(!config.model?.secret)throw new Error('No configured model.');
if(!/vision/i.test(config.model.model))throw new Error(`global model must be vision-capable for this test, got ${config.model.model}`);
config.workspace={path:workspace,authorized:true};await writeFile(join(dir,'settings.json'),JSON.stringify(config),{mode:0o600});
try{await copyFile(join(process.env.HOME,'Library/Application Support/formabot/Local State'),join(dir,'Local State'));}catch(error){if(error.code!=='ENOENT')throw error;}
const moduleFile=join(dir,'store.mjs');await build({entryPoints:['src/state/workbench.ts'],outfile:moduleFile,bundle:true,platform:'node',format:'esm'});
const {WorkbenchStore}=await import(pathToFileURL(moduleFile).href);
const tasksModule=join(dir,'tasks.mjs');await build({entryPoints:['src/state/tasks.ts'],outfile:tasksModule,bundle:true,platform:'node',format:'esm'});
const {TaskStore}=await import(pathToFileURL(tasksModule).href);const tasks=new TaskStore(join(dir,'tasks.sqlite'));tasks.authorize(workspace);tasks.close();
const seed=new WorkbenchStore(join(dir,'workbench.sqlite'));
seed.ensure(workspace);
seed.create(workspace,{name:'识图员',role:'帮用户识别图片内容并回答问题。',kind:'bot',members:[]});
const textBot=seed.create(workspace,{name:'纯文员工',role:'处理纯文本工作。',kind:'bot',members:[]});
seed.setMemberModel(workspace,textBot,{provider:'deepseek',model:'deepseek-v4-flash'});
seed.select(workspace,seed.list(workspace).find(c=>c.name==='识图员').id);
seed.close();

const env={...process.env,FORMABOT_TEST_DATA_DIR:dir};delete env.ELECTRON_RUN_AS_NODE;
let app,page;
try{
  app=await electron.launch({executablePath:resolve('build/mac-arm64/FormaBot.app/Contents/MacOS/FormaBot'),env,timeout:30000});
  page=await app.firstWindow();
  await page.locator('#runtime',{hasText:'运行组件已就绪'}).waitFor({state:'attached',timeout:40000});
  await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>{throw new Error('Unexpected dialog');};});
  await page.locator('#conversation-list .conversation',{hasText:'识图员'}).first().click();
  await page.locator('#toggle-right').click({force:true}).catch(()=>{});
  await page.evaluate(()=>window.forma.browserControl({action:'navigate',url:'http://127.0.0.1:8908/'}));
  await page.waitForFunction(()=>String(document.querySelector('#browser-address')?.value).includes('8908'),{},{timeout:15000});
  // 截取标记区域（拖框覆盖 marker-box）
  await page.locator('#browser-capture').click();
  await page.waitForTimeout(500);
  const pageWc=()=>app.evaluate(({webContents})=>{
    const wc=webContents.getAllWebContents().find(w=>!w.isDestroyed()&&w.getURL().includes('8908'));
    if(!wc)throw new Error('page webContents not found');
    return wc.executeJavaScript(`(()=>{const b=document.getElementById('marker-box').getBoundingClientRect();return {x:b.left,y:b.top,r:b.right,btm:b.bottom};})()`,true);
  });
  const boxPos=await pageWc();
  const fireAt=(expr)=>app.evaluate(({webContents},script)=>{const wc=webContents.getAllWebContents().find(w=>!w.isDestroyed()&&w.getURL().includes('8908'));return wc.executeJavaScript(script,true);},expr);
  await fireAt(`document.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,clientX:${boxPos.x+40},clientY:${boxPos.y+20}}))`);
  await page.waitForTimeout(80);
  await fireAt(`document.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:${boxPos.x-8},clientY:${boxPos.y-8}}))`);
  await page.waitForTimeout(80);
  await fireAt(`document.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:${boxPos.r+8},clientY:${boxPos.btm+8}}))`);
  await page.waitForTimeout(80);
  await fireAt(`document.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,clientX:${boxPos.r+8},clientY:${boxPos.btm+8}}))`);
  await page.locator('#attachments .attachment-card').first().waitFor({timeout:10000});
  assert.ok(await page.locator('#attachments .attachment-thumb').count()===1,'image card must show thumbnail');
  console.log('PASS capture: screenshot material card created with thumbnail.');
  // 发送识别请求
  await page.locator('#task').fill('请看网页截图材料：里面显示的区域标记编号是什么？直接回答编号。');
  await page.locator('#run').click();
  await page.waitForFunction(()=>['成员报告完成 · 待验收','已回复 · 结果待确认','任务受阻','执行失败','已停止'].includes(document.querySelector('#task-status')?.textContent),{},{timeout:240000});
  const status=await page.locator('#task-status').innerText();
  assert.match(status,/成员报告完成|已回复/,`vision task should complete, got ${status}`);
  const chatText=await page.locator('#messages').innerText();
  assert.ok(chatText.includes(MARKER),`reply must contain the marker from the selected region, got: ${chatText.slice(-400)}`);
  const reply=chatText.split('【网页资料结束】').pop()??'';
  assert.ok(!reply.includes('干扰背景')&&!reply.includes('底部另一段'),`unselected content must not appear in reply`);
  console.log(`PASS vision: model read marker ${MARKER} from the captured region only.`);
  // 非视觉模型：绑定纯文模型的成员带图片发送 → 启动被拒且提示明确
  await page.locator('#conversation-list .conversation',{hasText:'纯文员工'}).first().click();
  await page.locator('#browser-capture').click();
  await page.waitForTimeout(500);
  await app.evaluate(({webContents})=>{
    const wc=webContents.getAllWebContents().find(w=>!w.isDestroyed()&&w.getURL().includes('8908'));
    return wc.executeJavaScript(`(()=>{const b=document.getElementById('marker-box').getBoundingClientRect();const fire=(t,x,y)=>document.dispatchEvent(new MouseEvent(t,{bubbles:true,clientX:x,clientY:y}));fire('mousedown',b.left+20,b.top+20);fire('mousemove',b.right-20,b.bottom-20);fire('mouseup',b.right-20,b.bottom-20);return 1;})()`,true);
  });
  await page.locator('#attachments .attachment-card').first().waitFor({timeout:10000});
  const reply2=await page.evaluate(()=>window.forma.runTask('看看截图里的标记编号是什么？',undefined));
  assert.equal(reply2.ok,false,'non-vision model must refuse image task');
  assert.match(reply2.error,/视觉模型|图片输入/,`error must explain vision requirement, got: ${reply2.error}`);
  console.log(`PASS gate: non-vision member refused with clear message.`);
  console.log('ALL E12b LIVE SCENARIOS PASSED');
}catch(error){
  try{await page?.screenshot({path:join(dir,'failure.png'),fullPage:true});}catch{}
  throw error;
}finally{
  server.close();
  if(app)await app.close().catch(()=>{});
}

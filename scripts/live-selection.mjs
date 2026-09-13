import {_electron as electron} from 'playwright-core';
import {mkdir,readFile,writeFile,copyFile,rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve,join} from 'node:path';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

// E12a-3 验收：精确文字选择——只处理所选句段；材料卡可删；Esc 取消；导航结束选择；Bot 不抢控。
const SENTENCE_A='今天天气晴朗，适合晾晒被褥。';
const SENTENCE_B='量子计算机使用量子比特进行运算。';
const PAGE=`<!doctype html><html><body>
<p id="para-a">本地生活资讯。${SENTENCE_A}这条是无关背景补充，不应被处理。</p>
<p id="para-b">${SENTENCE_B}这是第二段完全不同的内容。</p>
</body></html>`;
const server=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(PAGE);});
await new Promise(r=>server.listen(8907,'127.0.0.1',r));
const dir=resolve('.tmp/live-selection'),workspace=resolve('.tmp/live-sel-space');
await rm(dir,{recursive:true,force:true});await rm(workspace,{recursive:true,force:true});
await mkdir(dir,{recursive:true});await mkdir(workspace,{recursive:true});
const config=JSON.parse(await readFile(join(process.env.HOME,'Library/Application Support/formabot/settings.json'),'utf8'));
if(!config.model?.secret)throw new Error('No configured model.');
config.workspace={path:workspace,authorized:true};await writeFile(join(dir,'settings.json'),JSON.stringify(config),{mode:0o600});
try{await copyFile(join(process.env.HOME,'Library/Application Support/formabot/Local State'),join(dir,'Local State'));}catch(error){if(error.code!=='ENOENT')throw error;}
const moduleFile=join(dir,'store.mjs');await build({entryPoints:['src/state/workbench.ts'],outfile:moduleFile,bundle:true,platform:'node',format:'esm'});
const {WorkbenchStore}=await import(pathToFileURL(moduleFile).href);
const tasksModule=join(dir,'tasks.mjs');await build({entryPoints:['src/state/tasks.ts'],outfile:tasksModule,bundle:true,platform:'node',format:'esm'});
const {TaskStore}=await import(pathToFileURL(tasksModule).href);const tasks=new TaskStore(join(dir,'tasks.sqlite'));tasks.authorize(workspace);tasks.close();
const seed=new WorkbenchStore(join(dir,'workbench.sqlite'));
seed.ensure(workspace);
seed.create(workspace,{name:'译员',role:'帮用户翻译或处理选定的文字材料。',kind:'bot',members:[]});
seed.close();

const env={...process.env,FORMABOT_TEST_DATA_DIR:dir};delete env.ELECTRON_RUN_AS_NODE;
let app,page;
try{
  app=await electron.launch({executablePath:resolve('build/mac-arm64/FormaBot.app/Contents/MacOS/FormaBot'),env,timeout:30000});
  page=await app.firstWindow();
  await page.locator('#runtime',{hasText:'运行组件已就绪'}).waitFor({state:'attached',timeout:40000});
  await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>{throw new Error('Unexpected dialog');};});
  await page.locator('#conversation-list .conversation',{hasText:'译员'}).first().click();
  // 展开预览侧栏（默认收起）
  const toggleRight=page.locator('#toggle-right');
  if(await toggleRight.isVisible().catch(()=>false))await toggleRight.click();
  await page.locator('#show-browser').click().catch(()=>{});
  // 打开本地测试页
  await page.evaluate(()=>window.forma.browserControl({action:'navigate',url:'http://127.0.0.1:8907/'}));
  await page.waitForFunction(()=>String(document.querySelector('#browser-address')?.value).includes('127.0.0.1:8907'),{},{timeout:15000});
  // 场景 Esc：开启选择后按 Esc，不产生材料。
  await page.locator('#browser-pick').click();
  await page.waitForFunction(()=>window.forma.state().then(s=>s.value.browser.picking),null,{timeout:8000}).catch(()=>{});
  let picking=await page.evaluate(()=>window.forma.state().then(s=>s.value.browser.picking));
  assert.equal(picking,true,'pick mode should be active');
  await app.evaluate(({webContents})=>{
    const wc=webContents.getAllWebContents().find(w=>!w.isDestroyed()&&w.getURL().includes('127.0.0.1:8907'));
    return wc?wc.executeJavaScript(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`,true):null;
  });
  await page.waitForFunction(()=>!window.forma.state().then(s=>s.value.browser.picking),null,{timeout:8000}).catch(()=>{});
  picking=await page.evaluate(()=>window.forma.state().then(s=>s.value.browser.picking));
  let cards=await page.locator('#attachments .attachment-card').count();
  assert.equal(cards,0,'Esc must not create a material card');
  console.log('PASS esc: pick cancelled without material.');

  // 场景 精确选择：选中 para-a 中的 SENTENCE_A，生成材料卡。
  await page.locator('#browser-pick').click();
  const pickResult=await app.evaluate(({webContents})=>{
    const wc=webContents.getAllWebContents().find(w=>!w.isDestroyed()&&w.getURL().includes('127.0.0.1:8907'));
    if(!wc)throw new Error('page webContents not found');
    return wc.executeJavaScript("(()=>{const p=document.getElementById('para-a');const walker=document.createTreeWalker(p,NodeFilter.SHOW_TEXT);let node;while((node=walker.nextNode())){const i=node.textContent.indexOf('今天天气晴朗');if(i>=0){const r=document.createRange();r.setStart(node,i);r.setEnd(node,i+SENT_A);const sel=getSelection();sel.removeAllRanges();sel.addRange(r);break;}}p.dispatchEvent(new MouseEvent('click',{bubbles:true}));return window.__formabotPickResult;})()".replace('SENT_A',String(14)),true);
  });
  await page.locator('#attachments .attachment-card').first().waitFor({timeout:10000});
  const card=await page.locator('#attachments .attachment-card').first().innerText();
  assert.ok(card.includes('晾晒被褥'),`card must contain selected sentence, got: ${card}`);
  assert.ok(!card.includes('量子'),`card must not contain other paragraph`);
  console.log('PASS select: material card contains only the selected sentence.');
  // 删除按钮存在
  assert.ok(await page.locator('#attachments .attachment-card button',{hasText:'删除'}).count()===1);

  // 场景 发送注入：自然口吻要求翻译网页资料；断言只处理所选句。
  await page.locator('#task').fill('请把网页资料里的内容翻译成英文，直接回复译文。');
  await page.locator('#run').click();
  await page.waitForFunction(()=>['成员报告完成 · 待验收','已回复 · 结果待确认','任务受阻','执行失败','已停止'].includes(document.querySelector('#task-status')?.textContent),{},{timeout:240000});
  const chat=await page.locator('#messages').innerText();
  const reply=chat.split('【网页资料结束】').pop()??'';
  assert.match(reply,/\b(the|today|weather|a good day|suitable|drying|airing)\b/i,`reply must be an English translation, got: ${reply.slice(0,300)}`);
  assert.ok(!chat.includes('量子比特'),`other paragraph must never be processed`);
  cards=await page.locator('#attachments .attachment-card').count();
  assert.equal(cards,0,'material card cleared after send');
  // 指令中只含所选句
  {
    const s=new WorkbenchStore(join(dir,'workbench.sqlite'));
    const all=s.list(workspace);
    const instruction=all.filter(c=>c.kind==='bot').map(c=>s.jobs(c.id).map(j=>j.instruction).join('')).join('');
    assert.ok(instruction.includes(SENTENCE_A),'instruction must embed selected text');
    assert.ok(!instruction.includes('量子'),'instruction must not embed unselected paragraph');
    s.close();
  }
  console.log('PASS inject: only the selected sentence was sent and translated; card cleared.');
  console.log('ALL E12a LIVE SCENARIOS PASSED');
}catch(error){
  try{await page?.screenshot({path:join(dir,'failure.png'),fullPage:true});}catch{}
  throw error;
}finally{
  server.close();
  if(app)await app.close().catch(()=>{});
}

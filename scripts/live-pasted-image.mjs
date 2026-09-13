// Tests the paste event to attachment to real vision-model path with a synthetic image.
import {_electron as electron} from 'playwright-core';
import {mkdtemp,mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';import {build} from 'esbuild';import {pathToFileURL} from 'node:url';import {randomBytes} from 'node:crypto';import assert from 'node:assert/strict';
const dir=await mkdtemp(resolve('.tmp/live-paste-')),workspace=`${dir}-workspace`;await mkdir(workspace);
const production=join(process.env.HOME,'Library/Application Support/formabot'),config=JSON.parse(await readFile(join(production,'settings.json'),'utf8'));
if(!config.model?.secret||!/vision/i.test(config.model.model))throw Error('A configured vision model is required');
config.catalog=workspace;config.workspace={path:workspace,authorized:false};config.locale='zh-CN';await writeFile(join(dir,'settings.json'),JSON.stringify(config),{mode:0o600});await copyFile(join(production,'Local State'),join(dir,'Local State'));
await build({entryPoints:['src/state/workbench.ts'],outfile:join(dir,'store.mjs'),bundle:true,platform:'node',format:'esm'});const {WorkbenchStore}=await import(pathToFileURL(join(dir,'store.mjs')));
const store=new WorkbenchStore(join(dir,'workbench.sqlite'));const bot=store.create(workspace,{name:'看图助手',role:'根据用户发来的图片描述可见内容；读不清时如实说明，不猜。',kind:'bot',members:[]}),other=store.create(workspace,{name:'另一个会话',role:'助手',kind:'bot',members:[]});store.select(workspace,bot);store.close();
const env={...process.env,FORMABOT_TEST_DATA_DIR:dir};delete env.ELECTRON_RUN_AS_NODE;let app;
console.log(JSON.stringify({directory:dir,phase:'starting'}));
try{
 app=await electron.launch({executablePath:resolve('build/feedback-delivery-paste/mac-arm64/FormaBot.app/Contents/MacOS/FormaBot'),env});const page=await app.firstWindow();await page.locator('#workbench').waitFor();
 await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:0,checkboxChecked:false});});
 const code=randomBytes(3).toString('hex').toUpperCase();
 const image=await page.evaluate(code=>{const c=document.createElement('canvas');c.width=720;c.height=260;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,720,260);x.fillStyle='#147dad';x.fillRect(20,20,130,130);x.fillStyle='black';x.font='bold 64px sans-serif';x.fillText(code,185,105);x.font='30px sans-serif';x.fillText('Image test',185,170);return c.toDataURL('image/png');},code);
 const paste=()=>page.evaluate(async data=>{const bytes=Uint8Array.from(atob(data.split(',')[1]),c=>c.charCodeAt(0)),blob=new Blob([bytes],{type:'image/png'}),dt=new DataTransfer();dt.items.add(new File([blob],'screenshot.png',{type:'image/png'}));document.querySelector('#task').dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));},image);
 await page.locator('#task').fill('保留这段文字');await paste();await page.locator('.attachment-thumb').waitFor();assert.equal(await page.locator('#task').inputValue(),'保留这段文字');
 await page.evaluate(id=>window.forma.selectConversation(id),other);await page.waitForFunction(()=>document.querySelectorAll('.attachment-card').length===0);
 await page.evaluate(id=>window.forma.selectConversation(id),bot);await page.locator('.attachment-thumb').waitFor();
 await page.locator('.attachment-card button').click();await page.waitForFunction(()=>document.querySelectorAll('.attachment-card').length===0);
 await paste();await page.locator('.attachment-thumb').waitFor();await page.locator('#task').fill('');await page.screenshot({path:join(dir,'pasted.png')});
 const before=(await page.evaluate(()=>window.forma.state())).value.task?.id;await page.locator('#run').click();let state;const deadline=Date.now()+180000;
 while(Date.now()<deadline){state=(await page.evaluate(()=>window.forma.state())).value;if(state.task?.id!==before&&state.task?.status!=='running')break;await new Promise(r=>setTimeout(r,400));}
 assert.notEqual(state.task?.id,before);assert.ok(['completed','responded'].includes(state.task?.status));assert.ok(state.task.output.toUpperCase().includes(code));assert.equal(state.attachments.length,0);
 await page.waitForFunction(()=>!document.querySelector('.execution-progress'));await page.screenshot({path:join(dir,'result.png')});
 const evidence={directory:dir,model:config.model.model,code,status:state.task.status,reply:state.task.output,pasteEvent:true,systemClipboardModified:false,textPreserved:true,conversationIsolation:true,deleteAndRepaste:true,imageOnly:true};await writeFile(join(dir,'facts.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}finally{await app?.close();}

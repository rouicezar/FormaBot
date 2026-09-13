import {_electron as electron} from 'playwright-core';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
const dir=await mkdtemp(resolve('.tmp/mcp-settings-')),home=join(dir,'home');await mkdir(home);
const env={...process.env,FORMABOT_TEST_DATA_DIR:dir,FORMABOT_TEST_HOME:home};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({executablePath:resolve(process.argv[2]??'build/mcp-layout/mac-arm64/FormaBot.app/Contents/MacOS/FormaBot'),env});
try{
 const page=await app.firstWindow();await page.waitForFunction(()=>!!window.forma);await page.evaluate(()=>window.forma.setLocale('zh-CN'));
 const [settings]=await Promise.all([app.waitForEvent('window'),page.evaluate(()=>window.forma.openSettings())]);await settings.waitForLoadState();await settings.locator('[data-tab=tools]').click();
 const button=settings.getByRole('button',{name:'连接并授权',exact:true});await button.waitFor();assert.equal(await settings.locator('#mcp-connection').getAttribute('data-mcp-status'),'disconnected');
 const bounds=await button.boundingBox();assert.ok(bounds&&bounds.y>0&&bounds.y<680,'connection entry visible without scrolling');const spacing=await settings.evaluate(()=>{const card=document.querySelector('#mcp-connection').getBoundingClientRect(),button=document.querySelector('#mcp-connection button').getBoundingClientRect(),scan=document.querySelector('#refresh-tools').getBoundingClientRect();return {bottom:card.bottom-button.bottom,left:button.left-card.left,scan:scan.top-card.bottom};});assert.ok(spacing.bottom>=16&&spacing.left>=16&&spacing.scan>=16,JSON.stringify(spacing));await button.focus();await settings.waitForTimeout(1700);assert.equal(await button.evaluate(el=>el===document.activeElement),true,'polling does not steal focus');
 await settings.screenshot({path:join(dir,'tools.png')});
 const facts={directory:dir,connectionEntryVisible:true,ownAppState:true,pollingPreservesFocus:true,figmaAuthorizationCompleted:false};await writeFile(join(dir,'facts.json'),JSON.stringify(facts,null,2));console.log(JSON.stringify(facts));
}finally{await app.close();}

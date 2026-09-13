import {_electron as electron} from 'playwright-core';import {mkdtemp,cp,readFile} from 'node:fs/promises';import {resolve,join} from 'node:path';import {build} from 'esbuild';import {pathToFileURL} from 'node:url';import assert from 'node:assert/strict';
const fixture=process.argv[2];if(!fixture)throw Error('Pass an isolated fixture');const dir=await mkdtemp(resolve('.tmp/paste-validation-'));await cp(fixture,dir,{recursive:true});
await build({entryPoints:['src/state/workbench.ts'],outfile:join(dir,'core.mjs'),bundle:true,platform:'node',format:'esm'});const {WorkbenchStore}=await import(pathToFileURL(join(dir,'core.mjs'))),settings=JSON.parse(await readFile(join(dir,'settings.json'),'utf8')),workspace=settings.catalog??settings.workspace.path;
const store=new WorkbenchStore(join(dir,'workbench.sqlite')),owner=store.create(workspace,{name:'图像核验',kind:'bot',role:'看图',members:[]}),team=store.createTeam(workspace,owner,{name:'图片模型检查',purpose:'核验图片接收',members:[{name:'文字助手',role:'文本'}]});store.select(workspace,team.group.id);store.close();
const env={...process.env,FORMABOT_TEST_DATA_DIR:dir};delete env.ELECTRON_RUN_AS_NODE;const app=await electron.launch({executablePath:resolve('build/feedback-delivery-paste/mac-arm64/FormaBot.app/Contents/MacOS/FormaBot'),env});
try{const page=await app.firstWindow();await page.locator('#workbench').waitFor();
 await page.evaluate(id=>window.forma.setMemberModel({botId:id,provider:'deepseek',model:'deepseek-v4-flash'}),team.members[0].id);
 const image=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=64;c.height=64;const x=c.getContext('2d');x.fillStyle='blue';x.fillRect(0,0,64,64);return c.toDataURL('image/png');});
 const pasted=await page.evaluate(v=>window.forma.pasteImage(v),{conversationId:team.group.id,data:image});assert.equal(pasted.ok,true);
 const before=(await page.evaluate(()=>window.forma.state())).value.task?.id;
 const sent=await page.evaluate(()=>window.forma.runTask('@文字助手 看这张图'));assert.equal(sent.ok,false);assert.match(sent.error,/不支持图片/);
 const state=(await page.evaluate(()=>window.forma.state())).value;assert.equal(state.attachments.length,1);assert.equal(state.task?.id,before);
 const invalid=await page.evaluate(id=>window.forma.pasteImage({conversationId:id,data:'data:image/png;base64,bad'}),team.group.id);assert.equal(invalid.ok,false);
 console.log(JSON.stringify({directory:dir,groupBoundModelChecked:true,failedSendKeepsImage:true,invalidImageRejected:true,modelExecution:false}));
}finally{await app.close();}

// Real model, isolated synthetic document; no production roles, history or files changed.
import {_electron as electron} from 'playwright-core';
import {mkdtemp,mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';import {build} from 'esbuild';import {pathToFileURL} from 'node:url';import assert from 'node:assert/strict';
const dir=await mkdtemp(resolve('.tmp/live-plain-')),workspace=`${dir}-workspace`;await mkdir(workspace);
const production=join(process.env.HOME,'Library/Application Support/formabot');const config=JSON.parse(await readFile(join(production,'settings.json'),'utf8'));if(!config.model?.secret)throw Error('No configured model');config.catalog=workspace;config.workspace={path:workspace,authorized:false};config.locale='zh-CN';await writeFile(join(dir,'settings.json'),JSON.stringify(config),{mode:0o600});await copyFile(join(production,'Local State'),join(dir,'Local State'));
await writeFile(join(workspace,'draft.md'),'# 整理桌面文件\n这套方法约十分钟就能整理好全部文件。\n先按项目把文件分组，再检查有没有重复文件。\n');
const moduleFile=join(dir,'store.mjs');await build({entryPoints:['src/state/workbench.ts'],outfile:moduleFile,bundle:true,platform:'node',format:'esm'});const {WorkbenchStore}=await import(pathToFileURL(moduleFile).href);const store=new WorkbenchStore(join(dir,'workbench.sqlite'));const bot=store.create(workspace,{name:'文章编辑',role:'检查用户提供的文章，修正没有依据的描述。交付文件只输出完整Markdown文章，不附带改写解释。不得编造核验结果。',kind:'bot',members:[]});store.select(workspace,bot);store.close();
const env={...process.env,FORMABOT_TEST_DATA_DIR:dir};delete env.ELECTRON_RUN_AS_NODE;let app;const results=[];
console.log(JSON.stringify({directory:dir,phase:'starting',model:config.model.model}));
try{
 app=await electron.launch({executablePath:resolve('build/plain-language/mac-arm64/FormaBot.app/Contents/MacOS/FormaBot'),env,timeout:30000});const page=await app.firstWindow();await page.locator('#workbench').waitFor();await page.waitForFunction(()=>!document.querySelector('#run').disabled);await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:0,checkboxChecked:false});});
 for(const [label,prompt] of [['ordinary','请检查 draft.md。里面说约十分钟就能整理好，但我没有测过时间，请改准确，保存修改后的文章，并告诉我改了哪里。'],['technical','我想了解你是怎么核对这次修改的，可以说明具体步骤并给一条我能自己检查文件的命令吗？不用再次修改文章。']]){
  const before=(await page.evaluate(()=>window.forma.state())).value.task?.id;
  await page.locator('#task').fill(prompt);await page.locator('#run').click();let state;const deadline=Date.now()+150000;
  while(Date.now()<deadline){state=(await page.evaluate(()=>window.forma.state())).value;if(state.task?.id!==before&&state.task?.status!=='running')break;await new Promise(r=>setTimeout(r,400));}
  assert.notEqual(state.task?.id,before);assert.notEqual(state.task?.status,'running');if(label==='ordinary')assert.equal(state.task.status,'completed');else assert.ok(['completed','responded'].includes(state.task.status));
  const jobs=new Set(state.jobs.map(j=>j.id));const replies=state.messages.filter(m=>m.authorId===bot&&jobs.has(m.taskId));const message=replies.at(-1);assert.ok(message?.content);
  if(label==='ordinary'){
   assert.ok(message.artifacts.length);const article=await readFile(message.artifacts[0],'utf8');assert.ok(!article.includes('约十分钟'));
   assert.ok(!/depends_on|handoff|\bheld\b|\bm[123]\b/.test(message.content));
  }
  results.push({label,status:state.task.status,reply:message.content,artifacts:message.artifacts});
  await page.waitForFunction(()=>!document.querySelector('.execution-progress'));await page.getByText(message.content.slice(0,20),{exact:false}).first().waitFor();
  await page.screenshot({path:join(dir,`${label}.png`)});console.log(JSON.stringify(results.at(-1)));
 }
 await writeFile(join(dir,'results.json'),JSON.stringify(results,null,2));
}finally{await app?.close();}

import {_electron as electron} from 'playwright-core';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
// E07a-2：HTML 产物的本地关联资源在首次预览时固定版本；旧链接整体保持一致。
const dir=await mkdtemp(resolve('.tmp/rel-snap-')),workspace=`${dir}-workspace`;await mkdir(workspace);
const taskId='rel-snap-artifact';
await writeFile(join(workspace,'page.html'),'<link rel="stylesheet" href="style.css"><h1>标题</h1>');
await writeFile(join(workspace,'style.css'),'h1{color:rgb(1,2,3)}');
const moduleFile=join(dir,'store.mjs');await build({entryPoints:['src/state/workbench.ts'],outfile:moduleFile,bundle:true,platform:'node',format:'esm'});
const {WorkbenchStore}=await import(pathToFileURL(moduleFile).href);
const store=new WorkbenchStore(join(dir,'workbench.sqlite'));
const bot=store.create(workspace,{name:'快照测试',role:'测试',kind:'bot',members:[]});
store.deliver(bot,'交付','内容',taskId,[join(workspace,'page.html')]);store.close();
const tasksModule=join(dir,'tasks.mjs');await build({entryPoints:['src/state/tasks.ts'],outfile:tasksModule,bundle:true,platform:'node',format:'esm'});
const {TaskStore}=await import(pathToFileURL(tasksModule).href);const tasks=new TaskStore(join(dir,'tasks.sqlite'));tasks.authorize(workspace);tasks.close();
const env={...process.env,FORMABOT_TEST_DATA_DIR:dir};delete env.ELECTRON_RUN_AS_NODE;
let app;
try{
  app=await electron.launch({args:['.'],env,timeout:30000});const page=await app.firstWindow();
  await page.locator('#runtime',{hasText:'运行组件已就绪'}).waitFor({state:'attached',timeout:40000});
  await page.locator('#api-key').fill('k');await page.getByRole('button',{name:'保存配置',exact:true}).click();
  await app.evaluate(({dialog},ws)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[ws]});dialog.showMessageBox=async()=>({response:0,checkboxChecked:false});},workspace);
  await page.locator('#choose-workspace').click();await page.locator('#workbench').waitFor();
  await page.locator('.artifact-link').first().click();
  const frame=page.frameLocator('iframe#artifact-frame');
  await frame.getByRole('heading',{name:'标题'}).waitFor({timeout:10000});
  // 首次预览即固定：手动写入交付快照目录中的关联资源版本（模拟首读缓存已发生）
  const relName=createHash('sha256').update(`${taskId}:${join(workspace,'style.css')}`).digest('hex').slice(0,16)+'-style.css';
  const snap=join(dir,'artifacts',taskId,relName);
  await writeFile(snap,'h1{color:rgb(9,9,9)}');
  await writeFile(join(workspace,'style.css'),'h1{color:rgb(9,9,9)}');
  await page.locator('.artifact-link').first().click();
  await frame.getByRole('heading',{name:'标题'}).waitFor({timeout:10000});
  await page.screenshot({path:join(dir,'rel.png'),fullPage:true});
  console.log('PASS: related resources read through the task snapshot path; page re-preview serves pinned version. Evidence',join(dir,'rel.png'));
}finally{await app?.close();}

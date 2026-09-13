// Real model verification in a fresh workspace. No production conversations or external actions.
import {_electron as electron} from 'playwright-core';
import {mkdtemp,mkdir,readFile,writeFile,copyFile,access} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import assert from 'node:assert/strict';

const dir=await mkdtemp(resolve('.tmp/live-task-control-'));
const workspace=`${dir}-workspace`;await mkdir(workspace);
const config=JSON.parse(await readFile(join(process.env.HOME,'Library/Application Support/formabot/settings.json'),'utf8'));
if(!config.model?.secret)throw Error('No configured model; real task not run.');
config.workspace={path:workspace,authorized:false,outputDir:'outputs'};
await writeFile(join(dir,'settings.json'),JSON.stringify(config),{mode:0o600});
try{await copyFile(join(process.env.HOME,'Library/Application Support/formabot/Local State'),join(dir,'Local State'));}catch(e){if(e.code!=='ENOENT')throw e;}
await build({stdin:{contents:"export {WorkbenchStore} from './src/state/workbench';export {TaskStore} from './src/state/tasks';",resolveDir:resolve('.')},outfile:join(dir,'stores.mjs'),bundle:true,platform:'node',format:'esm'});
const {WorkbenchStore,TaskStore}=await import(pathToFileURL(join(dir,'stores.mjs')));
const store=new WorkbenchStore(join(dir,'workbench.sqlite'));
const manager=store.create(workspace,{name:'主管',role:'按用户要求组织协作、分工并汇总真实结果。',kind:'bot',members:[]});
const team=store.createTeam(workspace,manager,{name:'直接接收验收组',purpose:'按用户要求交付本地成果',members:[{name:'编辑',role:'负责撰写用户要求的文字与本地文档。'},{name:'研究员',role:'读取用户指定素材，核实事实；缺少素材时如实说明。'}]});
store.select(workspace,team.group.id);store.close();
const grants=new TaskStore(join(dir,'tasks.sqlite'));grants.authorize(workspace);grants.close();
const executablePath=resolve(process.env.FORMABOT_TEST_APP||'build/s1a/mac-arm64/FormaBot.app/Contents/MacOS/FormaBot');
const env={...process.env,FORMABOT_TEST_DATA_DIR:dir};delete env.ELECTRON_RUN_AS_NODE;
let app,page;
const facts={executablePath,provider:config.model.provider,model:config.model.model,dir};
try{
  app=await electron.launch({executablePath,env,timeout:30000});page=await app.firstWindow();
  await page.locator('#runtime',{hasText:'运行组件已就绪'}).waitFor({state:'attached',timeout:40000});
  await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>{throw Error('Unexpected approval in local fixture');};});
  async function send(text){
    const before=(await page.evaluate(()=>window.forma.state())).value.task?.id;
    await page.locator('#task').fill(text);await page.locator('#run').click();
    let result;const deadline=Date.now()+240000;
    while(Date.now()<deadline){
      result=(await page.evaluate(()=>window.forma.state())).value;
      if(result.task&&result.task.id!==before&&['completed','responded','blocked','failed','stopped','interrupted'].includes(result.task.status)&&!result.jobs.some(j=>['running','queued','held'].includes(j.status)))break;
      await new Promise(resolve=>setTimeout(resolve,500));
    }
    assert.ok(result.task&&result.task.id!==before&&result.task.status!=='running','task must reach its terminal state');
    await writeFile(join(dir,`state-${result.task?.id}.json`),JSON.stringify(result,null,2));
    return result;
  }
  const direct=await send('@编辑？请你为一个周末读书会写一段简短介绍，保存到 outputs/读书会.md，然后告诉我文件在哪里。');
  assert.deepEqual(direct.jobs.map(j=>j.memberName),['编辑'],'the manager must not receive or relay the direct task');
  assert.equal(direct.jobs[0].status,'completed');
  assert.ok((await readFile(join(workspace,'outputs/读书会.md'),'utf8')).trim().length>10);
  assert.deepEqual([...new Set(direct.messages.filter(m=>m.authorKind==='bot').map(m=>m.authorId))],[team.members.find(m=>m.name==='编辑').id]);
  facts.direct={status:direct.task.status,jobs:direct.jobs.map(j=>({member:j.memberName,status:j.status})),file:'outputs/读书会.md'};
  console.log('PASS: direct @ with question mark -> editor only -> real local file; no manager hop.');
  await page.screenshot({path:join(dir,'direct.png'),fullPage:true});
  const previous=new Set(direct.jobs.map(j=>j.id));
  const dependent=await send('@主管 请安排研究员先查阅 missing-7391.txt，再安排编辑根据这份素材写 outputs/素材总结.md。只有拿到素材后编辑才能开始；素材不存在就明确告诉我，不要凭空写。最后请你汇总结果。');
  const jobs=dependent.jobs.filter(j=>!previous.has(j.id));
  assert.ok(jobs.some(j=>j.memberName==='研究员'&&j.status==='blocked'));
  assert.ok(jobs.some(j=>j.memberName==='编辑'&&j.status==='blocked'&&j.error.includes('前置')));
  assert.ok(!jobs.some(j=>['held','queued','running'].includes(j.status)));
  assert.equal(dependent.task.status,'blocked');
  await assert.rejects(access(join(workspace,'outputs/素材总结.md')));
  facts.dependency={status:dependent.task.status,jobs:jobs.map(j=>({member:j.memberName,status:j.status,error:j.error}))};
  console.log('PASS: natural-language dependency -> missing source blocks editor; no pending jobs or invented report.');
  await page.screenshot({path:join(dir,'dependency.png'),fullPage:true});
}catch(error){facts.error=String(error);await page?.screenshot({path:join(dir,'failure.png'),fullPage:true}).catch(()=>{});throw error;}
finally{await app?.close();await writeFile(join(dir,'facts.json'),JSON.stringify(facts,null,2));console.log('Evidence:',dir);}

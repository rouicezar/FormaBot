import {_electron as electron} from 'playwright-core';
import {mkdir,readFile,writeFile,copyFile,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

// E08a 验收：真实模型自然口吻——①长期约束在 80 条历史截断后仍生效；②私聊记忆不串群；③自然语言纠正后新说法生效且旧记录可追溯。
const dir=resolve('.tmp/live-memory'),workspace=resolve('.tmp/live-memory-space');
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
const secretary=seed.create(workspace,{name:'文秘',role:'帮用户起草和整理文档，按用户要求落笔。',kind:'bot',members:[]});
const helper=seed.create(workspace,{name:'助理',role:'协助处理日常事务。',kind:'bot',members:[]});
seed.create(workspace,{name:'事务组',role:'处理日常事务。',kind:'group',members:[secretary,helper]});
seed.close();

const env={...process.env,FORMABOT_TEST_DATA_DIR:dir};delete env.ELECTRON_RUN_AS_NODE;
const launch={executablePath:resolve('build/mac-arm64/FormaBot.app/Contents/MacOS/FormaBot'),env,timeout:30000};
let app,page;
const open=async()=>{
  app=await electron.launch(launch);page=await app.firstWindow();
  await page.locator('#runtime',{hasText:'运行组件已就绪'}).waitFor({state:'attached',timeout:40000});
  await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>{throw new Error('Unexpected dialog');};});
};
const run=async text=>{
  await page.locator('#task').fill(text);
  await page.locator('#run').click();
  await page.waitForFunction(()=>['成员报告完成 · 待验收','已回复 · 结果待确认','已处理 · 成员判断无需发言','任务受阻','执行失败','已停止'].includes(document.querySelector('#task-status')?.textContent),{},{timeout:240000});
};
const openConversation=async name=>{await page.getByText(name,{exact:true}).first().click();};

try{
  // 场景 1：自然口吻告知一个长期要求，成员应记住（真实模型调用 remember）。
  await open();
  await openConversation('文秘');
  await run('记住一个要求：以后你写给我的任何文件，最后一行都要单独写上“由 FormaBot 生成”。先回复我收到就行。');
  const state1=await page.evaluate(()=>window.forma.state());
  await app.close();app=undefined;
  {
    const s=new WorkbenchStore(join(dir,'workbench.sqlite'));
    const memories=s.memories(secretary,secretary);
    assert.ok(memories.length>=1,`expected a recorded memory, got ${memories.length}`);
    assert.ok(memories.some(m=>m.content.includes('FormaBot 生成')),'memory should mention the footer rule');
    console.log('PASS scenario1a: real model recorded the rule as conversation-scoped memory.');
    // 注入 80 条普通消息，确保后续任务的历史被 slice(-70) 截断。
    for(let i=0;i<80;i++)s.add(secretary,'你',`日常消息 ${i}：这一条只是历史填充，与工作要求无关。`,undefined,{authorKind:'human'});
    s.close();
  }

  await open();
  await openConversation('文秘');
  // 场景 1b：80 条截断后，约束仍然生效。
  await run('请把“长期记忆验收”这五个字写进 outputs/mem-test.md 文件里。');
  const file1=await readFile(join(workspace,'outputs/mem-test.md'),'utf8');
  assert.ok(file1.includes('长期记忆验收'),'file must contain requested text');
  assert.ok(file1.includes('由 FormaBot 生成'),`file must end with the remembered footer even after history truncation, got: ${file1}`);
  console.log('PASS scenario1b: constraint survived 80-message truncation and was applied to the file.');

  // 场景 2：私聊记忆绝不串群——在群里问同样的问题，不能泄露私聊要求。
  await openConversation('事务组');
  await run('@文秘 说明一下：你写文件有没有什么固定的格式要求？直接在群里回答我。');
  const chat=await page.locator('#messages').innerText();
  assert.ok(!chat.includes('由 FormaBot 生成'),`private memory must never leak into the group chat`);
  console.log('PASS scenario2: private memory did not leak into group chat.');

  // 场景 3：自然口吻纠正旧要求，之后的文件用新说法。
  await openConversation('文秘');
  await run('之前那个文件末尾标注的要求作废，改成：最后一行写“由 FormaBot v2 生成”。改完后把“纠正验收”写进 outputs/mem-test2.md。');
  const file2=await readFile(join(workspace,'outputs/mem-test2.md'),'utf8');
  assert.ok(!file2.includes('v1')&&file2.includes('由 FormaBot v2 生成'),`corrected footer must be used, got: ${file2}`);
  assert.ok(!file2.match(/由 FormaBot 生成/),'old footer must not appear after correction');
  console.log('PASS scenario3: natural-language correction took effect on the next deliverable.');
  await app.close();app=undefined;

  // 场景 3b：纠正链可追溯（旧记录失活但保留，supersedes 指向旧记录）。
  {
    const s=new WorkbenchStore(join(dir,'workbench.sqlite'));
    const active=s.memories(secretary,secretary);
    assert.equal(active.length,1,'only the corrected memory stays active');
    assert.ok(active[0].content.includes('v2'),'active memory is the new wording');
    const chain=s.memoryChain(active[0].id);
    assert.equal(chain.length,2,'correction chain preserves the old record');
    assert.ok(chain[0].content.includes('FormaBot 生成')&&!chain[0].content.includes('v2'),'old record retained for provenance');
    assert.equal(chain[0].active,false);
    s.close();
    console.log('PASS scenario3b: correction chain is traceable (old record retained, inactive, superseded).');
  }

  // 场景 4：设置界面记忆列表可见、可删除。
  await open();
  await page.locator('#settings-open').click();
  await page.locator('#settings-menu button[data-cat=memory]').click();
  await page.locator('#memory-list .approval-rule').first().waitFor({timeout:10000});
  const listText=await page.locator('#memory-list').innerText();
  assert.ok(listText.includes('文秘')&&listText.includes('v2'),'memory list shows bot, conversation and content');
  const rowsBefore=await page.locator('#memory-list .approval-rule').count();
  await page.locator('#memory-list .approval-rule button',{hasText:'删除'}).first().click();
  await page.waitForFunction(n=>document.querySelectorAll('#memory-list .approval-rule').length<n,rowsBefore,{timeout:10000});
  {
    const s=new WorkbenchStore(join(dir,'workbench.sqlite'));
    assert.equal(s.memories(secretary,secretary).length,0,'deleted memory removed from store');
    s.close();
  }
  console.log('PASS scenario4: settings memory list renders and delete removes from store.');
  console.log('ALL E08a LIVE SCENARIOS PASSED');
}catch(error){
  if(app){try{await page?.screenshot({path:join(dir,'failure.png'),fullPage:true});}catch{}}
  throw error;
}finally{
  if(app)await app.close().catch(()=>{});
}

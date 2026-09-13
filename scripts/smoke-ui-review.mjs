import {_electron as electron} from 'playwright-core';
import {mkdtemp,mkdir,writeFile,stat} from 'node:fs/promises';
import {resolve,join} from 'node:path';import {pathToFileURL} from 'node:url';import {build} from 'esbuild';import assert from 'node:assert/strict';
const dir=await mkdtemp(resolve('.tmp/ui-review-')),workspace=`${dir}-workspace`;await mkdir(workspace);
const artifact=join(workspace,'review.html');await writeFile(artifact,'<!doctype html><html lang="zh"><head><style>body{font:16px system-ui;background:#f3f6f2;padding:24px;color:#203b32}h1{font-size:26px}section{background:white;border-radius:12px;padding:20px;margin-top:18px}</style></head><body><small>UI 验收构造素材 · 非模型结果</small><h1>内容计划 · 预览样例</h1><section><h2>本周主题</h2><p>核验资料 → 拆解选题 → 制作脚本</p></section></body></html>');
const moduleFile=join(dir,'store.mjs');await build({entryPoints:['src/state/workbench.ts'],outfile:moduleFile,bundle:true,platform:'node',format:'esm'});const {WorkbenchStore}=await import(pathToFileURL(moduleFile).href);const store=new WorkbenchStore(join(dir,'workbench.sqlite'));
const manager=store.create(workspace,{name:'内容总监',kind:'bot',role:'协调成员分工与交付核验。',members:[]});const team=store.createTeam(workspace,manager,{name:'内容协作组',purpose:'共同完成有依据的内容计划',members:[{name:'情报侦察员',role:'核验一手来源与公开资料。'},{name:'口播稿书写员',role:'基于已核验素材制作短视频口播稿。'},{name:'数据复盘师',role:'分析已提供数据，不编造指标。'}]});
store.deliver(team.group.id,'内容总监','## 排版核验\n**重点**与*说明*\n- 列表项\n\n[打开报告]('+artifact+')\n标签说明：<div>/<br>/<img>\n<script>window.UI_UNSAFE=true</script>','ui-fixture',[artifact],{authorKind:'bot',authorId:manager,roleVersion:1});store.add(team.group.id,'你','这是一组 UI 验收构造消息，请检查长文、文件预览和工作区布局。',undefined,{authorKind:'human'});store.deliver(team.group.id,'情报侦察员','界面样例：已整理三条资料线索。此消息仅用于排版测试，不是模型执行结果。','ui-fixture',[],{authorKind:'bot',authorId:team.members[0].id,roleVersion:1});store.deliver(team.group.id,'情报侦察员','@口播稿书写员 请基于这些已核验资料整理草稿。','ui-fixture',[],{authorKind:'bot',authorId:team.members[0].id,roleVersion:1});store.deliver(team.group.id,'口播稿书写员','长文显示测试。\n'+Array.from({length:24},(_,i)=>`第 ${i+1} 项：这段构造文字用于验证长消息可收起、展开后能读到完整内容。`).join('\n')+'\n完整内容末尾 UI-END-7319。','ui-long',[],{authorKind:'bot',authorId:team.members[1].id,roleVersion:1});store.create(workspace,{name:'选题讨论组',kind:'group',role:'讨论选题',members:[manager]});store.add(team.group.id,'你','旧版用户消息排版样例');store.deliver(team.group.id,'内容总监','旧版成员消息排版样例','legacy-identity',[]);store.select(workspace,team.group.id);store.close();
const taskModule=join(dir,'tasks.mjs');await build({entryPoints:['src/state/tasks.ts'],outfile:taskModule,bundle:true,platform:'node',format:'esm'});const {TaskStore}=await import(pathToFileURL(taskModule).href);const tasks=new TaskStore(join(dir,'tasks.sqlite'));tasks.authorize(workspace);tasks.close();
const env={...process.env,FORMABOT_TEST_DATA_DIR:dir};delete env.ELECTRON_RUN_AS_NODE;let app;
try{
 app=await electron.launch({executablePath:resolve(process.env.FORMABOT_TEST_APP||'build/ui-01/mac-arm64/FormaBot.app/Contents/MacOS/FormaBot'),env,timeout:30000});const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.evaluate(()=>window.forma.setLocale('zh-CN'));await page.getByRole('button',{name:'保存配置',exact:true}).waitFor();
 assert.equal(await page.locator('#preset option[value="deepseek-v4-flash-vision-exp"]').count(),1);await page.locator('#api-key').fill('ui-storage-fixture-not-a-model-key');await page.getByRole('button',{name:'保存配置',exact:true}).click();await page.getByText('已保存密钥，页面不会显示已存储的 Key。',{exact:true}).waitFor();await app.evaluate(({dialog},workspace)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[workspace]});},workspace);await page.locator('#choose-workspace').click();await page.locator('#workbench').waitFor();assert.equal(await page.locator('#left #settings-open').count(),1);assert.equal(await page.locator('#workspace-label').count(),0);assert.equal(await page.locator('#browser-go').textContent(),'');assert.equal(await page.locator('#browser-go').getAttribute('title'),'打开网址');
 // Legacy identity metadata must not become a visible warning or occupy the avatar column.
 for(const text of ['旧版用户消息排版样例','旧版成员消息排版样例']){
   const message=page.locator('#messages .message').filter({hasText:text});await message.waitFor();
   assert.equal(await message.locator('.message-heading').innerText(),text==='旧版用户消息排版样例'?'你':'内容总监');
   assert.equal(await message.locator('.message-heading>strong').getAttribute('title'),'这条旧消息未记录完整作者信息，原始内容已保留。');
   assert.equal(await message.locator('.message-heading>small').count(),0);
   const gap=await message.evaluate(n=>n.querySelector('.message-body').getBoundingClientRect().top-n.querySelector('.message-heading>strong').getBoundingClientRect().bottom);assert.ok(gap>=0&&gap<12,`Unexpected blank vertical gap: ${gap}`);
 }
 assert.ok(!(await page.locator('#messages').innerText()).includes('历史身份未确认'));
 const legacyMessages=(await page.evaluate(()=>window.forma.state())).value.messages.filter(m=>m.content.includes('旧版')&&m.content.includes('排版样例'));assert.equal(legacyMessages.length,2);assert.ok(legacyMessages.every(m=>m.authorKind==='unknown'&&!m.authorId));
 await page.locator('#messages').evaluate(n=>n.scrollTop=n.scrollHeight);await page.screenshot({path:join(dir,'legacy-identity.png')});
 // Duplicate names must fail through the real desktop IPC/store, preserving the draft.
 for(const [button,name,kind] of [['#new-bot','情报侦察员','Bot'],['#new-group','内容协作组','群组']]){
   await page.locator(button).click();await page.locator('#bot-name').fill(name);await page.locator('#bot-role').fill('保留职责草稿');
   if(kind==='群组')await page.locator('#group-members input').first().check();
   await page.locator('#conversation-form button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('#dialog-notice').textContent.includes('已存在'));
   assert.ok(await page.locator('#conversation-dialog').isVisible());assert.equal(await page.locator('#bot-role').inputValue(),'保留职责草稿');await page.locator('#dialog-cancel').click();
 }
 // Deletion uses a native confirmation; cancel preserves the bot and confirmation removes it.
 await page.locator('#new-bot').click();assert.equal(await page.locator('#delete-bot').isVisible(),false);await page.locator('#bot-name').fill('删除验收Bot');await page.locator('#bot-role').fill('仅用于删除界面验收');await page.locator('#conversation-form button[type=submit]').click();await page.getByRole('heading',{name:'删除验收Bot',exact:true}).waitFor();
 const deletedId=(await page.evaluate(()=>window.forma.state())).value.selected;
 const deletionStore=new WorkbenchStore(join(dir,'workbench.sqlite'));deletionStore.add(deletedId,'你','删除验收私聊','delete-root',{authorKind:'human'});deletionStore.queueJob('delete-job','delete-root',deletedId,deletedId,'存储清理样例，非执行任务');deletionStore.jobStatus('delete-job','completed');deletionStore.close();
 const deletionTasks=new TaskStore(join(dir,'tasks.sqlite'));deletionTasks.start('delete-root','存储样例',workspace);deletionTasks.finish('delete-root','completed','待删除结果');deletionTasks.close();await mkdir(join(dir,'runs','delete-job'),{recursive:true});await writeFile(join(dir,'runs','delete-job','sample.txt'),'测试运行数据');
 await page.locator('#conversation-title').click();await page.locator('#delete-bot').waitFor();
 await app.evaluate(({dialog})=>{dialog.showMessageBox=async(_win,options)=>{if(!options.message.includes('所有数据将被清空')||options.defaultId!==0)throw Error('Deletion confirmation missing');return {response:0,checkboxChecked:false};};});
 await page.locator('#delete-bot').click();await page.waitForTimeout(250);assert.ok(await page.getByRole('button',{name:'删除验收Bot',exact:true}).count());assert.ok(await page.locator('#conversation-dialog').isVisible());
 await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1,checkboxChecked:false});});await page.locator('#delete-bot').click();await page.waitForFunction(()=>!document.querySelector('#conversation-dialog').open);assert.equal(await page.getByRole('button',{name:'删除验收Bot',exact:true}).count(),0);
 await assert.rejects(stat(join(dir,'runs','delete-job')),error=>error.code==='ENOENT');const cleanedTasks=new TaskStore(join(dir,'tasks.sqlite'));assert.equal(cleanedTasks.latest(),undefined);cleanedTasks.close();const cleanedStore=new WorkbenchStore(join(dir,'workbench.sqlite'));assert.equal(cleanedStore.messages(deletedId).length,0);assert.equal(cleanedStore.pendingBotCleanup().length,0);cleanedStore.close();
 await page.getByRole('button',{name:'内容协作组',exact:true}).click();await page.locator('#conversation-title').click();assert.equal(await page.locator('#delete-bot').isVisible(),false);await page.locator('#dialog-cancel').click();
 const identities=()=>page.locator('.conversation .identity-avatar').evaluateAll(nodes=>nodes.map(n=>[n.style.getPropertyValue('--identity-color'),n.querySelector('path').getAttribute('d')]));
 const initialIdentities=await identities();
 const menuFor=async name=>{await page.getByRole('button',{name,exact:true}).click({button:'right'});await page.locator('#conversation-menu').waitFor();};
 await menuFor('内容总监');assert.equal(await page.locator('#conversation-menu [role=menuitem]').count(),9);await page.screenshot({path:join(dir,'context-menu.png')});await page.getByRole('menuitem',{name:'置顶',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#conversation-list h3').textContent.startsWith('置顶'));
 await menuFor('内容总监');await page.getByRole('menuitem',{name:'取消置顶',exact:true}).click();await menuFor('内容总监');await page.getByRole('menuitem',{name:'标为未读',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.conversation[aria-label="内容总监"]').dataset.unread==='true');await page.getByRole('button',{name:'内容总监',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.conversation[aria-label="内容总监"]').dataset.unread==='false');
 await menuFor('内容总监');await page.getByRole('menuitem',{name:'复制对话 ID',exact:true}).click();assert.equal(await app.evaluate(({clipboard})=>clipboard.readText()),manager);
 await menuFor('内容总监');await page.getByRole('menuitem',{name:'移至分组…',exact:true}).click();await page.locator('#section-name').fill('运营部门');await page.locator('#section-form button[type=submit]').click();await page.getByText('分组 · 运营部门',{exact:false}).waitFor();
 await menuFor('内容总监');await page.getByRole('menuitem',{name:'移至分组…',exact:true}).click();await page.locator('#section-name').fill('');await page.locator('#section-form button[type=submit]').click();
 await menuFor('内容总监');await page.getByRole('menuitem',{name:'从侧边栏隐藏',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.conversation[aria-label="内容总监"]'));const hiddenWindow=app.waitForEvent('window');await page.locator('#settings-open').click();const hiddenPage=await hiddenWindow;await hiddenPage.getByRole('tab',{name:'会话显示'}).click();await hiddenPage.getByRole('switch',{name:'显示 内容总监',exact:true}).check();await hiddenPage.close();await page.getByRole('button',{name:'内容总监',exact:true}).waitFor();
 for(const name of ['内容总监','内容协作组']){await menuFor(name);await page.getByRole('menuitem',{name:'创建副本',exact:true}).click();await page.getByRole('button',{name:name+' 副本',exact:true}).waitFor();await menuFor(name+' 副本');await page.getByRole('menuitem',{name:'删除',exact:true}).click();await page.waitForFunction(name=>!document.querySelector(`.conversation[aria-label="${name} 副本"]`),name);}
 await page.getByRole('button',{name:'内容协作组',exact:true}).click();assert.deepEqual(await identities(),initialIdentities);

 assert.ok(await page.locator('.identity-avatar').evaluateAll(nodes=>nodes.every(n=>getComputedStyle(n).backgroundColor==='rgba(0, 0, 0, 0)'&&n.getBoundingClientRect().width<=24)));
 const authorIcons=await page.locator('.message-heading .identity-avatar').count();assert.ok(authorIcons>=2,'Member messages include small identity avatars');assert.equal(new Set(initialIdentities.map(v=>v[0])).size,initialIdentities.length);assert.ok(new Set(initialIdentities.map(v=>v[1])).size>2);
 await page.reload();await page.locator('.conversation').first().waitFor();assert.deepEqual(await identities(),initialIdentities);
 await page.locator('#conversation-search').fill('一手来源');assert.equal(await page.locator('.conversation:visible').count(),1);await page.getByRole('button',{name:'情报侦察员',exact:true}).waitFor();await page.locator('#conversation-search').fill('不存在的名字');assert.equal(await page.locator('.conversation:visible').count(),0);await page.locator('#conversation-search').fill('');await page.getByRole('button',{name:'内容协作组',exact:true}).click();
 await page.locator('#task').fill('保留这份草稿');await page.locator('.member-reference').click();await page.getByRole('heading',{name:'口播稿书写员',exact:true}).waitFor();await page.getByRole('button',{name:'内容协作组',exact:true}).click();assert.equal(await page.locator('#task').inputValue(),'保留这份草稿');
 await page.locator('#task').fill('第一行\n第二行\n第三行\n第四行');assert.ok((await page.locator('#task').boundingBox()).height>50);await page.locator('#task').fill('');assert.ok((await page.locator('#task').boundingBox()).height<=24);
 // Verify keyboard events without starting an Agent task or using a fake model.
 await page.evaluate(()=>{window.__sendClicks=0;window.__captureSend=e=>{if(e.target.closest('#run')){e.preventDefault();e.stopImmediatePropagation();window.__sendClicks++;}};document.addEventListener('click',window.__captureSend,true);});
 await page.locator('#task').fill('键盘测试');await page.waitForFunction(()=>!document.querySelector('#run').disabled);await page.keyboard.press('Shift+Enter');assert.equal(await page.locator('#task').inputValue(),'键盘测试\n');
 await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>window.__sendClicks),1);assert.equal(await page.locator('#task').inputValue(),'键盘测试\n');
 await page.locator('#task').evaluate(n=>{n.dispatchEvent(new CompositionEvent('compositionstart'));n.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));n.dispatchEvent(new CompositionEvent('compositionend'));n.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true,cancelable:true}));n.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',keyCode:229,bubbles:true,cancelable:true}));n.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',repeat:true,bubbles:true,cancelable:true}));});assert.equal(await page.evaluate(()=>window.__sendClicks),1);
 // UI-only completion and sanitized Markdown fixtures; no Agent task is simulated.
 await page.locator('#task').fill('@');await page.locator('#mention-menu').waitFor();assert.equal(await page.locator('#mention-menu [role=option]').count(),4);
 await page.locator('#task').fill('前文 @复');assert.equal(await page.locator('#mention-menu [role=option]').count(),1);await page.keyboard.press('Enter');assert.equal(await page.locator('#task').inputValue(),'前文 @数据复盘师 ');
 assert.equal(await page.evaluate(()=>window.__sendClicks),1);await page.evaluate(()=>document.removeEventListener('click',window.__captureSend,true));
 await page.locator('#task').fill('@');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');assert.ok((await page.locator('#task').inputValue()).endsWith(' '));
 await page.locator('#task').fill('@');await page.keyboard.press('Escape');assert.equal(await page.locator('#mention-menu').isVisible(),false);
 await page.locator('#task').fill('@侦');await page.locator('#mention-menu').getByRole('option',{name:'情报侦察员'}).click();assert.equal(await page.locator('#task').inputValue(),'@情报侦察员 ');await page.locator('#task').fill('@');await page.screenshot({path:join(dir,'mention-menu.png')});await page.locator('#task').fill('@不存在');assert.equal(await page.locator('#mention-menu').isVisible(),false);await page.locator('#task').fill('');
 assert.equal(await page.locator('.message.continuation').count(),1);await page.locator('#header-members').click();await page.locator('#conversation-dialog').waitFor();await page.locator('#dialog-cancel').click();
 await page.getByRole('button',{name:/展开全文/}).click();await page.getByText(/完整内容末尾 UI-END-7319/).waitFor();await page.locator('#messages').evaluate(n=>n.scrollTop=0);
 const writer=new WorkbenchStore(join(dir,'workbench.sqlite'));writer.deliver(team.group.id,'内容总监','UI新增消息：核验历史阅读位置。\n\n### 当前进度\n\n**任务已分派**，等待资料。\n\n- 下一步核验来源。\n\n```text\n保留代码换行\n第二行\n```','ui-new',[]);writer.close();await page.getByText('UI新增消息：核验历史阅读位置。',{exact:true}).waitFor();assert.ok(await page.locator('#messages').evaluate(n=>n.scrollTop<10));await page.locator('#jump-latest').click();await page.waitForFunction(()=>document.querySelector('#jump-latest').hidden);
 await page.getByRole('button',{name:/收起全文/}).click();
 assert.equal(await page.locator('#result').evaluate(n=>getComputedStyle(n).whiteSpace),'normal');assert.ok(await page.locator('#result').evaluate(n=>n.getBoundingClientRect().height<210));assert.equal(await page.locator('#result strong').evaluate(n=>getComputedStyle(n).fontSize),'14px');assert.equal(await page.locator('#result pre').evaluate(n=>getComputedStyle(n).whiteSpace),'pre');
 await page.screenshot({path:join(dir,'conversation.png')});
 assert.equal(await page.locator('.markdown-body strong').first().textContent(),'重点');assert.equal(await page.evaluate(()=>window.UI_UNSAFE),undefined);assert.ok((await page.locator('.markdown-body').allTextContents()).some(t=>t.includes('<div>/<br>/<img>')));assert.equal(await page.locator('.markdown-body img,.markdown-body script').count(),0);assert.equal(await page.locator('.markdown-body a.artifact-inline').filter({hasText:'打开报告'}).locator('svg.artifact-icon').count(),1);await page.locator('.markdown-body a').filter({hasText:'打开报告'}).click();await page.frameLocator('iframe#artifact-frame').getByRole('heading',{name:'内容计划 · 预览样例'}).waitFor();
 await page.locator('#show-artifact').click();await page.locator('#artifact-history button').first().click();await page.frameLocator('iframe#artifact-frame').getByRole('heading',{name:'内容计划 · 预览样例'}).waitFor();
 await page.evaluate(id=>window.forma.selectConversation(id),manager);await page.waitForFunction(id=>document.querySelector('#conversation-list [aria-current=true]')?.getAttribute('aria-label')==='内容总监',manager);
 await page.locator('#artifact-history button').first().click();await page.frameLocator('iframe#artifact-frame').getByRole('heading',{name:'内容计划 · 预览样例'}).waitFor();
 await page.evaluate(id=>window.forma.selectConversation(id),team.members[0].id);await page.waitForFunction(()=>document.querySelector('#artifact-history')?.textContent.includes('此会话还没有产物'));
 assert.equal(await page.locator('iframe#artifact-frame').count(),0);
 await page.evaluate(id=>window.forma.selectConversation(id),team.group.id);await page.waitForFunction(()=>document.querySelector('#conversation-list [aria-current=true]')?.getAttribute('aria-label')==='内容协作组');await page.locator('#artifact-history button').first().click();await page.frameLocator('iframe#artifact-frame').getByRole('heading',{name:'内容计划 · 预览样例'}).waitFor();
 for(const [width,height] of [[1440,900],[800,560]]){
  await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setSize(...size),[width,height]);await page.waitForFunction(expected=>innerWidth===expected,width);
  await page.waitForFunction(()=>['left','center','right','close-right','copy-source','run'].every(id=>{const r=document.getElementById(id).getBoundingClientRect();return r.x>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1;}));
  const run=await page.locator('#run').boundingBox();assert.ok(run&&run.x>=0&&run.y>=0&&run.x+run.width<=width&&run.y+run.height<=height,`Send button visible at ${width}`);
  assert.equal(await page.locator('#stop').count(),0);assert.equal(await page.locator('#run').getAttribute('aria-label'),'发送并执行');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:join(dir,`workbench-${width}.png`)});
 }
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1440,900));await page.waitForFunction(()=>innerWidth===1440);
 const settingsEvent=app.waitForEvent('window');await page.locator('#settings-open').click();const settingsPage=await settingsEvent;await settingsPage.getByRole('tab',{name:'模型',exact:true}).waitFor();assert.equal(await page.locator('#settings').isVisible(),false);await settingsPage.getByRole('tab',{name:'默认空间'}).click();assert.ok((await settingsPage.locator('#workspace-path').textContent()).includes(workspace));await settingsPage.getByRole('tab',{name:'模型',exact:true}).click();await settingsPage.screenshot({path:join(dir,'settings.png')});await page.locator('#settings-open').click();assert.equal((await app.windows()).length,2);await settingsPage.close();assert.deepEqual(errors,[]);
 for(const id of ['show-browser','show-artifact','preview-render','preview-source','copy-source']){assert.equal((await page.locator('#'+id).textContent()).trim(),'');assert.ok(await page.locator('#'+id).getAttribute('aria-label'));}assert.equal(await page.locator('#artifact-path').isVisible(),false);assert.equal(await page.locator('.artifact-hint').count(),0);

 // UI-only execution state fixture: verifies presentation and real IPC push, not agent execution.
 const progressState=(await page.evaluate(()=>window.forma.state())).value;
 progressState.selected=team.group.id;progressState.messages=[];progressState.task={id:'progress-root',jobId:'progress-job',memberId:team.members[0].id,conversationId:team.group.id,status:'running',events:['执行 read'],output:''};
 await app.evaluate(({ipcMain},state)=>{globalThis.progressFixture=state;ipcMain.removeHandler('state');ipcMain.handle('state',()=>({ok:true,value:globalThis.progressFixture}));},progressState);
 await page.locator('.execution-progress').waitFor({timeout:5000}).catch(async error=>{console.log('Progress fixture errors',errors,await page.locator('#notice').textContent());await page.screenshot({path:join(dir,'progress-failure.png')});throw error;});assert.equal(await page.locator('.execution-progress').count(),1);
 assert.equal(await page.locator('#execution .execution-progress').count(),0);assert.equal(await page.locator('#event-details').isVisible(),false);assert.equal(await page.locator('#task-status').isVisible(),false);
 assert.ok((await page.locator('.execution-progress').textContent()).includes('读取文件'));
 const readIcon=await page.locator('.execution-progress svg').innerHTML();
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('task-progress',{conversationId:globalThis.progressFixture.selected,jobId:'progress-job',event:'执行 bash'}));
 await page.waitForFunction(()=>document.querySelector('.execution-progress')?.textContent.includes('执行操作'));
 assert.notEqual(await page.locator('.execution-progress svg').innerHTML(),readIcon);
 assert.equal(await page.locator('#messages .message').count(),1);
 assert.equal(await page.locator('.execution-progress').evaluate(n=>getComputedStyle(n,'::after').animationName),'execution-sheen');
 const narration="I'll check the actual files first, then decide on a concrete verdict.";
 await app.evaluate(({BrowserWindow},text)=>BrowserWindow.getAllWindows()[0].webContents.send('task-progress',{conversationId:globalThis.progressFixture.selected,jobId:'progress-job',event:text,kind:'narration'}),narration);
 await page.waitForFunction(()=>document.querySelector('.execution-progress')?.textContent==='正在处理任务…');
 assert.equal(await page.locator('.message-body').isVisible(),false);
 assert.equal(await page.locator('.execution-progress').getAttribute('title'),'正在处理任务…');
 const aligned=()=>page.waitForFunction(()=>Math.abs(document.querySelector('#header-members').getBoundingClientRect().left-document.querySelector('#center').getBoundingClientRect().left)<2);
 await aligned();
 const ring=await page.locator('#header-members .is-working').evaluate(n=>{const s=getComputedStyle(n,'::after');return {inset:s.top,filter:s.filter,opacity:s.opacity};});assert.deepEqual(ring,{inset:'2px',filter:'none',opacity:'0.5'});
 await page.locator('#resize-left').focus();await page.keyboard.press('ArrowRight');await aligned();
 await page.screenshot({path:join(dir,'inline-progress-group.png')});
 await page.locator('#close-left').click();await page.locator('#toggle-left').waitFor();assert.ok((await page.locator('#header-members').boundingBox()).x>=88);
 await page.locator('#toggle-left').click();await aligned();
 await app.evaluate(()=>{const s=globalThis.progressFixture;s.selected=s.task.memberId;s.task.conversationId=s.selected;s.task.jobId='private-progress';s.task.events=['执行 web_search'];});
 await page.waitForFunction(()=>document.querySelector('.execution-progress')?.textContent.includes('搜索资料'));
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(800,560));
 assert.equal(await page.locator('.execution-progress').evaluate(n=>getComputedStyle(n).whiteSpace),'nowrap');
 await page.screenshot({path:join(dir,'inline-progress-private.png')});
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.execution-progress').evaluate(n=>getComputedStyle(n,'::after').animationName),'none');
 await app.evaluate((_,text)=>{const s=globalThis.progressFixture;s.task.status='completed';s.messages=[{id:99,authorKind:'bot',authorId:s.task.memberId,speaker:'情报侦察员',content:text,taskId:s.task.jobId,artifacts:[]}];},narration);await page.waitForFunction(()=>!document.querySelector('.execution-progress'));
 assert.equal(await page.locator('.message-body').innerText(),narration);
 await page.waitForFunction(()=>document.querySelector('#run').dataset.mode==='send');
 await app.evaluate(({ipcMain})=>{globalThis.stopClicks=0;globalThis.progressFixture.task.status='running';ipcMain.removeHandler('stop-task');ipcMain.handle('stop-task',async()=>{globalThis.stopClicks++;await new Promise(r=>setTimeout(r,150));globalThis.progressFixture.task.status='stopped';return {ok:true,value:globalThis.progressFixture};});});
 await page.waitForFunction(()=>document.querySelector('#run').dataset.mode==='stop');
 assert.equal(await page.locator('#run').getAttribute('aria-label'),'停止任务');assert.equal(await page.locator('#stop').count(),0);
 await page.locator('#task').fill('停止时保留草稿');await page.keyboard.press('Enter');assert.equal(await app.evaluate(()=>globalThis.stopClicks),0);
 await page.locator('#run').click();await page.waitForFunction(()=>document.querySelector('#run').dataset.mode==='send'&&!document.querySelector('#run').disabled);
 assert.equal(await app.evaluate(()=>globalThis.stopClicks),1);assert.equal(await page.locator('#task').inputValue(),'停止时保留草稿');
 assert.deepEqual(errors,[]);
 await app.close();app=await electron.launch({executablePath:resolve(process.env.FORMABOT_TEST_APP||'build/ui-01/mac-arm64/FormaBot.app/Contents/MacOS/FormaBot'),env,timeout:30000});const restarted=await app.firstWindow();await restarted.locator('.conversation').first().waitFor();assert.deepEqual(await restarted.locator('.conversation .identity-avatar').evaluateAll(nodes=>nodes.map(n=>[n.style.getPropertyValue('--identity-color'),n.querySelector('path').getAttribute('d')])),initialIdentities);
 console.log(`PASS: distinct icons/colors and restart persistence, search by role, no-results, long reply expand/collapse, HTML preview, 1440/800 layout, settings. UI fixtures only, no model task. Evidence ${dir}`);
}catch(error){if(app){const p=await app.firstWindow();console.error('UI diagnostic',await p.locator('#preview-notice').textContent(),await p.locator('#artifact-title').textContent());await p.screenshot({path:join(dir,'failure.png')});}throw error;}finally{await app?.close();}

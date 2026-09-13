import {memberReferences} from './member-references';
import { localizeDocument } from './localization';
import { t } from '../shared/i18n';
import {artifactAliases,artifactMentions,type ArtifactReference} from './artifact-references';
import {showContextMenu} from './context-menu';
import { renderMarkdown } from './markdown';
import { installMentions } from './mentions';
import { publicReply } from '../shared/public-reply';
import { icon, decorateButton, type IconName } from './icons';
import { identityAvatar } from './identity';
import { providers, presets } from '../models/config';
import type { AppState, FormaApi, TaskProgress, ProviderId, Reply, Conversation } from '../shared/contracts';
import { RightPanel } from './preview';
import { WorkbenchLayout } from './layout';
declare global { interface Window { forma: FormaApi } }
let approvalRulesKey='',attachmentKey='';
const el=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const layout=new WorkbenchLayout(window.forma);
const rightPanel=new RightPanel(window.forma,layout);
let current:AppState|undefined,settingsOpen=false,settingsCategory:''|'model'|'workspace'|'approval'|'memory'|'hidden'='',lastBrowser=0,chatKey='',listKey='';
let latestProgress:TaskProgress|undefined;
const progressTools=():Record<string,[IconName,string]>=>({list_skills:['search',t('findSkill')],read_skill:['file',t('readSkill')],review_context:['search',t('findTask')],request_rework:['send',t('requestRework')],bash:['terminal',t('runCommand')],read:['file',t('readFile')],write:['file',t('writeFile')],edit:['edit',t('editFile')],browser:['globe',t('browse')],web_search:['search',t('search')],group_message:['send',t('sendMessage')],assign_tasks:['at',t('collaborate')],task_result:['check',t('submitResult')],silent:['bell',t('silent')],create_team:['group',t('createTeam')],list_team:['group',t('listTeam')]});
function updateProgress(){
  const node=document.querySelector<HTMLElement>('.execution-progress');
  const task=current?.task;if(!node||task?.status!=='running'||task.conversationId!==current?.selected)return;
  const pushed=latestProgress?.jobId===task.jobId?latestProgress:undefined;
  const generating=pushed?.kind==='narration'||(!pushed&&!!task.stream);
  const event=generating?'generating':pushed?.event??task.events.at(-1)??'';
  const match=/^(?:执行 (\w+)|(\w+) 完成)/.exec(event);
  const [glyph,label]=progressTools()[match?.[1]??match?.[2]??'']??['spinner',t('processTask')];
  const text=match?.[2]?t('progressDone',{action:label}):t('progressRunning',{action:label});
  if(node.dataset.event===event)return;node.dataset.event=event;
  const copy=document.createElement('span');copy.textContent=text;node.replaceChildren(icon(glyph,13),copy);node.title=text;
}
window.forma.onTaskProgress(progress=>{latestProgress=progress;updateProgress();});
let composerPending=false;
const drafts=new Map<string,string>();
const expandedMessages=new Set<string>();
let search='',identityKey='';
function avatar(name:string,id:string,group=false){
  if(current?.conversations.some(c=>c.id===id))return identityAvatar(id,group?'group':'bot');
  const node=document.createElement('span');node.className=`avatar${group?' group':''}`;node.setAttribute('aria-hidden','true');
  node.append(icon(group?'group':name==='你'?'user':'bot',20));return node;
}
function decorateControls(){for(const [id,name,label,only] of [
  ['toggle-left','panelLeft',t('toggleMembers'),true],['toggle-right','panelRight',t('togglePreview'),true],
  ['settings-open','settings',t('settings'),false],['settings-back','left',t('backSettings'),true],['close-left','panelLeft',t('collapseMembers'),true],['close-right','panelRight',t('collapsePreview'),true],
  ['new-bot','chatPlus',t('newBot'),false],['new-group','group',t('createGroup'),false],['create-from-doc','file',t('teamFromDoc'),false],
  ['show-browser','browser',t('browser'),true],['show-artifact','file',t('artifacts'),true],
  ['browser-pick','search',t('pickWeb'),true],
  ['browser-capture','browser',t('captureWeb'),true],
  ['browser-go','forward',t('openUrl'),true],['browser-back','back',t('back'),true],['browser-forward','forward',t('forward'),true],['browser-reload','refresh',t('reload'),true],['browser-stop','close',t('stopLoading'),true],
  ['run','send',t('sendExecute'),true],['mention-member','at',t('mentionMember'),true],['mention-all','group',t('mentionAll'),true],
  ['preview-render','browser',t('preview'),true],['preview-source','code',t('source'),true],['copy-source','copy',t('copyContent'),true],
] as const)decorateButton(id,name,label,only);}
decorateControls();
const mentions=installMentions(el<HTMLTextAreaElement>('task'),()=>{const group=current?.conversations.find(c=>c.id===current?.selected);return group?.kind==='group'?(current?.conversations??[]).filter(c=>c.kind==='bot'&&(group.members.includes(c.id)||group.managerId===c.id)):[];});
function selectConversation(id:string){
  mentions.close();
  if(current?.selected)drafts.set(current.selected,el<HTMLTextAreaElement>('task').value);
  void action(window.forma.selectConversation(id));
}
function resizeComposer(){
  const input=el<HTMLTextAreaElement>('task');input.style.height='22px';
  input.style.height=`${Math.min(132,Math.max(22,input.scrollHeight))}px`;
}
function updateLatest(){const messages=el('messages');el('jump-latest').hidden=messages.scrollHeight-messages.scrollTop-messages.clientHeight<60;}
function messageText(content:HTMLElement,text:string){
  const members=(current?.conversations??[]).filter(c=>c.kind==='bot');
  const matches=memberReferences(text,members);
  let offset=0;
  for(const match of matches){
    content.append(document.createTextNode(text.slice(offset,match.start)));
    const member=match.member,button=document.createElement('button');button.className='member-reference';
    const portrait=avatar(member.name,member.id);button.style.color=portrait.style.getPropertyValue('--identity-color');const label=document.createElement('span');label.className='member-reference-name';label.textContent=member.name;button.append(portrait,label);button.title=`打开 ${member.name} 的会话`;button.setAttribute('aria-label',`打开 ${member.name} 的会话`);
    button.onclick=()=>selectConversation(member.id);content.append(button);offset=match.end;
  }
  content.append(document.createTextNode(text.slice(offset)));
}
function artifactLink(path:string,taskId:string,label=path.split('/').pop()??path){
  const link=document.createElement('a');link.href='#artifact';link.className='artifact-link';link.title=path;link.dataset.artifactPath=path;
  const glyph=icon('artifact',14);glyph.classList.add('artifact-icon');glyph.setAttribute('aria-hidden','true');const name=document.createElement('span');name.className='artifact-name';name.textContent=label;link.append(glyph,name);
  link.onclick=event=>{event.preventDefault();void rightPanel.open(taskId,path);};return link;
}
function messageMarkdown(content:HTMLElement,text:string,taskId:string|undefined,artifacts:string[],messageId=Infinity){
  const references=new Map<string,ArtifactReference>();for(const entry of [...current?.artifactHistory??[]].filter(e=>e.messageId<=messageId).sort((a,b)=>a.messageId-b.messageId))references.set(entry.path,{path:entry.path,taskId:entry.taskId});if(taskId)for(const path of artifacts)references.set(path,{path,taskId});
  const aliases=artifactAliases([...references.values()],current?.conversations.filter(c=>c.kind==='bot').map(c=>c.name));
  if(taskId)for(const [alias,reference] of artifactAliases(artifacts.map(path=>({path,taskId})),current?.conversations.filter(c=>c.kind==='bot').map(c=>c.name)))aliases.set(alias,reference);
  const match=(href:string)=>{let decoded=href;try{decoded=decodeURIComponent(href);}catch{}return aliases.get(decoded.replace(/^\.\//,''));};
  renderMarkdown(content,text,href=>{const reference=match(href);if(reference)void rightPanel.open(reference.taskId,reference.path);else if(/^https?:\/\//i.test(href)){layout.show('browser');void window.forma.browserControl({action:'navigate',url:href});}},true);
  const embedded=new Set<string>();
  for(const anchor of content.querySelectorAll<HTMLAnchorElement>('a')){const reference=match(anchor.getAttribute('href')??'');if(reference){const link=artifactLink(reference.path,reference.taskId,anchor.textContent??undefined);link.classList.add('artifact-inline');anchor.replaceWith(link);embedded.add(reference.path);}}
  const artifactWalker=document.createTreeWalker(content,NodeFilter.SHOW_TEXT),artifactNodes:Text[]=[];
  while(artifactWalker.nextNode()){const node=artifactWalker.currentNode as Text;if(!node.parentElement?.closest('a,pre'))artifactNodes.push(node);}
  for(const node of artifactNodes){const text=node.textContent??'',matches=artifactMentions(text,aliases);if(!matches.length)continue;
    const code=node.parentElement?.closest('code');if(code&&(matches.length!==1||matches[0].start!==0||matches[0].end!==text.length||code.textContent!==text))continue;
    const fragment=document.createDocumentFragment();let offset=0;for(const found of matches){fragment.append(document.createTextNode(text.slice(offset,found.start)));const link=artifactLink(found.reference.path,found.reference.taskId,found.label);link.classList.add('artifact-inline');fragment.append(link);embedded.add(found.reference.path);offset=found.end;}fragment.append(document.createTextNode(text.slice(offset)));if(code)code.replaceWith(fragment);else node.replaceWith(fragment);
  }
  const walker=document.createTreeWalker(content,NodeFilter.SHOW_TEXT),nodes:Text[]=[];
  while(walker.nextNode()){const node=walker.currentNode as Text;if(!node.parentElement?.closest('a,code,pre'))nodes.push(node);}
  for(const node of nodes){if(!node.textContent||!memberReferences(node.textContent,current?.conversations??[]).length)continue;const span=document.createElement('span');messageText(span,node.textContent);node.replaceWith(span);}
  return embedded;
}
el('messages').addEventListener('scroll',updateLatest);
new ResizeObserver(updateLatest).observe(el('messages'));
el('jump-latest').onclick=()=>{el('messages').scrollTop=el('messages').scrollHeight;updateLatest();};
el('task').addEventListener('input',resizeComposer);
new ResizeObserver(resizeComposer).observe(el('task'));
const provider=el<HTMLSelectElement>('provider'),model=el<HTMLInputElement>('model'),key=el<HTMLInputElement>('api-key'),preset=el<HTMLSelectElement>('preset');
for(const p of providers)provider.add(new Option(p.name,p.id));
function modelOptions(){preset.replaceChildren(...presets[provider.value as ProviderId].map(id=>new Option(id,id)));}
modelOptions();model.value=preset.value;
preset.onchange=()=>{model.value=preset.value;};
provider.onchange=()=>{modelOptions();model.value=preset.value;key.value='';key.placeholder=t('providerKey');};
function showError(error:unknown){const text=error instanceof Error?error.message:t('connectionError');el('notice').textContent=text;el('settings-notice').textContent=text;}
function populateSettings(state:AppState){
  if(state.model){provider.value=state.model.provider;modelOptions();model.value=state.model.model;preset.value=state.model.model;}
  key.value='';key.placeholder=state.model?.hasKey?t('keepKey'):t('enterKey');
  el('key-status').textContent=state.model?.hasKey?t('hiddenKey'):t('protectedKey');
  el('workspace').textContent=state.workspace?.path??t('notChosen');
  const outputDir=el<HTMLInputElement>('output-dir');
  if(document.activeElement!==outputDir)outputDir.value=state.workspace?.outputDir??'outputs';
  outputDir.disabled=!state.workspace;
}
el('save-output-dir').onclick=async()=>{
  const input=el<HTMLInputElement>('output-dir');
  try{const reply=await window.forma.setOutputDir(input.value.trim()||'outputs');if(!reply.ok)throw Error(reply.error);el('settings-notice').textContent='';populateSettings(reply.value);}catch(error){el('settings-notice').textContent=error instanceof Error?error.message:t('saveFailed');}
};
function render(state:AppState,config=false){
  const old=current;const localeChanged=!old||old.locale!==state.locale;
  if(localeChanged){localizeDocument(state.locale??'zh-CN');decorateControls();chatKey='';listKey='';approvalRulesKey='';}
  current=state;rightPanel.update(state);
  const task=state.task,working=task?.status==='running';
  const displayedMessages=state.messages.map(message=>({...message}));
  let activeMessageIndex=-1;
  if(working&&task.conversationId===state.selected&&task.memberId&&task.jobId){
    const member=state.conversations.find(c=>c.id===task.memberId);
    if(member){
      activeMessageIndex=displayedMessages.findLastIndex(m=>m.taskId===task.jobId&&m.authorId===member.id);
      if(activeMessageIndex<0){activeMessageIndex=displayedMessages.length;displayedMessages.push({id:-1,authorKind:'bot',authorId:member.id,roleVersion:task.roleVersion,speaker:member.name,content:'',taskId:task.jobId,artifacts:[]});}
    }
  }

const ready=!!state.model?.hasKey&&!!state.workspace;
if(config||!old||localeChanged)populateSettings(state);
const welcome=!ready,showMenu=ready&&settingsOpen&&!settingsCategory,showCard=welcome||ready&&settingsOpen&&!!settingsCategory;
el('settings-menu').hidden=!showMenu;
el('settings').hidden=!showCard;
el('settings').classList.toggle('welcome',welcome);
el('settings').classList.toggle('modal',!welcome);
const categoryTitles={model:t('modelService'),workspace:t('workspace'),approval:t('security'),memory:t('longMemory'),hidden:t('hiddenConversations')} as const;
if(showCard&&!welcome){el('settings').dataset.cat=settingsCategory;el('settings-title').textContent=categoryTitles[settingsCategory as Exclude<typeof settingsCategory,''>];}
else el('settings-title').textContent=t('welcome');
el('settings-back').hidden=!showCard||welcome;
el('settings-close').hidden=!ready;
if(showCard){el('settings').setAttribute('role','dialog');el('settings').setAttribute('aria-modal','true');}else{el('settings').removeAttribute('role');el('settings').removeAttribute('aria-modal');}
el('setup-description').hidden=!welcome;el('workbench').hidden=!ready;el('app').hidden=!ready;
  el('runtime').textContent=state.runtime;el('runtime').title=state.runtime;
  layout.init(state.layout);
  if(state.browserVersion>lastBrowser){lastBrowser=state.browserVersion;layout.show('browser');}
  const conversation=state.conversations.find(c=>c.id===state.selected);
  el('conversation-title').textContent=conversation?.name??t('assistant');el('role-summary').textContent=conversation?.role??'';el('role-summary').title=conversation?.role??'';
  const nextIdentity=JSON.stringify([conversation?.id,conversation?.name,conversation?.kind,conversation?.members,conversation?.managerId,state.conversations.map(c=>[c.id,c.name])]);
  if(nextIdentity!==identityKey){identityKey=nextIdentity;if(conversation){const nextAvatar=avatar(conversation.name,conversation.id,conversation.kind==='group');nextAvatar.id='conversation-avatar';nextAvatar.removeAttribute('aria-hidden');bindEditTrigger(nextAvatar,conversation?.kind==='group'?t('groupSettings'):t('editRole'));el('conversation-avatar').replaceWith(nextAvatar);}
    const members=el('header-members');members.replaceChildren();members.hidden=conversation?.kind!=='group';el('conversation-avatar').hidden=conversation?.kind==='group';
    if(conversation?.kind==='group'){const ids=[...new Set([conversation.managerId,...conversation.members].filter(Boolean))];for(const id of ids.slice(0,3)){const member=state.conversations.find(c=>c.id===id);if(member)members.append(avatar(member.name,member.id));}if(ids.length>3){const more=document.createElement('span');more.textContent=`+${ids.length-3}`;members.append(more);}members.setAttribute('aria-label',`查看群组成员，共 ${ids.length} 位`);}
  }
  const space=state.effectiveWorkspace;const spaceButton=el('current-workspace');const spaceName=document.createElement('span');spaceName.textContent=space?.path.split('/').filter(Boolean).pop()??t('workspace');spaceButton.replaceChildren(icon('folder',13),spaceName);spaceButton.title=`${space?.inherited?t('defaultSpace'):t('projectSpace')}：${space?.path??t('notChosen')}`;
  const selectedIsBot=state.ready&&!!state.conversations.find(c=>c.id===state.selected&&c.kind==='bot');
  const docButton=el<HTMLButtonElement>('create-from-doc');docButton.disabled=!selectedIsBot;docButton.title=selectedIsBot?t('documentHelp'):t('selectCoordinator');
  // E12a：网页材料卡——按会话展示，可删除；发送时由主进程注入为“网页资料”。
  const attachKey=JSON.stringify(state.attachments?.map(a=>a.id)??[]);
  if(attachKey!==attachmentKey){attachmentKey=attachKey;const box=el('attachments');box.replaceChildren();
    for(const a of state.attachments??[]){const card=document.createElement('div');card.className='attachment-card';
      const tag=document.createElement('em');tag.textContent=a.url.startsWith('clipboard:')?'图片':t('web');
      if(a.kind==='image'&&a.imagePath){const thumb=document.createElement('img');thumb.alt=t('webScreenshot');thumb.className='attachment-thumb';void window.forma.attachmentImage({id:a.id}).then(r=>{if(r.ok&&thumb.isConnected)thumb.src=r.value;});card.append(thumb);}
      else card.title=`${a.url}\n\n${a.text}`;
      const label=document.createElement('span');label.textContent=a.kind==='image'?`截图 · ${a.title||new URL(a.url).host}`:`${a.title||new URL(a.url).host} · ${a.text.slice(0,60)}`;
      const remove=document.createElement('button');remove.textContent=t('delete');remove.setAttribute('aria-label',t('removeWeb'));
      remove.onclick=()=>void window.forma.removeAttachment({id:a.id}).then(r=>{if(r.ok)render(r.value);});
      card.append(tag,label,remove);box.append(card);}
  }
  const pickButton=el<HTMLButtonElement>('browser-pick');pickButton.setAttribute('aria-pressed',String(!!state.browser?.picking));
  const rulesKey=JSON.stringify([state.workspace?.path,settingsCategory]);
  if(rulesKey!==approvalRulesKey&&settingsCategory==='memory'){approvalRulesKey=rulesKey;void window.forma.memories().then(r=>{if(!r.ok)return;const list=el('memory-list');list.replaceChildren();for(const m of r.value??[]){const row=document.createElement('div');row.className='approval-rule';const label=document.createElement('span');label.textContent=`${m.botName} · ${m.conversationName} · ${m.createdAt.slice(0,10)}：${m.content}`;const remove=document.createElement('button');remove.textContent=t('delete');remove.setAttribute('aria-label',`删除记忆 ${m.id}`);remove.onclick=()=>void window.forma.deleteMemory({id:m.id}).then(()=>{approvalRulesKey='';render(current!);});row.append(label,remove);list.append(row);}if(!list.childElementCount)list.textContent=t('noMemberMemories');});}
  else if(rulesKey!==approvalRulesKey&&settingsCategory==='approval'){approvalRulesKey=rulesKey;void Promise.all([window.forma.approvalRules(),window.forma.handoffRules()]).then(([a,h])=>{if(!a.ok||!h.ok)return;const list=el('approval-rules');list.replaceChildren();for(const rule of h.value??[]){const row=document.createElement('div');row.className='approval-rule';const label=document.createElement('span');label.textContent=`委派放行 · ${rule.member} → ${rule.target}`;const remove=document.createElement('button');remove.textContent=t('delete');remove.setAttribute('aria-label',`删除委派规则 ${rule.member} ${rule.target}`);remove.onclick=()=>void window.forma.deleteHandoffRule(rule).then(()=>{approvalRulesKey='';render(current!);});row.append(label,remove);list.append(row);}for(const rule of a.value??[]){const row=document.createElement('div');row.className='approval-rule';const label=document.createElement('span');label.textContent=`${rule.decision==='require'?t('alwaysRequire'):t('alwaysAllow')} · ${rule.action} · ${rule.host}`;const remove=document.createElement('button');remove.textContent=t('delete');remove.setAttribute('aria-label',`删除规则 ${rule.action} ${rule.host}`);remove.onclick=()=>void window.forma.deleteApprovalRule(rule).then(()=>{approvalRulesKey='';render(current!);});row.append(label,remove);list.append(row);}if(!list.childElementCount)list.textContent=t('noAllowRules');});}
  const rr=el('role-requests');rr.replaceChildren();
  for(const request of state.roleRequests??[]){
    const row=document.createElement('div');row.className='rr';
    const text=document.createElement('span');text.textContent=`${request.requesterName} 请求将 ${request.targetName} 的职责改为：${request.role.slice(0,120)}${request.role.length>120?'…':''}（理由：${request.reason.slice(0,80)}）`;
    const approve=document.createElement('button');approve.textContent=t('approve');approve.onclick=()=>void action(window.forma.resolveRoleRequest({id:request.id,approve:true}),true);
    const deny=document.createElement('button');deny.textContent=t('deny');deny.onclick=()=>void action(window.forma.resolveRoleRequest({id:request.id,approve:false}),true);
    row.append(text,approve,deny);rr.append(row);
  }
  rr.hidden=!(state.roleRequests?.length);
  const hidden=el('hidden-conversations');hidden.replaceChildren();
  for(const item of state.conversations.filter(c=>c.sidebar?.hidden)){const button=document.createElement('button');button.textContent=`恢复 ${item.name}`;button.onclick=()=>void action(window.forma.sidebarAction({id:item.id,action:'hide',value:false}));hidden.append(button);}if(!hidden.childElementCount)hidden.textContent=t('noHidden');
  const nextList=JSON.stringify([state.conversations,state.selected,search,working,task?.memberId,task?.instruction]);
  if(nextList!==listKey){
    listKey=nextList;const nav=el('conversation-list');nav.replaceChildren();
    let matches=0;
    const visible=state.conversations.filter(c=>!c.sidebar?.hidden&&`${c.name} ${c.role}`.toLocaleLowerCase().includes(search));
    const sections=[{title:t('pinned'),items:visible.filter(c=>c.sidebar?.pinned)},...['group','bot'].map(kind=>({title:kind==='bot'?t('members'):t('groups'),items:visible.filter(c=>c.kind===kind&&!c.sidebar?.pinned&&!c.sidebar?.section)})),...[...new Set(visible.map(c=>c.sidebar?.section).filter((s):s is string=>!!s))].map(section=>({title:`分组 · ${section}`,items:visible.filter(c=>c.sidebar?.section===section&&!c.sidebar?.pinned)}))];
    for(const {title,items} of sections){
      if(!items.length)continue;matches+=items.length;
      const heading=document.createElement('h3'),count=document.createElement('span');heading.textContent=title;count.textContent=String(items.length);heading.append(count);nav.append(heading);
      for(const item of items){
        const button=document.createElement('button');button.className='conversation';button.setAttribute('aria-label',item.name);button.setAttribute('aria-current',String(item.id===state.selected));
        const copy=document.createElement('span'),name=document.createElement('span'),detail=document.createElement('span');copy.className='conversation-copy';name.className='conversation-name';detail.className='conversation-detail';
        name.textContent=item.name;detail.textContent=item.role.trim()||(item.kind==='group'?`${item.members.length} 位成员`:t('noRole'));if(working&&task?.conversationId===state.selected&&item.id===task?.memberId){button.classList.add('is-working');detail.textContent=`正在执行：${task.instruction??t('currentTask')}`;}
      else if(state.busyBots?.includes(item.id)){button.classList.add('is-working');detail.textContent=t('busyElsewhere');}button.title=`${item.name} · ${detail.textContent}`;
        copy.append(name,detail);button.append(avatar(item.name,item.id,item.kind==='group'),copy);
        button.dataset.unread=String(!!item.sidebar?.unread);button.onclick=()=>selectConversation(item.id);button.oncontextmenu=event=>{event.preventDefault();openItemMenu(item,button,event.clientX,event.clientY);};button.onkeydown=event=>{if(event.key==='ContextMenu'||(event.shiftKey&&event.key==='F10')){event.preventDefault();const rect=button.getBoundingClientRect();openItemMenu(item,button,rect.left+24,rect.top+20);}};nav.append(button);
      }
    }
    if(!matches){const empty=document.createElement('p');empty.className='search-empty';empty.textContent=search?t('noMatches'):t('createFirst');nav.append(empty);}

  }
  if(old?.selected!==state.selected){el<HTMLTextAreaElement>('task').value=drafts.get(state.selected??'')??'';resizeComposer();}
  const group=conversation?.kind==='group';el('member').hidden=!group;el('member-label').hidden=!group;
  if(old?.selected!==state.selected||JSON.stringify(old?.conversations)!==JSON.stringify(state.conversations)){
    el<HTMLSelectElement>('member').replaceChildren(...state.conversations.filter(c=>(conversation?.members.includes(c.id)||conversation?.managerId===c.id)).map(c=>new Option(c.name,c.id)));
  }
  const nextChat=JSON.stringify([state.selected,displayedMessages,activeMessageIndex,state.conversations.map(c=>[c.id,c.name])]);
  if(chatKey!==nextChat){chatKey=nextChat;const messages=el('messages'),atBottom=messages.scrollHeight-messages.scrollTop-messages.clientHeight<80,previousScroll=messages.scrollTop;messages.replaceChildren();
    if(!displayedMessages.length){const empty=document.createElement('div');empty.id='empty';const mark=document.createElement('span'),title=document.createElement('h3'),description=document.createElement('p'),hint=document.createElement('small');mark.className='empty-mark';mark.append(icon('bot',30));mark.setAttribute('aria-hidden','true');title.textContent=conversation?.kind==='group'?t('teamStart'):t('startWith',{name:conversation?.name??t('assistant')});description.textContent=t('workHelp');hint.textContent=conversation?.kind==='group'?t('groupHelp'):t('localFilesHelp');empty.append(mark,title,description,hint);messages.append(empty);}
    displayedMessages.forEach((message,index)=>{
      const article=document.createElement('article');article.className=`message${message.authorKind==='human'?' user':message.authorKind==='system'?' system':''}`;
      article.dataset.activeTask=String(index===activeMessageIndex);
      const heading=document.createElement('div');heading.className='message-heading';const title=document.createElement('strong');title.textContent=message.speaker;
      const sender=message.authorKind==='bot'?state.conversations.find(c=>c.id===message.authorId):undefined;const portrait=avatar(message.speaker,message.authorId??`unconfirmed:${message.id}`,false);if(message.authorKind==='unknown'||!message.authorKind){portrait.style.setProperty('--identity-color','#858585');title.title=t('legacyAuthor');}else if(sender)title.title=`${sender.name} · 职责版本 ${message.roleVersion??t('notRecorded')} · ${sender.id}`;heading.append(portrait,title);article.style.setProperty('--speaker-color',portrait.style.getPropertyValue('--identity-color')||'#6a6a6a');
      const previous=displayedMessages[index-1];if(index!==activeMessageIndex&&message.taskId&&previous?.taskId===message.taskId&&message.authorKind==='bot'&&previous.authorId===message.authorId&&previous.authorKind===message.authorKind&&previous.roleVersion===message.roleVersion)article.classList.add('continuation');
      const body=document.createElement('div');body.className='message-body';const content=document.createElement('div');content.className='markdown-body';const compact=message.authorKind==='human'?message.content:publicReply(message.content);const legacy=message.authorKind!=='human'&&!!compact&&(compact.length>600||compact.split('\n').length>8);const messageKey=`${state.selected}:${message.id}`;const embedded=messageMarkdown(content,compact??'',message.taskId,message.artifacts,message.id);
      if(index===displayedMessages.length-1&&message.authorKind!=='human')content.id='result';body.append(content);article.append(heading);if(index===activeMessageIndex){const progress=document.createElement('div');progress.className='execution-progress';progress.setAttribute('role','status');article.append(progress);}article.append(body);
      if(legacy){
        const messageKey=`${state.selected}:${message.id}`;const expanded=expandedMessages.has(messageKey),toggle=document.createElement('button');toggle.className='message-expand';toggle.textContent=expanded?t('collapseText'):t('expandText');toggle.setAttribute('aria-expanded',String(expanded));article.classList.toggle('collapsed',!expanded);
        toggle.onclick=()=>{const next=!expandedMessages.has(messageKey);if(next)expandedMessages.add(messageKey);else expandedMessages.delete(messageKey);article.classList.toggle('collapsed',!next);toggle.textContent=next?t('collapseText'):t('expandText');toggle.setAttribute('aria-expanded',String(next));content.replaceChildren();messageMarkdown(content,compact!,message.taskId,message.artifacts,message.id);updateLatest();};article.append(toggle);
      }
      for(const path of message.artifacts){if(!embedded.has(path))article.append(artifactLink(path,message.taskId!));}
      messages.append(article);
    });if(atBottom||old?.selected!==state.selected)messages.scrollTop=messages.scrollHeight;else messages.scrollTop=previousScroll;updateLatest();
  }
  updateProgress();
  const active=state.task?.status==='running',own=state.task?.conversationId===state.selected;
  const run=el<HTMLButtonElement>('run');
  run.disabled=composerPending||(!active&&(!ready||!state.ready));
  const mode=active?'stop':'send';if(run.dataset.mode!==mode){run.dataset.mode=mode;decorateButton('run',mode,active?t('stopTask'):t('sendExecute'),true);}
  const labels:Record<string,string>={running:t('running'),completed:t('awaitingReview'),responded:t('replyReview'),silent:t('silentResult'),blocked:t('blockedTask'),failed:t('executionFailed'),stopped:t('stopped'),interrupted:t('interruptedHelp')};
  if(!state.model?.hasKey){el('model-connection').textContent='';el('model-connection').dataset.connected='false';}
  else if(own&&state.task?.status==='running'&&state.task.model){el('model-connection').textContent=state.task.modelConnected?`${state.task.model} 已连接`:`正在连接 ${state.task.model}…`;el('model-connection').dataset.connected=String(!!state.task.modelConnected);}
  else{el('model-connection').textContent=`${state.model.model} 已就绪`;el('model-connection').dataset.connected='true';}
  el('task-status').textContent=own&&state.task?labels[state.task.status]??state.task.status:active?t('otherTask'):'';
  el('event-details').hidden=true;
  el('task-status').dataset.status=own?state.task?.status??'':'';
  const toolNames:Record<string,string>= {list_skills:t('findSkill'),read_skill:t('readSkill'),bash:t('runCommand'),write:t('writeFile'),edit:t('editFile'),read:t('consultFile'),browser:t('browse'),web_search:t('search'),group_message:t('sendMessage'),assign_tasks:t('assignTask'),task_result:t('submitResult'),silent:t('silent'),create_team:t('createTeam'),list_team:t('listTeam'),request_role_change:t('requestRole')};
  const toolIcons:Record<string,IconName>={list_skills:'search',read_skill:'file',bash:'terminal',write:'file',edit:'edit',read:'file',browser:'globe',web_search:'search',group_message:'send',assign_tasks:'at',task_result:'check',silent:'bell',create_team:'group',list_team:'group',request_role_change:'edit'};
  type Step={verb:string;tool:string;detail:string;running:boolean};
  const steps:Step[]=[];
  if(own&&state.task)for(const text of state.task.events){
    let match=/^执行 (\w+)$/.exec(text);
    if(match){const tool=match[1];steps.push({verb:toolNames[tool]??tool,tool,detail:'',running:true});continue;}
    match=/^(\w+) 完成[:：]?\s*(.*)$/.exec(text);
    if(match){const tool=match[1],step=[...steps].reverse().find(s=>s.running&&s.tool===tool);if(step){step.running=false;const value=match[2].trim();if(value)step.detail=value.split('/').pop()??value;}continue;}
  }
  const runningStep=[...steps].reverse().find(s=>s.running);
  el('event-summary').textContent=runningStep?`正在${runningStep.verb}…`:steps.length?`已完成 ${steps.length} 个步骤`:t('execution');
  el('event-details').hidden=true;
  el('task-status').hidden=!!active;
  const list=el('event-list');list.replaceChildren();
  for(const step of steps){
    const row=document.createElement('div');row.className='event-step'+(step.running?' running':'');
    const ic=document.createElement('span');ic.className='event-icon';ic.append(icon(toolIcons[step.tool]??'file'));
    const label=document.createElement('span');label.className='event-label';label.textContent=step.detail?`${step.verb} · ${step.detail}`:step.verb;
    const mark=document.createElement('span');mark.className='event-state';mark.append(icon(step.running?'spinner':'check'));
    row.append(ic,label,mark);list.append(row);
  }
  el('mention-member').hidden=!group;el('mention-all').hidden=!group;el('jobs-details').hidden=!group;
  const jobs=el('group-jobs');jobs.replaceChildren();const statuses:Record<string,string>={queued:t('queued'),running:t('running'),completed:t('reported'),responded:t('replyReview'),silent:t('silentDone'),blocked:t('blocked'),failed:t('failed'),stopped:t('stopped'),interrupted:t('interrupted')};
  for(const job of state.jobs){const row=document.createElement('p');row.textContent=`${job.memberName} · ${statuses[job.status]??job.status}：${job.instruction}${job.error?'（'+job.error+'）':''}`;
    // E06a：中断/停止的群任务保留为待办，用户可一键重新入队（不自动重跑）。
    if(job.status==='interrupted'||job.status==='stopped'){const requeue=document.createElement('button');requeue.textContent=t('requeue');requeue.setAttribute('aria-label',`重新入队 ${job.memberName} 的任务`);requeue.onclick=()=>{const composer=el<HTMLTextAreaElement>('task');composer.value=`@${job.memberName} ${job.instruction}`;composer.focus();};row.append(requeue);}
    jobs.append(row);}
  for(const node of document.querySelectorAll<HTMLElement>('.identity-avatar[data-member-id]')){const message=node.closest<HTMLElement>('.message');const busy=working&&node.dataset.memberId===task?.memberId&&(!message||message.dataset.activeTask==='true');node.classList.toggle('is-working',busy);const member=state.conversations.find(c=>c.id===node.dataset.memberId);node.title=busy?`${member?.name??t('members')} 正在执行：${task?.instruction??t('currentTask')}`:member?.name??t('groups');}
  if(working&&task?.conversationId===state.selected){const member=state.conversations.find(c=>c.id===task.memberId);el('task-status').textContent=`${member?.name??t('members')} 正在执行：${task.instruction??t('currentTask')}`;el('task-status').title=el('task-status').textContent;}
  for(const button of document.querySelectorAll<HTMLElement>('button'))if(button.querySelector('svg')&&!button.title)button.title=button.getAttribute('aria-label')??button.textContent?.trim()??t('action');
  layout.syncBrowser();
}
async function action(promise:Promise<Reply<AppState>>,config=false){
  el('notice').textContent='';el('settings-notice').textContent='';
  try{const reply=await promise;if(!reply.ok)throw Error(reply.error);render(reply.value,config);return true;}catch(error){showError(error);return false;}
}
el<HTMLInputElement>('conversation-search').oninput=event=>{search=(event.currentTarget as HTMLInputElement).value.trim().toLocaleLowerCase();if(current)render(current);};
for(const span of document.querySelectorAll<HTMLElement>('#settings-menu .cat-icon[data-icon]'))span.replaceChildren(icon(span.dataset.icon as IconName));
for(const button of document.querySelectorAll<HTMLButtonElement>('#settings-menu button[data-cat]'))button.onclick=()=>{settingsCategory=button.dataset.cat as typeof settingsCategory;if(current){populateSettings(current);render(current);}el('settings-close').focus();};
el('settings-back').onclick=()=>{settingsCategory='';if(current)render(current);document.querySelector<HTMLButtonElement>('#settings-menu button[data-cat]')?.focus();};
el('settings-open').onclick=()=>void window.forma.openSettings().then(reply=>{if(!reply.ok)showError(Error(reply.error));});
el('settings-close').onclick=()=>{settingsOpen=false;settingsCategory='';if(current)render(current);el('settings-open').focus();};
document.addEventListener('pointerdown',event=>{if(!settingsOpen||settingsCategory)return;const target=event.target as Node;if(el('settings-menu').contains(target)||el('settings-open').contains(target))return;settingsOpen=false;if(current)render(current);});
el('model-form').onsubmit=event=>{event.preventDefault();const input={provider:provider.value as ProviderId,model:model.value.trim(),apiKey:key.value};key.value='';void action(window.forma.saveModel(input),true);};
el('delete-model').onclick=()=>void action(window.forma.deleteModel(),true);
el('choose-workspace').onclick=()=>void action(window.forma.chooseWorkspace(),true);
el('forget-workspace').onclick=()=>void action(window.forma.forgetWorkspace(),true);
el('run').onclick=async()=>{
  if(composerPending)return;
  const input=el<HTMLTextAreaElement>('task'),prompt=input.value,selected=current?.selected;
  const stopping=current?.task?.status==='running';if(!stopping&&!prompt.trim()&&!current?.attachments.some(a=>a.kind==='image'))return;
  composerPending=true;el<HTMLButtonElement>('run').disabled=true;
  try{
    const accepted=await action(stopping?window.forma.stopTask():window.forma.runTask(prompt,el<HTMLSelectElement>('member').value));
    if(!stopping&&accepted&&selected&&current?.selected===selected&&input.value===prompt){drafts.delete(selected);input.value='';resizeComposer();}
  }finally{composerPending=false;if(current)render(current);}
};
el('task').addEventListener('paste',event=>{
  const image=Array.from(event.clipboardData?.files??[]).find(f=>/^image\/(png|jpeg|webp)$/.test(f.type));
  const conversationId=current?.selected;if(!image||!conversationId)return;
  event.preventDefault();
  if(image.size>16000000){el('task-status').hidden=false;el('task-status').textContent='图片过大，请缩小后再粘贴。';return;}
  const reader=new FileReader();reader.onload=()=>{void action(window.forma.pasteImage({conversationId,data:String(reader.result)}));};reader.onerror=()=>{el('task-status').hidden=false;el('task-status').textContent='读取图片失败，请重新粘贴。';};reader.readAsDataURL(image);
});
let composerComposing=false;
el('task').addEventListener('compositionstart',()=>{composerComposing=true;});
el('task').addEventListener('compositionend',()=>{composerComposing=false;});
el('task').addEventListener('keydown',event=>{
  if(event.key!=='Enter'||event.defaultPrevented||composerComposing||event.isComposing||event.keyCode===229||event.shiftKey)return;
  event.preventDefault();
  if(!event.repeat&&current?.task?.status!=='running')el<HTMLButtonElement>('run').click();
});
el('mention-member').onclick=()=>mentions.open();
el('mention-all').onclick=()=>{el<HTMLTextAreaElement>('task').value+='@所有人 ';resizeComposer();el('task').focus();};
let sectionTarget='';
function openItemMenu(item:Conversation,source:HTMLElement,x:number,y:number){
 const change=(action:'pin'|'unread'|'hide'|'duplicate'|'copy-id',value?:boolean)=>void actionReply(action,value);
 const actionReply=async(operation:'pin'|'unread'|'hide'|'duplicate'|'copy-id',value?:boolean)=>{await action(window.forma.sidebarAction({id:item.id,action:operation,value}));};
 showContextMenu(x,y,[
  {label:item.sidebar?.pinned?t('unpin'):t('pinned'),icon:'pin',run:()=>change('pin',!item.sidebar?.pinned)},
  {label:t('moveToSection'),icon:'folder',run:()=>{sectionTarget=item.id;el<HTMLInputElement>('section-name').value=item.sidebar?.section??'';el('section-notice').textContent='';el('section-options').replaceChildren(...[...new Set(current?.conversations.map(c=>c.sidebar?.section).filter(Boolean))].map(name=>new Option(name,name)));el<HTMLDialogElement>('section-dialog').showModal();el('section-name').focus();}},
  {label:item.sidebar?.unread?t('markRead'):t('markUnread'),icon:'bell',run:()=>change('unread',!item.sidebar?.unread)},
  {label:t('editProfile'),icon:'edit',separator:true,run:()=>{void (async()=>{if(await action(window.forma.selectConversation(item.id)))openConversation('edit');})();}},
  {label:t('duplicate'),icon:'copy',run:()=>change('duplicate')},
  ...(item.kind==='bot'?[{label:t('newProject'),icon:'copy' as const,run:()=>{openConversation('bot');sourceBotId=item.id;el<HTMLInputElement>('bot-name').value=`${item.name} 新项目`.slice(0,80);el<HTMLTextAreaElement>('bot-role').value=item.role;}}]:[]),
  {label:t('copyConversationId'),icon:'copy',separator:true,run:()=>change('copy-id')},
  {label:t('hideSidebar'),icon:'hide',separator:true,run:()=>change('hide',true)},
  {label:t('delete'),icon:'trash',danger:true,run:()=>{void (async()=>{const reply=await window.forma.deleteConversation(item.id);if(reply.ok&&!reply.value.conversations.some(c=>c.id===item.id))drafts.delete(item.id);await action(Promise.resolve(reply));})();}},
 ],source);
}
el('section-cancel').onclick=()=>el<HTMLDialogElement>('section-dialog').close();
el('section-form').onsubmit=async event=>{event.preventDefault();const reply=await window.forma.sidebarAction({id:sectionTarget,action:'section',value:el<HTMLInputElement>('section-name').value});if(reply.ok){el<HTMLDialogElement>('section-dialog').close();render(reply.value);}else el('section-notice').textContent=reply.error;};
let editingRoleVersion:number|undefined;
let workspaceToken:string|null|undefined;
let sourceBotId:string|undefined;
let dialogMode:'bot'|'group'|'edit'='bot';
const dialog=el<HTMLDialogElement>('conversation-dialog');
function openConversation(mode:typeof dialogMode){
  workspaceToken=undefined;sourceBotId=undefined;el('pick-conversation-workspace').hidden=mode==='edit';el('inherit-conversation-workspace').hidden=mode==='edit';dialogMode=mode;const selected=current?.conversations.find(c=>c.id===current?.selected);editingRoleVersion=selected?.roleVersion;
  const space=mode==='edit'?current?.conversationWorkspaces?.[selected?.id??'']:undefined;el('conversation-workspace-path').textContent=space?`固定空间 · ${space.path}`:`默认空间 · ${current?.workspace?.path??t('notChosen')}`;
  el('delete-bot').hidden=mode!=='edit'||selected?.kind!=='bot';
  el('dialog-title').textContent=mode==='edit'?t('editNameRole'):mode==='bot'?t('newBot'):t('createGroup');el<HTMLInputElement>('bot-name').value=mode==='edit'?selected?.name??'':'';el<HTMLTextAreaElement>('bot-role').value=mode==='edit'?selected?.role??'':'';
  el('group-members').replaceChildren();el('dialog-notice').textContent='';
  const modelRow=el('member-model-row'),modelSelect=el<HTMLSelectElement>('member-model');
  const globalModel=current?.model,editBot=mode==='edit'&&selected?.kind==='bot';
  modelRow.hidden=!editBot||!globalModel;
  if(!modelRow.hidden&&globalModel){modelSelect.replaceChildren(new Option(`跟随全局（${globalModel.model}）`,''));for(const id of presets[globalModel.provider as ProviderId]??[]){if(id!==globalModel.model)modelSelect.add(new Option(id,id));}
    const bound=current?.memberModels?.[selected!.id];modelSelect.value=bound&&bound.provider===globalModel.provider?bound.model:'';}
  const history=el('role-history');history.replaceChildren();history.hidden=mode!=='edit'||selected?.kind!=='bot';
  if(!history.hidden){
    const summary=document.createElement('summary');summary.textContent=`当前职责版本 ${selected?.roleVersion} · 查看变更记录`;history.append(summary);
    const note=document.createElement('p');note.className='muted';note.textContent=t('roleHelp');history.append(note);
    const labels={migration:t('legacyProfile'),user_create:t('userCreated'),user_edit:t('userEdited'),user_approved:t('userApproved'),team_create:t('teamCreated'),duplicate:t('duplicate')};
    for(const version of current?.roleHistory??[]){const entry=document.createElement('div'),heading=document.createElement('strong'),body=document.createElement('p');heading.textContent=`版本 ${version.version} · ${labels[version.source]} · ${new Date(version.createdAt).toLocaleString()}`;body.textContent=version.role;body.style.whiteSpace='pre-wrap';entry.append(heading,body);history.append(entry);}
  }

  if(mode==='group'||(mode==='edit'&&selected?.kind==='group')){const title=document.createElement('h3');title.textContent=t('groupMembers');el('group-members').append(title);for(const bot of current?.conversations.filter(c=>c.kind==='bot')??[]){const label=document.createElement('label'),checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.value=bot.id;checkbox.checked=mode==='edit'&&!!selected?.members.includes(bot.id);label.append(checkbox,document.createTextNode(bot.name));el('group-members').append(label);}
    if(mode==='edit'){const title=document.createElement('h3');title.textContent=t('coordinator');el('group-members').append(title);const select=document.createElement('select');select.id='manager-select';if(!selected?.managerId){const none=document.createElement('option');none.value='';none.textContent=t('noCoordinator');none.selected=true;select.append(none);}for(const id of [selected?.managerId,...selected?.members??[]].filter((v):v is string=>!!v)){const member=current?.conversations.find(c=>c.id===id);if(!member)continue;const option=document.createElement('option');option.value=id;option.textContent=member.name;option.selected=id===selected?.managerId;select.append(option);}select.dataset.initial=select.value;el('group-members').append(select);const note=document.createElement('p');note.className='muted';note.textContent=t('coordinatorHelp');el('group-members').append(note);}}
  dialog.showModal();layout.syncBrowser();
}
el('current-workspace').onclick=()=>openConversation('edit');
el('pick-conversation-workspace').onclick=async()=>{try{const reply=await window.forma.pickConversationWorkspace();if(!reply.ok)throw Error(reply.error);if(reply.value){workspaceToken=reply.value.token;el('conversation-workspace-path').textContent=`独立空间 · ${reply.value.path}`;}}catch(error){el('dialog-notice').textContent=error instanceof Error?error.message:t('selectionFailed');}};
el('inherit-conversation-workspace').onclick=()=>{workspaceToken=null;el('conversation-workspace-path').textContent=`默认空间 · ${current?.workspace?.path??t('notChosen')}`;};
el('header-members').onclick=()=>openConversation('edit');
el('browser-pick').onclick=()=>void window.forma.browserPick().then(r=>{if(r.ok)render(r.value);});
el('browser-capture').onclick=()=>void window.forma.browserCapture().then(r=>{if(r.ok)render(r.value);});
el('new-bot').onclick=()=>openConversation('bot');el('new-group').onclick=()=>openConversation('group');
el('create-from-doc').onclick=async()=>{try{const reply=await window.forma.createTeamFromDocument();if(!reply.ok)throw Error(reply.error);render(reply.value);}catch(error){const notice=el('settings-notice');notice.textContent=error instanceof Error?error.message:t('teamFailed');setTimeout(()=>{if(notice.textContent?.includes(t('buildTeam'))||notice.textContent?.includes(t('cancel')))notice.textContent='';},6000);}};el('dialog-cancel').onclick=()=>dialog.close();dialog.onclose=()=>layout.syncBrowser();
function bindEditTrigger(node:HTMLElement,label:string){node.setAttribute('role','button');node.tabIndex=0;node.title=label;node.setAttribute('aria-label',label);node.onclick=()=>openConversation('edit');node.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openConversation('edit');}};}
bindEditTrigger(el('conversation-heading'),t('editConversation'));
el('delete-bot').onclick=async()=>{
  const id=current?.selected;if(!id)return;
  try{const reply=await window.forma.deleteConversation(id);if(!reply.ok)throw Error(reply.error);if(!reply.value.conversations.some(c=>c.id===id)){drafts.delete(id);dialog.close();}render(reply.value);}catch(error){el('dialog-notice').textContent=error instanceof Error?error.message:t('deleteFailed');}
};
function managerChangePayload():{managerId?:string}{const select=document.getElementById('manager-select') as HTMLSelectElement|null;if(!select)return {};return select.value!==select.dataset.initial?{managerId:select.value}:{};}
el('conversation-form').onsubmit=async event=>{
  event.preventDefault();const name=el<HTMLInputElement>('bot-name').value,role=el<HTMLTextAreaElement>('bot-role').value;
  try{
    if(dialogMode==='edit'&&el('member-model-row').hidden===false){
      const modelValue=el<HTMLSelectElement>('member-model').value;
      const chosen=modelValue===''?null:{provider:current!.model!.provider,model:modelValue};
      const existing=current?.memberModels?.[current!.selected!];
      if(JSON.stringify(existing??null)!==JSON.stringify(chosen)){const modelReply=await window.forma.setMemberModel({botId:current!.selected!,provider:chosen?.provider??'',model:chosen?chosen.model:null});if(!modelReply.ok)throw Error(modelReply.error);}
    }
    const reply=dialogMode==='edit'?await window.forma.updateConversation({id:current!.selected!,name,role,workspaceToken,expectedRoleVersion:editingRoleVersion,...(current?.conversations.find(c=>c.id===current?.selected)?.kind==='group'?{members:[...document.querySelectorAll<HTMLInputElement>('#group-members input:checked')].map(e=>e.value),...managerChangePayload()}:{})}):await window.forma.createConversation({name,role,workspaceToken,sourceBotId,kind:dialogMode,members:[...document.querySelectorAll<HTMLInputElement>('#group-members input:checked')].map(e=>e.value)});if(!reply.ok)throw Error(reply.error);dialog.close();render(reply.value);}catch(error){el('dialog-notice').textContent=error instanceof Error?error.message:t('saveFailed');}
};
void action(window.forma.state(),true);
setInterval(async()=>{try{const reply=await window.forma.state();if(reply.ok)render(reply.value);}catch(error){showError(error);}},600);

document.addEventListener('keydown',event=>{
  if(el('settings').hidden&&el('settings-menu').hidden)return;
  if(event.key==='Escape'&&settingsOpen&&current?.model?.hasKey&&current.workspace){settingsOpen=false;settingsCategory='';if(current)render(current);el('settings-open').focus();return;}
  if(el('settings').hidden)return;
  if(event.key==='Tab'){
    const focusable=[...el('settings').querySelectorAll<HTMLElement>('button,input,select,textarea')].filter(node=>node.offsetParent!==null&&!(node as HTMLButtonElement).disabled);
    const first=focusable[0],last=focusable[focusable.length-1];
    if(event.shiftKey&&(document.activeElement===first||!el('settings').contains(document.activeElement))){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&(document.activeElement===last||!el('settings').contains(document.activeElement))){event.preventDefault();first?.focus();}
  }
});

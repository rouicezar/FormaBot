import type {DiscoveredTool} from '../capabilities/discovery';
import { localizeDocument } from './localization';
import { t } from '../shared/i18n';
import {icon,type IconName} from './icons';
import {providers,presets} from '../models/config';
import type {AppState,FormaApi,ProviderId,Reply} from '../shared/contracts';
declare global {interface Window{forma:FormaApi}}
const el=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const api=window.forma,provider=el<HTMLSelectElement>('provider'),preset=el<HTMLSelectElement>('preset'),model=el<HTMLInputElement>('model-id'),key=el<HTMLInputElement>('api-key');
let state:AppState,tab='model';
const categoryIcons:Record<string,IconName>={tools:'wrench',general:'settings',model:'spark',workspace:'folder',approval:'shield',memory:'layers',hidden:'panelLeft'};
for(const button of document.querySelectorAll<HTMLButtonElement>('[role=tab]')){button.prepend(icon(categoryIcons[button.dataset.tab!],16));button.id=`settings-tab-${button.dataset.tab}`;button.setAttribute('aria-controls',button.dataset.tab!);el(button.dataset.tab!).setAttribute('aria-labelledby',button.id);}
el('back').prepend(icon('back',16));el('back').onclick=()=>window.close();
for(const item of providers)provider.add(new Option(item.name,item.id));
function options(){preset.replaceChildren(...presets[provider.value as ProviderId].map(id=>new Option(id,id)));}
provider.onchange=()=>{options();model.value=preset.value;key.value='';};preset.onchange=()=>model.value=preset.value;
function populate(){provider.value=state.model?.provider??'deepseek';options();model.value=state.model?.model??preset.value;preset.value=model.value;key.value='';el('key-status').textContent=state.model?.hasKey?t('keySaved'):t('keyMissing');el('workspace-path').textContent=state.workspace?.path??t('notChosen');el<HTMLInputElement>('output-dir').value=state.workspace?.outputDir??'outputs';}
async function run<T>(promise:Promise<Reply<T>>){el('notice').textContent='';const r=await promise;if(!r.ok)throw Error(r.error);return r.value;}
function error(e:unknown){el('notice').textContent=e instanceof Error?e.message:String(e);}
async function refresh(){state=await run(api.state());localizeDocument(state.locale??'zh-CN');el<HTMLSelectElement>('language').value=state.locale??'zh-CN';populate();await renderTab();}
function entry(list:HTMLElement,text:string,label:string,remove:()=>Promise<unknown>){const row=document.createElement('div'),copy=document.createElement('span'),button=document.createElement('button');row.className='entry';copy.textContent=text;button.textContent=label;button.onclick=()=>void remove().then(renderTab).catch(error);row.append(copy,button);list.append(row);}
async function renderTab(){
 for(const section of document.querySelectorAll<HTMLElement>('section[role=tabpanel]'))section.hidden=section.id!==tab;
 for(const button of document.querySelectorAll<HTMLButtonElement>('[role=tab]')){const active=button.dataset.tab===tab;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;}
 if(tab==='tools'){await renderMcp();await scanTools();}
 if(tab==='approval'){const list=el('approval-list');list.replaceChildren();const [a,h]=await Promise.all([run(api.approvalRules()),run(api.handoffRules())]);for(const r of a)entry(list,`${r.workspace??t('defaultProject')} · ${r.host} · ${r.action} · ${r.decision==='require'?t('confirmEach'):t('allowed')}`,t('delete'),()=>run(api.deleteApprovalRule(r)));for(const r of h)entry(list,`${r.member} → ${r.target}`,t('delete'),()=>run(api.deleteHandoffRule(r)));if(!list.children.length)list.textContent=t('noRules');}
 if(tab==='memory'){const list=el('memory-list');list.replaceChildren();for(const m of await run(api.memories()))entry(list,`${m.botName} · ${m.conversationName}：${m.content}`,t('delete'),()=>run(api.deleteMemory({id:m.id})));if(!list.children.length)list.textContent=t('noMemory');}
 if(tab==='hidden'){state=await run(api.state());const list=el('hidden-list');list.replaceChildren();for(const c of state.conversations){const row=document.createElement('label'),name=document.createElement('span'),toggle=document.createElement('input');row.className='entry';name.textContent=c.name;toggle.type='checkbox';toggle.className='switch';toggle.setAttribute('role','switch');toggle.setAttribute('aria-label',t('showConversation',{name:c.name}));toggle.checked=!c.sidebar?.hidden;toggle.onchange=async()=>{const checked=toggle.checked;toggle.disabled=true;try{await run(api.sidebarAction({id:c.id,action:'hide',value:!checked}));}catch(e){toggle.checked=!checked;error(e);}finally{toggle.disabled=false;}};row.append(name,toggle);list.append(row);}if(!list.children.length)list.textContent=t('noConversations');}
}
const tabs=[...document.querySelectorAll<HTMLButtonElement>('[role=tab]')];for(const [i,button] of tabs.entries()){button.onclick=()=>{tab=button.dataset.tab!;void renderTab().catch(error);};button.onkeydown=e=>{if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(['ArrowDown','ArrowRight'].includes(e.key)?1:-1)+tabs.length)%tabs.length;tabs[next].click();tabs[next].focus();};}
el('model-form').onsubmit=e=>{e.preventDefault();const input={provider:provider.value as ProviderId,model:model.value.trim(),apiKey:key.value};key.value='';void run(api.saveModel(input)).then(refresh).catch(error);};
el('delete-model').onclick=()=>void run(api.deleteModel()).then(refresh).catch(error);
el('choose-workspace').onclick=()=>void run(api.chooseWorkspace()).then(refresh).catch(error);
el('forget-workspace').onclick=()=>void run(api.forgetWorkspace()).then(refresh).catch(error);
el('save-output-dir').onclick=()=>void run(api.setOutputDir(el<HTMLInputElement>('output-dir').value)).then(refresh).catch(error);
el<HTMLSelectElement>('language').onchange=async()=>{
 const select=el<HTMLSelectElement>('language'),previous=state.locale??'zh-CN';select.disabled=true;
 try{state=await run(api.setLocale(select.value as 'en'|'zh-CN'));localizeDocument(state.locale!);await renderTab();}
 catch(e){select.value=previous;error(e);}finally{select.disabled=false;}
};
void refresh().catch(error);

let toolScans:Promise<void>=Promise.resolve(),changingTool=false;
function scanTools():Promise<void>{
 const work=toolScans.then(refreshTools);toolScans=work.catch(()=>{});return work;
}
async function refreshTools(){
 const button=el<HTMLButtonElement>('refresh-tools');button.disabled=true;const list=el('tools-list');list.textContent=t('scanningTools');
 try{
  const inventory=await run(api.discoverTools());list.replaceChildren();
  const groups=[
   {key:'enabled',label:t('enabledTools'),items:inventory.items.filter(x=>x.status==='enabled')},
   {key:'available',label:t('availableSkills'),items:inventory.items.filter(x=>x.kind==='skill'&&x.status!=='enabled')},
   {key:'unsupported',label:t('unsupportedTools'),items:inventory.items.filter(x=>x.kind!=='skill'&&x.status!=='enabled')},
  ];
  for(const group of groups){
   const region=document.createElement('div'),heading=document.createElement('h2');region.dataset.toolGroup=group.key;heading.textContent=`${group.label} (${group.items.length})`;region.append(heading);
   if(!group.items.length){const p=document.createElement('p');p.textContent=t('noToolsInGroup');region.append(p);}
   for(const item of group.items.sort((a,b)=>a.name.localeCompare(b.name)||a.source.localeCompare(b.source)))renderTool(region,item);
   list.append(region);
  }
  const sources=el('tool-sources');sources.replaceChildren();
  for(const source of inventory.sources){const p=document.createElement('p');const labels={scanned:'已扫描',missing:'未找到',unavailable:'无法读取',limited:'已达到扫描上限'};p.textContent=`${source.path} · ${state.locale==='en'?source.status:labels[source.status]}`;sources.append(p);}
 }catch(e){list.textContent=t('toolsRefreshFailed');throw e;}finally{button.disabled=changingTool;}
}
el('refresh-tools').onclick=()=>void scanTools().catch(error);

function toolSource(item:DiscoveredTool):string{
 if(item.source.includes('/.agents/skills/'))return '~/.agents/skills';
 if(item.source.includes('/.claude/skills/'))return '~/.claude/skills';
 if(item.source.includes('/.codex/skills/'))return '~/.codex/skills';
 if(item.source.includes('/.codex/plugins/'))return '~/.codex/plugins';
 if(item.source.includes('/.claude/plugins/'))return '~/.claude/plugins';
 return t('localSource');
}
function renderTool(list:HTMLElement,item:DiscoveredTool){
 const row=document.createElement('div'),name=document.createElement('strong'),detail=document.createElement('p');
 const source=toolSource(item),kind=item.kind==='skill'?'Skill':item.kind==='mcp'?'MCP':t('extensionType');
 row.className='card';row.dataset.toolId=item.id;row.dataset.toolStatus=item.status;name.textContent=item.name;
 detail.textContent=`${kind} · ${t(item.status==='enabled'?'skillEnabled':item.kind==='skill'?'skillDisabled':'integrationPending')} · ${t('toolOrigin',{source})}`;
 row.append(name,detail);
 const location=document.createElement('details'),label=document.createElement('summary'),path=document.createElement('p');label.textContent=t('sourceLocation');path.textContent=item.source;location.append(label,path);row.append(location);
 if(item.description){const p=document.createElement('p');p.textContent=item.description;row.append(p);}
 if(item.skipped){const p=document.createElement('p');p.textContent=t('skillSkipped',{count:item.skipped});row.append(p);}
 if(item.kind==='skill'){
  const button=document.createElement('button'),enable=item.status!=='enabled';button.textContent=t(enable?'enableSkillMethod':'disableSkillMethod');button.setAttribute('aria-label',`${button.textContent} ${item.name} (${source})`);button.style.margin='12px 0';button.disabled=changingTool;
  button.onclick=async()=>{
   if(changingTool)return;changingTool=true;let saved=false;let focusTarget:HTMLButtonElement|null=null;
   for(const b of document.querySelectorAll<HTMLButtonElement>('#tools-list button,#refresh-tools'))b.disabled=true;
   const feedback=el('tool-feedback');feedback.textContent=t('savingTool');
   try{
    await run(api.setSkillEnabled({id:item.id,enabled:enable}));saved=true;
    await scanTools();feedback.textContent=t(enable?'skillEnableSaved':'skillDisableSaved',{name:`${item.name} (${source})`});
    const updated=document.querySelector<HTMLElement>(`[data-tool-id="${item.id}"]`);updated?.scrollIntoView({block:'center'});focusTarget=updated?.querySelector<HTMLButtonElement>('button')??null;
   }catch(e){feedback.textContent=saved?t('toolsSavedRefreshFailed'):(e instanceof Error?e.message:String(e));feedback.scrollIntoView({block:'center'});}
   finally{changingTool=false;for(const b of document.querySelectorAll<HTMLButtonElement>('#tools-list button,#refresh-tools'))b.disabled=false;focusTarget?.focus({preventScroll:true});}
  };
  row.append(button);
 }
 list.append(row);
}

let mcpBusy=false,mcpRendered='';
async function renderMcp(){
 const result=await api.mcpStatus();if(!result.ok)throw Error(result.error);
 const connection=result.value,region=el('mcp-connection'),en=state.locale==='en';const signature=JSON.stringify([connection,en,mcpBusy]);if(signature===mcpRendered)return;mcpRendered=signature;region.replaceChildren();region.dataset.mcpStatus=connection.status;
 const title=document.createElement('h2');title.textContent='Figma MCP';
 const status=document.createElement('p');status.setAttribute('role','status');
 const labels={disconnected:en?'Not connected in FormaBot':'尚未在 FormaBot 连接',connecting:en?'Connecting…':'正在连接…',authorizing:en?'Complete authorization in your browser':'请在浏览器中完成授权',connected:en?`Connection verified · ${connection.toolCount} tools`:`连接已验证 · ${connection.toolCount} 项工具`,saved:en?'Authorization saved · reconnect to verify':'已保存授权 · 请重新验证连接',failed:en?'Connection failed':'连接未成功'};
 status.textContent=labels[connection.status]+(connection.message?`：${connection.message}`:'');
 const help=document.createElement('p');help.textContent=en?'Connects FormaBot to Figma separately from Skills. Figma limits access to approved clients. This stage verifies the connection; Bot tool execution is not yet available.':'在这里授权 FormaBot 访问你的 Figma 账号，与下方 Skill 分开。Figma 目前限制接入客户端。本阶段验证授权和服务连接，尚未开放 Bot 调用外部工具。';
 const button=document.createElement('button'),pending=['connecting','authorizing'].includes(connection.status);
 button.textContent=pending?(en?'Cancel connection':'取消连接'):(en?'Connect and authorize':'连接并授权');button.disabled=mcpBusy;
 button.onclick=()=>void mcpAction(pending?()=>api.mcpCancel():()=>api.mcpConnect());
 const actions=document.createElement('div');actions.className='actions';button.className=pending?'':'primary';actions.append(button);region.append(title,status,help,actions);
 if(['saved','connected'].includes(connection.status)){const disconnect=document.createElement('button');disconnect.textContent=en?'Disconnect in FormaBot':'在 FormaBot 断开';disconnect.disabled=mcpBusy;disconnect.onclick=()=>void mcpAction(()=>api.mcpDisconnect());actions.append(disconnect);}
}
async function mcpAction(action:()=>Promise<Reply<import('../capabilities/mcp').McpView>>){
 if(mcpBusy)return;mcpBusy=true;try{await run(action());}catch(e){error(e);}finally{mcpBusy=false;await renderMcp();}
}
setInterval(()=>{if(tab==='tools'&&!mcpBusy)void renderMcp().catch(error);},1500);

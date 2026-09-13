import { t } from '../shared/i18n';
import { renderMarkdown } from './markdown';
import type {AppState,FormaApi,Preview} from '../shared/contracts';
import {WorkbenchLayout} from './layout';
const el=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
export class RightPanel {
 private current?:Preview;
 private conversation?:string;
 private historyKey='';
 private source?:{taskId:string;path:string};
 private request=0;
 private renderVersion=0;
 constructor(private api:FormaApi,private layout:WorkbenchLayout){
   this.installDivider();
   el('preview-render').onclick=()=>void this.render(false);el('preview-source').onclick=()=>void this.render(true);
   el('copy-source').onclick=async()=>{try{if(!this.source)return;const reply=await api.copySource(this.source);if(!reply.ok)throw Error(reply.error);el('preview-notice').textContent=t('sourceCopied');}catch(error){el('preview-notice').textContent=String(error);}};
   el('address-form').onsubmit=e=>{e.preventDefault();void this.control('navigate',el<HTMLInputElement>('browser-address').value);};
   for(const action of ['back','forward','reload','stop'] as const)el(`browser-${action}`).onclick=()=>void this.control(action);
 }
 private installDivider(){
   const view=el('artifact-view'),divider=el('artifact-divider'),key='formabot.artifact-history-height';let height=150;
   try{const saved=Number(localStorage.getItem(key));if(Number.isFinite(saved)&&saved>=72)height=saved;}catch{}
   const maximum=()=>Math.max(72,view.clientHeight-230);
   const apply=()=>{if(!view.clientHeight)return;const value=Math.max(72,Math.min(maximum(),height));view.style.setProperty('--history-height',`${value}px`);divider.setAttribute('aria-valuemin','72');divider.setAttribute('aria-valuemax',String(maximum()));divider.setAttribute('aria-valuenow',String(Math.round(value)));};
   const save=()=>{try{localStorage.setItem(key,String(height));}catch{}};
   divider.onpointerdown=event=>{if(event.button!==0)return;event.preventDefault();divider.setPointerCapture(event.pointerId);view.classList.add('resizing');const start=event.clientY,initial=el('artifact-history').getBoundingClientRect().height;
     const move=(e:PointerEvent)=>{height=Math.max(72,Math.min(maximum(),initial+e.clientY-start));apply();};
     const finish=()=>{view.classList.remove('resizing');divider.removeEventListener('pointermove',move);divider.removeEventListener('pointerup',finish);divider.removeEventListener('pointercancel',finish);divider.removeEventListener('lostpointercapture',finish);save();};
     divider.addEventListener('pointermove',move);divider.addEventListener('pointerup',finish);divider.addEventListener('pointercancel',finish);divider.addEventListener('lostpointercapture',finish);
   };
   divider.onkeydown=event=>{if(!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;event.preventDefault();const current=Number(divider.getAttribute('aria-valuenow'))||height;height=event.key==='Home'?72:event.key==='End'?maximum():Math.max(72,Math.min(maximum(),current+(event.key==='ArrowDown'?20:-20)));apply();save();};
   new ResizeObserver(apply).observe(view);apply();
 }
 private async control(action:'navigate'|'back'|'forward'|'reload'|'stop',url?:string){
   this.layout.show('browser');el('browser-error').textContent='';
   try{const reply=await this.api.browserControl({action,url});if(!reply.ok)throw Error(reply.error);this.layout.syncBrowser();}catch(error){el('browser-error').textContent=error instanceof Error?error.message:t('browserFailed');}
 }
 update(state:AppState){
   if(this.conversation!==state.selected){this.conversation=state.selected;++this.request;++this.renderVersion;this.current=undefined;this.source=undefined;this.clear();el('artifact-title').textContent=t('artifactPreview');el('artifact-title').title='';el('artifact-path').textContent=t('chooseArtifact');el('preview-notice').textContent='';}
   const history=state.artifactHistory??[],key=JSON.stringify([state.locale,state.selected,history,this.source]);
   if(key!==this.historyKey){this.historyKey=key;const list=el('artifact-history');list.replaceChildren();const title=document.createElement('h3');title.textContent=`${t('artifactHistory')} · ${history.length}`;list.append(title);
     if(!history.length){const empty=document.createElement('p');empty.textContent=t('noArtifacts');list.append(empty);}
     for(const entry of history){const button=document.createElement('button'),name=document.createElement('span'),meta=document.createElement('small');name.textContent=entry.path.split('/').pop()??entry.path;meta.textContent=`${entry.createdAt?new Date(entry.createdAt).toLocaleString():t('legacyArtifact')} · ${entry.conversationName}`;button.title=entry.path;button.setAttribute('aria-current',String(this.source?.taskId===entry.taskId&&this.source.path===entry.path));button.append(name,meta);button.onclick=()=>void this.open(entry.taskId,entry.path);list.append(button);}
   }

   const address=el<HTMLInputElement>('browser-address');if(document.activeElement!==address)address.value=state.browser.url;
   el<HTMLButtonElement>('browser-back').disabled=!state.browser.canGoBack;el<HTMLButtonElement>('browser-forward').disabled=!state.browser.canGoForward;
   el('browser-reload').hidden=state.browser.loading;el('browser-stop').hidden=!state.browser.loading;
   if(state.browser.error)el('browser-error').textContent=state.browser.error;
   // E03a：接管窗口内提示用户 Bot 让出浏览器，避免误以为 Bot 卡死。
   el('browser-lease').textContent=state.browser.manual?t('manualBrowser'):'';
 }
 async open(taskId:string,path:string){
   const request=++this.request;this.source={taskId,path};this.current=undefined;this.layout.show('artifact');
   el('artifact-title').textContent=path.split('/').pop()??t('artifacts');el('artifact-path').textContent=path;el('artifact-title').title=path;el('preview-notice').textContent=t('reading');
   this.clear();
   try{const reply=await this.api.preview({taskId,path});if(request!==this.request)return;if(!reply.ok)throw Error(reply.error);this.current=reply.value;el('preview-notice').textContent='';await this.render(false);}catch(error){if(request===this.request)el('preview-notice').textContent=error instanceof Error?error.message:t('previewFailed');}
 }
 private clear(){
   el('artifact-text').textContent='';el('artifact-image').hidden=true;el('artifact-rendered').replaceChildren();
   // Destroy the old document without racing an empty srcdoc navigation against the next preview.
   const placeholder=document.createElement('div');placeholder.id='artifact-frame';placeholder.hidden=true;el('artifact-frame').replaceWith(placeholder);
 }
 private async render(source:boolean){
   const renderVersion=++this.renderVersion;
   if(!this.current)return;this.clear();const value=this.current;
   el<HTMLButtonElement>('preview-source').disabled=value.kind==='image';el<HTMLButtonElement>('copy-source').disabled=value.kind==='image';
   el('preview-render').setAttribute('aria-pressed',String(!source));el('preview-source').setAttribute('aria-pressed',String(source));
   if(value.kind==='image'){const img=el<HTMLImageElement>('artifact-image');img.src=value.content;img.hidden=false;return;}
   if(source){el('artifact-text').textContent=value.content;return;}
   if(/\.html?$/i.test(value.path)){
     // Separate opaque origin; source cannot access the app, other frames, local files or navigation.
     const doc=new DOMParser().parseFromString(value.content,'text/html');
     doc.querySelectorAll('base,meta[http-equiv]').forEach(node=>node.remove());
     const request=this.request;
     const resources=[...doc.querySelectorAll<HTMLElement>('img[src],script[src],link[rel="stylesheet"][href]')];
     for(const node of resources.slice(0,30)){
       const attribute=node.tagName==='LINK'?'href':'src',reference=node.getAttribute(attribute)!;
       if(/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(reference))continue;
       const reply=await this.api.previewRelated({...this.source!,relative:reference.split(/[?#]/)[0]});
       if(request!==this.request||this.current!==value||renderVersion!==this.renderVersion)return;
       if(!reply.ok){el('preview-notice').textContent=t('resourceFailed')+reply.error;continue;}
       if(node.tagName==='IMG'&&reply.value.kind==='image')node.setAttribute('src',reply.value.content);
       if(node.tagName==='SCRIPT'&&reply.value.kind==='text'){node.removeAttribute('src');node.textContent=reply.value.content;}
       if(node.tagName==='LINK'&&reply.value.kind==='text'){const style=doc.createElement('style');style.textContent=reply.value.content;node.replaceWith(style);}
     }
     const policy=doc.createElement('meta');policy.httpEquiv='Content-Security-Policy';policy.content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: https:; font-src data:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'";
     doc.head.prepend(policy);
     const frame=document.createElement('iframe');frame.id='artifact-frame';frame.title=t('htmlPreview');frame.setAttribute('sandbox','allow-scripts');
     frame.srcdoc='<!doctype html>'+doc.documentElement.outerHTML;el('artifact-frame').replaceWith(frame);return;
   }
   if(/\.md$/i.test(value.path)){renderMarkdown(el('artifact-rendered'),value.content);return;}
   el('artifact-text').textContent=value.content;
 }
}

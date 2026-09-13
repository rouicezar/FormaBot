import type { BrowserState } from '../shared/contracts';
import { BrowserWindow, WebContentsView, session } from 'electron';
import { ControlLease } from './lease';

const configured=new WeakSet<Electron.Session>();
// E12a-1：注入页面的受控选择脚本——悬停吸附高亮；用户拖选 Range 时优先精确句段；点击锁定，Esc 取消；密码框不采集。
const PICK_SCRIPT=`(()=>{
if(window.__formabotPickActive)return 'already';
window.__formabotPickActive=true;window.__formabotPickResult=null;
const STYLE_ID='__formabot_pick_style';
const style=document.createElement('style');style.id=STYLE_ID;
style.textContent='.__formabot_hover{outline:2px solid #2f6bdb !important;outline-offset:-2px !important;border-radius:4px !important;cursor:crosshair !important;background:rgba(47,107,219,.12) !important}.__formabot_banner{position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#1c3d7a;color:#fff;font:12px/1.4 system-ui;padding:6px 14px;border-radius:14px;pointer-events:none}';
document.head.appendChild(style);
const banner=document.createElement('div');banner.className='__formabot_banner';banner.textContent='选择内容：拖选文字或点击元素，点击"添加到对话"完成；Esc 取消';document.documentElement.appendChild(banner);
let hovered=null;
const interactable=(el)=>{const t=el.tagName;if(t==='INPUT'||t==='TEXTAREA'||el.isContentEditable)return null;if(el.closest('input[type=password]'))return null;return el;};
const textOf=(el)=>{const r=document.createRange();r.selectNodeContents(el);return r.toString().replace(/\\s+/g,' ').trim().slice(0,8000);};
document.addEventListener('mousemove',e=>{const el=interactable(e.target);if(hovered&&hovered!==el)hovered.classList.remove('__formabot_hover');hovered=el;if(el)el.classList.add('__formabot_hover');},true);
document.addEventListener('click',e=>{
  const sel=document.getSelection();
  const selected=sel&&sel.rangeCount?sel.toString().trim():'';
  if(selected){window.__formabotPickResult={text:selected.slice(0,8000)};e.preventDefault();return;}
  const el=interactable(e.target);
  if(el){const text=textOf(el);if(text){window.__formabotPickResult={text};e.preventDefault();}}
},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape')window.__formabotPickResult={cancel:true};},true);
window.__formabotPickCleanup=()=>{
  if(hovered)hovered.classList.remove('__formabot_hover');
  banner.remove();document.getElementById(STYLE_ID)?.remove();
  window.__formabotPickActive=false;
};
return 'started';
})()`;
const CAPTURE_SCRIPT=`(()=>{
if(window.__formabotCaptureActive)return 'already';
window.__formabotCaptureActive=true;window.__formabotCaptureResult=null;
const style=document.createElement('style');style.id='__formabot_cap_style';
style.textContent='.__formabot_cap_banner{position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#5a3aa8;color:#fff;font:12px/1.4 system-ui;padding:6px 14px;border-radius:14px;pointer-events:none}.__formabot_cap_rect{position:fixed;z-index:2147483646;border:1.5px solid #5a3aa8;background:rgba(90,58,168,.12);border-radius:4px;pointer-events:none}';
document.head.appendChild(style);
const banner=document.createElement('div');banner.className='__formabot_cap_banner';banner.textContent='截取区域：点击元素吸附，或按住拖框；Esc 取消';document.documentElement.appendChild(banner);
let rect=null,start=null;const box=document.createElement('div');box.className='__formabot_cap_rect';box.style.display='none';document.documentElement.appendChild(box);
const draw=()=>{if(!rect){box.style.display='none';return;}box.style.display='block';box.style.left=rect.x+'px';box.style.top=rect.y+'px';box.style.width=rect.width+'px';box.style.height=rect.height+'px';};
const snap=e=>{const el=document.elementFromPoint(e.clientX,e.clientY);if(!el)return null;const r=el.getBoundingClientRect();return {x:Math.max(0,r.left),y:Math.max(0,r.top),width:Math.min(r.width,innerWidth-Math.max(0,r.left)),height:Math.min(r.height,innerHeight-Math.max(0,r.top))};};
document.addEventListener('mousemove',e=>{if(start){rect={x:Math.min(start.x,e.clientX),y:Math.min(start.y,e.clientY),width:Math.abs(e.clientX-start.x),height:Math.abs(e.clientY-start.y)};}else{rect=snap(e);}draw();},true);
document.addEventListener('mousedown',e=>{start={x:e.clientX,y:e.clientY};},true);
document.addEventListener('mouseup',e=>{if(!start)return;const dragged=Math.abs(e.clientX-start.x)+Math.abs(e.clientY-start.y)>8;const final=dragged?rect:snap(e);start=null;if(final&&final.width>4&&final.height>4)window.__formabotCaptureResult={...final};else window.__formabotCaptureResult={cancel:true};},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape')window.__formabotCaptureResult={cancel:true};},true);
window.__formabotCaptureCleanup=()=>{banner.remove();box.remove();document.getElementById('__formabot_cap_style')?.remove();window.__formabotCaptureActive=false;};
return 'started';})()`;
const CAPTURE_POLL=`(()=>{const r=window.__formabotCaptureResult;if(!r)return null;if(window.__formabotCaptureCleanup)try{window.__formabotCaptureCleanup();}catch{}window.__formabotCaptureResult=null;return r;})()`;
const PICK_POLL=`(()=>{const r=window.__formabotPickResult;if(!r)return null;if(window.__formabotPickCleanup)try{window.__formabotPickCleanup();}catch{}window.__formabotPickResult=null;return r;})()`;
export class TaskBrowser {
  private error='';
  private view?:WebContentsView;
  private bounds={x:0,y:0,width:0,height:0,visible:false};
  private lease=new ControlLease();
  private queue:Promise<unknown>=Promise.resolve();
  constructor(private partition:string,private owner:BrowserWindow,private onAction:()=>void){}
  setBounds(bounds:typeof this.bounds){this.bounds=bounds;if(this.view){this.view.setBounds({x:bounds.x,y:bounds.y,width:bounds.width,height:bounds.height});this.view.setVisible(bounds.visible);}}
  async call(value:unknown,signal:AbortSignal):Promise<string>{
    if(signal.aborted)throw new Error('任务已停止。');
    // E03a：人类接管期间 Bot 不抢控；同页面动作串行，避免并发工具操作互相踩踏。
    if(this.lease.held())throw new Error('用户正在使用浏览器，请等待其完成后再操作。');
    const run=this.queue.catch(()=>{}).then(()=>this.invoke(value,signal));
    this.queue=run;return run;
  }
  private async invoke(value:unknown,signal:AbortSignal):Promise<string>{
    if(signal.aborted)throw new Error('任务已停止。');
    if(this.lease.held())throw new Error('用户正在使用浏览器，请等待其完成后再操作。');
    const close=()=>this.close();signal.addEventListener('abort',close,{once:true});
    const timer=setTimeout(close,45000);
    try{return await this.perform(value);}finally{clearTimeout(timer);signal.removeEventListener('abort',close);}
  }
  private async perform(value:unknown,autoOpen=true):Promise<string>{
    const input=value as {action?:string;url?:string;selector?:string;text?:string};
    if(autoOpen)this.onAction();
    if(!this.view||this.view.webContents.isDestroyed()){
      const profile=session.fromPartition(`persist:formabot-${this.partition}`);
      if(!configured.has(profile)){profile.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));profile.on('will-download',event=>event.preventDefault());configured.add(profile);}
      this.view=new WebContentsView({webPreferences:{session:profile,nodeIntegration:false,contextIsolation:true,sandbox:true}});
      this.owner.contentView.addChildView(this.view);this.setBounds(this.bounds);
      this.view.webContents.on('did-start-loading',()=>{this.error='';});
      this.view.webContents.on('did-fail-load',(_e,code,description,_url,main)=>{if(main&&code!==-3)this.error=description;});
      this.view.webContents.setWindowOpenHandler(()=>({action:'deny'}));
      const check=(event:Electron.Event,url:string)=>{if(!/^https?:\/\//i.test(url))event.preventDefault();};
      this.view.webContents.on('will-navigate',check);this.view.webContents.on('will-redirect',check);
    }
    const wc=this.view.webContents;
    if(input.action==='open'){
      const url=new URL(input.url??'');if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('浏览器仅支持 HTTP/HTTPS 页面。');
      await wc.loadURL(url.href);return `${wc.getTitle()}\n${wc.getURL()}`;
    }
    if(!/^https?:/.test(wc.getURL()))throw new Error('请先打开网页。');
    if(input.action==='read')return wc.executeJavaScript('document.body.innerText.slice(0,20000)');
    if(typeof input.selector!=='string'||input.selector.length>500)throw new Error('请提供元素 selector。');
    const selector=JSON.stringify(input.selector);
    if(input.action==='click')return wc.executeJavaScript(`(()=>{const el=document.querySelector(${selector});if(!el)throw Error('找不到元素');if(el.type==='file')throw Error('文件上传尚未开放');el.click();return '已点击';})()`);
    if(input.action==='fill')return wc.executeJavaScript(`(()=>{const el=document.querySelector(${selector});if(!el||!['INPUT','TEXTAREA'].includes(el.tagName)||el.type==='file')throw Error('不支持此输入元素');if(el.type==='password')throw Error('密码必须由用户亲自输入：请让用户通过浏览器接管完成。');el.value=${JSON.stringify(String(input.text??''))};el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return '已填写';})()`);
    throw new Error('不支持的浏览器动作。');
  }
  // E12a-1：文字选择模式。pick 期间持有租约（Bot 不抢控）；点击/Esc/导航结束，结果经 onResult 回传主进程。
  private picking=false;
  isPicking(){return this.picking;}
  pageTitle(){const wc=this.view?.webContents;return wc&&!wc.isDestroyed()?wc.getTitle():'';}
  async startPick(onResult:(result:{cancel?:boolean;invalid?:boolean;text?:string})=>void){
    const wc=this.view?.webContents;
    if(!wc||wc.isDestroyed()||!/^https?:/.test(wc.getURL()))throw new Error('请先打开网页，再选择内容。');
    const started=await wc.executeJavaScript(PICK_SCRIPT,true);
    if(started==='already')throw new Error('已处于选择模式。');
    this.picking=true;this.lease.hold(300000);
    const finish=(result:{cancel?:boolean;invalid?:boolean;text?:string})=>{void this.stopPick();onResult(result);};
    wc.once('did-navigate',()=>{if(this.picking)finish({cancel:true,invalid:true});});
    const poll=setInterval(async()=>{
      if(!this.picking||!this.view||this.view.webContents.isDestroyed()){clearInterval(poll);return;}
      try{
        const result=await this.view.webContents.executeJavaScript(PICK_POLL,true) as {cancel?:boolean;text?:string}|null;
        if(result){clearInterval(poll);finish(result);}
        else this.lease.hold(300000);
      }catch{clearInterval(poll);finish({cancel:true});}
    },300);
  }
  // E12b-1：区域截取。悬停吸附 + 拖框纠正；结果为视口内 CSS 像素矩形，主进程用 capturePage 截取可见像素。
  private capturing=false;
  isCapturing(){return this.capturing;}
  async startCapture(onResult:(result:{cancel?:boolean;x?:number;y?:number;width?:number;height?:number})=>void){
    const wc=this.view?.webContents;
    if(!wc||wc.isDestroyed()||!/^https?:/.test(wc.getURL()))throw new Error('请先打开网页，再截取区域。');
    const started=await wc.executeJavaScript(CAPTURE_SCRIPT,true);
    if(started==='already')throw new Error('已处于截取模式。');
    this.capturing=true;this.lease.hold(300000);
    const finish=(result:{cancel?:boolean;x?:number;y?:number;width?:number;height?:number})=>{void this.stopCapture();onResult(result);};
    wc.once('did-navigate',()=>{if(this.capturing)finish({cancel:true});});
    const poll=setInterval(async()=>{
      if(!this.capturing||!this.view||this.view.webContents.isDestroyed()){clearInterval(poll);return;}
      try{
        const result=await this.view.webContents.executeJavaScript(CAPTURE_POLL,true) as {cancel?:boolean;x?:number;y?:number;width?:number;height?:number}|null;
        if(result){clearInterval(poll);finish(result);}
        else this.lease.hold(300000);
      }catch{clearInterval(poll);finish({cancel:true});}
    },300);
  }
  async captureRect(rect:{x:number;y:number;width:number;height:number}):Promise<string>{
    const wc=this.view?.webContents;
    if(!wc||wc.isDestroyed())throw new Error('网页已关闭。');
    const view=this.view!.getBounds();
    const width=Math.min(rect.width,view.width-rect.x),height=Math.min(rect.height,view.height-rect.y);
    if(width<4||height<4)throw new Error('截取区域超出页面可视范围，请重新截取。');
    const image=await wc.capturePage({x:Math.round(rect.x),y:Math.round(rect.y),width:Math.round(width),height:Math.round(height)});
    return image.toPNG().toString('base64');
  }
  async stopCapture(){
    if(!this.capturing)return;
    this.capturing=false;this.lease.release();
    const wc=this.view?.webContents;
    if(wc&&!wc.isDestroyed()){try{await wc.executeJavaScript('(()=>{if(window.__formabotCaptureCleanup)try{window.__formabotCaptureCleanup();}catch{}window.__formabotCaptureResult=null;window.__formabotCaptureActive=false;})()',true);}catch{}}
  }
  async stopPick(){
    if(!this.picking)return;
    this.picking=false;this.lease.release();
    const wc=this.view?.webContents;
    if(wc&&!wc.isDestroyed()){try{await wc.executeJavaScript('(()=>{if(window.__formabotPickCleanup)try{window.__formabotPickCleanup();}catch{}window.__formabotPickResult=null;window.__formabotPickActive=false;})()',true);}catch{}}
  }
  state():BrowserState{const wc=this.view?.webContents;if(!wc||wc.isDestroyed())return {url:'',loading:false,canGoBack:false,canGoForward:false,error:this.error,manual:this.lease.held(),picking:this.picking};return {url:wc.getURL(),loading:wc.isLoading(),canGoBack:wc.navigationHistory.canGoBack(),canGoForward:wc.navigationHistory.canGoForward(),error:this.error,manual:this.lease.held(),picking:this.picking};}
  async fieldType(selector:string):Promise<{tag:string;type:string}|null>{
    if(!this.view||this.view.webContents.isDestroyed())return null;
    const s=JSON.stringify(selector);
    try{return await this.view.webContents.executeJavaScript(`(()=>{const el=document.querySelector(${s});if(!el)return null;return {tag:el.tagName,type:el.type||''};})()`,true);}catch{return null;}
  }
  async secureFill(selector:string,value:string):Promise<string>{
    if(!this.view||this.view.webContents.isDestroyed())throw new Error('请先打开网页。');
    const s=JSON.stringify(selector),v=JSON.stringify(value);
    // 值由用户在安全输入框中亲自填写；只注入页面，不回传模型或对话。
    return await this.view.webContents.executeJavaScript(`(()=>{const el=document.querySelector(${s});if(!el||!['INPUT','TEXTAREA'].includes(el.tagName))throw Error('不支持此输入元素');el.value=${v};el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return '已由用户填入敏感值';})()`,true);
  }
  async control(input:{action:string;url?:string}){
    // 用户每一次手动操作都视为接管：Bot 在接管窗口内不得发起浏览器动作。
    this.lease.hold();
    if(input.action==='navigate'){
      const raw=(input.url??'').trim();if(!raw)throw Error('请输入网址。');
      const url=/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)?raw:`${/^(localhost|127\.0\.0\.1)(:|\/|$)/.test(raw)?'http':'https'}://${raw}`;
      await this.perform({action:'open',url},false);return;
    }
    const wc=this.view?.webContents;if(!wc||wc.isDestroyed())return;
    if(input.action==='back'&&wc.navigationHistory.canGoBack())wc.navigationHistory.goBack();
    if(input.action==='forward'&&wc.navigationHistory.canGoForward())wc.navigationHistory.goForward();
    if(input.action==='reload')wc.reload();if(input.action==='stop')wc.stop();
  }
  close(){if(this.view){if(!this.owner.isDestroyed())this.owner.contentView.removeChildView(this.view);if(!this.view.webContents.isDestroyed())this.view.webContents.close();this.view=undefined;}}
}

import type { FormaApi, Layout } from '../shared/contracts';
const el=(id:string)=>document.getElementById(id)!;
export class WorkbenchLayout {
  value:Layout={left:240,right:420,leftOpen:true,rightOpen:false};
  mode:'browser'|'artifact'='browser';
  private dragging=false;
  private initialized=false;
  constructor(private api:FormaApi){
    for(const side of ['left','right'] as const){
      el(`toggle-${side}`).onclick=()=>{this.value[`${side}Open`]=!this.value[`${side}Open`];this.apply();this.save();};
      el(`close-${side}`).onclick=()=>{this.value[`${side}Open`]=false;this.apply();this.save();};
      const separator=el(`resize-${side}`);
      separator.addEventListener('pointerdown',event=>{
        if(event.button!==0)return;event.preventDefault();separator.setPointerCapture(event.pointerId);this.dragging=true;el('workbench').classList.add('dragging');this.syncBrowser();
        const start=event.clientX,initial=this.value[side];
        const move=(ev:PointerEvent)=>{this.value[side]=Math.max(side==='left'?180:280,initial+(ev.clientX-start)*(side==='left'?1:-1));this.apply();};
        const finish=()=>{this.dragging=false;el('workbench').classList.remove('dragging');separator.removeEventListener('pointermove',move);separator.removeEventListener('pointerup',finish);separator.removeEventListener('pointercancel',finish);this.apply();this.save();};
        separator.addEventListener('pointermove',move);separator.addEventListener('pointerup',finish);separator.addEventListener('pointercancel',finish);
      });
      separator.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();this.value[side]+=(e.key==='ArrowRight'?20:-20)*(side==='left'?1:-1);this.apply();this.save();});
    }
    el('show-browser').onclick=()=>this.show('browser');el('show-artifact').onclick=()=>this.show('artifact');
    new ResizeObserver(()=>this.syncBrowser()).observe(el('browser-slot'));
    new ResizeObserver(()=>this.alignTitlebar()).observe(el('left'));
    new ResizeObserver(()=>this.alignTitlebar()).observe(el('center'));
    window.addEventListener('resize',()=>this.apply());
  }
  init(value:Layout){if(!this.initialized){this.value={...value};this.initialized=true;}this.apply();}
  show(mode:'browser'|'artifact'){this.mode=mode;this.value.rightOpen=true;this.apply();this.save();}
  apply(){
    const available=el('workbench').clientWidth||window.innerWidth;
    this.value.left=Math.min(500,Math.max(180,this.value.left));
    this.value.right=Math.min(1000,Math.max(280,this.value.right));
    let left=this.value.leftOpen?this.value.left:0,right=this.value.rightOpen?this.value.right:0;
    const maxSides=Math.max(0,available-312);
    if(left+right>maxSides){if(right)right=Math.max(280,maxSides-left);if(left+right>maxSides&&left)left=Math.max(180,maxSides-right);}
    for(const side of ['left','right'] as const){
      const open=this.value[`${side}Open`];el(side).classList.toggle('collapsed',!open);el(side).setAttribute('aria-hidden',String(!open));el(side).inert=!open;el(`resize-${side}`).hidden=!open;
      el(side).style.width=`${side==='left'?left:right}px`;
      el(`toggle-${side}`).setAttribute('aria-expanded',String(open));
      el(`resize-${side}`).setAttribute('aria-valuenow',String(Math.round(side==='left'?left:right)));
    }
    el('browser-pane').hidden=this.mode!=='browser';el('artifact-view').hidden=this.mode!=='artifact';
    el('toggle-left').hidden=this.value.leftOpen;el('toggle-right').hidden=this.value.rightOpen;
    // close-right 现驻常驻标题栏：必须随抽屉状态切换，否则与 toggle-right 同时出现（每侧任意时刻仅一个控件）。
    el('close-right').hidden=!this.value.rightOpen;
    el('show-browser').setAttribute('aria-pressed',String(this.mode==='browser'));el('show-artifact').setAttribute('aria-pressed',String(this.mode==='artifact'));
    this.alignTitlebar();
    this.syncBrowser();
  }
  private alignTitlebar(){
    const edge=el('center').getBoundingClientRect().left;
    // Keep the group identity over its workspace; reserve native window controls when collapsed.
    el('titlebar').style.paddingLeft=`${Math.max(88,edge)}px`;
  }
  syncBrowser(){
    const box=el('browser-slot').getBoundingClientRect();
    void this.api.browserBounds({x:box.x,y:box.y,width:box.width,height:box.height,visible:this.value.rightOpen&&this.mode==='browser'&&!this.dragging&&el('settings').hidden&&!document.querySelector('dialog[open]')&&!el('workbench').hidden}).catch(()=>{});
  }
  private save(){void this.api.saveLayout(this.value).catch(()=>{});}
}

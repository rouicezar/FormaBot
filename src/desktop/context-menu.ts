import {icon,type IconName} from './icons';
export interface MenuItem {label:string;icon:IconName;run:()=>void;danger?:boolean;separator?:boolean}
let activeClose:(()=>void)|undefined;
export function showContextMenu(x:number,y:number,items:MenuItem[],source:HTMLElement){
 activeClose?.();
 const menu=document.createElement('div');menu.id='conversation-menu';menu.role='menu';menu.setAttribute('aria-label','会话操作');
 const close=()=>{activeClose=undefined;menu.remove();document.removeEventListener('pointerdown',outside,true);window.removeEventListener('resize',close);};
 const outside=(event:PointerEvent)=>{if(!menu.contains(event.target as Node))close();};
 for(const item of items){
  if(item.separator){const line=document.createElement('div');line.role='separator';menu.append(line);}
  const button=document.createElement('button');button.type='button';button.role='menuitem';button.title=item.label;button.append(icon(item.icon,17),document.createTextNode(item.label));if(item.danger)button.classList.add('danger');
  button.onclick=()=>{close();item.run();};menu.append(button);
 }
 menu.onkeydown=event=>{const buttons=[...menu.querySelectorAll('button')],index=buttons.indexOf(document.activeElement as HTMLButtonElement);if(event.key==='Escape'){event.preventDefault();close();source.focus();}else if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();buttons[(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus();}else if(event.key==='Tab')close();};
 activeClose=close;document.body.append(menu);menu.style.left=`${Math.max(8,Math.min(x,innerWidth-menu.offsetWidth-8))}px`;menu.style.top=`${Math.max(8,Math.min(y,innerHeight-menu.offsetHeight-8))}px`;menu.querySelector('button')?.focus();document.addEventListener('pointerdown',outside,true);window.addEventListener('resize',close);
}

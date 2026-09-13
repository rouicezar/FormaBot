const paths:{[name:string]:readonly string[]}={
  wrench:['M14 6a5 5 0 0 0-6 6L3 17a2.8 2.8 0 0 0 4 4l5-5a5 5 0 0 0 6-6l-3 3-4-4 3-3Z'],
  pin:['m15 3 6 6-4 1-3 5-2-2-7 8m2-14 5-3 1-4m-8 7 9 9'],
  bell:['M6 8a6 6 0 0 1 12 0v6l2 3H4l2-3V8Zm4 12a2 2 0 0 0 4 0'],
  hide:['m3 3 18 18M10 5h2c6 0 10 7 10 7a20 20 0 0 1-4 4M6 6a20 20 0 0 0-4 6s4 7 10 7h2M9 9a4 4 0 0 0 6 6'],
  trash:['M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7'],

  bot:['M7 5h10a4 4 0 0 1 4 4v7a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a4 4 0 0 1 4-4Zm5 0V2M8 11v3m8-3v3'],
  group:['M9 14a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 7v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2m0-15a4 4 0 0 1 0 8m3 1a4 4 0 0 1 3 4v2'],
  constellation:['M12 3 4 8v8l8 5 8-5V8L12 3ZM4 8l8 5 8-5m-8 5v8M12 3v10'],
  orbit:['M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM3 12c0-4 18-4 18 0s-18 4-18 0Zm9-9c4 0 4 18 0 18s-4-18 0-18Z'],
  layers:['m12 3 10 5-10 5L2 8l10-5ZM2 12l10 5 10-5M2 16l10 5 10-5'],
  network:['M9 3h6v6H9zM2 15h6v6H2zM16 15h6v6h-6zM12 9v3M5 15v-3h14v3'],
  compass:['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4 6-2 6-6 2 2-6 6-2Z'],
  spark:['m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z'],
  pen:['m16 3 5 5-12 12-6 1 1-6L16 3ZM13 6l5 5M4 15l5 5'],
  chart:['M4 3v18h17M8 17v-5m5 5V7m5 10V4'],
  bulb:['M8 17c0-3-3-4-3-8a7 7 0 0 1 14 0c0 4-3 5-3 8H8Zm0 3h8m-6 3h4M12 17v-6m-3-2 3 2 3-2'],
  shield:['m12 2 8 3v6c0 5-8 11-8 11S4 16 4 11V5l8-3Zm-4 9 3 3 5-6'],
  user:['M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21v-2a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v2'],
  panelLeft:['M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM9 4v16'],panelRight:['M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM15 4v16'],
  left:['m14 6-6 6 6 6'],right:['m10 6 6 6-6 6'],chevronDown:['m6 9 6 6 6-6'],
  settings:['M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z','M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'],
  edit:['m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0 0-3l-1-1a2 2 0 0 0-3 0L5 15l-1 5Z'],
  plus:['M12 5v14M5 12h14'],chatPlus:['M12 3c5 0 9 3.4 9 7.8 0 4.5-4 7.9-9 7.9-1 0-2-.1-2.9-.4L4.6 20.7l1-3.2C3.9 16 3 13.6 3 10.8 3 6.4 7 3 12 3Z','M12 7.5v6M9 10.5h6'],search:['M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5-2 6 6'],
  folder:['M3 8V6a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Z'],browser:['M3 4h18v16H3V4Zm0 5h18M7 6.5h.01m3 0h.01'],
  artifact:['M13 3H7a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V10a3 3 0 0 0-.88-2.12l-4-4A3 3 0 0 0 13 3Z','M13 3v4a3 3 0 0 0 3 3h4'],
  file:['M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 12h8m-8 4h6'],
  code:['m8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 16'],
  copy:['M8 8h13v13H8V8ZM16 8V3H3v13h5'],
  back:['M20 12H4m6-6-6 6 6 6'],forward:['M4 12h16m-6-6 6 6-6 6'],
  refresh:['M20 10a8 8 0 1 0-1 7M20 4v6h-6'],close:['m6 6 12 12M6 18 18 6'],
  send:['M12 19V5m-6 6 6-6 6 6'],stop:['M6 6h12v12H6z'],
  at:['M16 8v7a2 2 0 0 0 4 0v-3a8 8 0 1 0-4 7M16 12a4 4 0 1 0-8 0 4 4 0 0 0 8 0'],
  check:['m5 13 4 4L19 7'],
  clock:['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13.5V12l3 2'],
  terminal:['m5 7 5 5-5 5M12 17h7'],
  globe:['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3 12h18M12 3c2.8 2.3 4 5.2 4 9s-1.2 6.7-4 9c-2.8-2.3-4-5.2-4-9s1.2-6.7 4-9Z'],
  spinner:['M21 12a9 9 0 1 1-9-9'],
} as const;
export type IconName=Exclude<keyof typeof paths,number>;
export function icon(name:IconName,size=18){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  for(const [attribute,value] of Object.entries({viewBox:'0 0 24 24',width:String(size),height:String(size),fill:'none',stroke:'currentColor','stroke-width':'1.5','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'}))svg.setAttribute(attribute,value);
  for(const d of paths[name]){const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',d);svg.append(path);}
  return svg;
}
export function decorateButton(id:string,name:IconName,label:string,iconOnly=false){
  const button=document.getElementById(id)!;button.replaceChildren(icon(name));button.setAttribute('aria-label',label);button.title=label;button.classList.toggle('icon-button',iconOnly);
  if(!iconOnly){const span=document.createElement('span');span.textContent=label;button.append(span);}
}

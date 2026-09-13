import type {Conversation} from '../shared/contracts';

// Names are presentation only. Rendering a reference must never dispatch work.
export function memberReferences(text:string,members:Conversation[]){
 const unique=members.filter(c=>c.kind==='bot'&&members.filter(other=>other.kind==='bot'&&other.name===c.name).length===1).sort((a,b)=>b.name.length-a.name.length);
 if(!unique.length)return [];
 const escape=(name:string)=>name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const pattern=new RegExp(`(?<![\\w/.-])[@＠]?(${unique.map(c=>escape(c.name)).join('|')})(?![\\w/.-])`,'gu');
 return [...text.matchAll(pattern)].map(match=>({start:match.index,end:match.index+match[0].length,member:unique.find(c=>c.name===match[1])!}));
}

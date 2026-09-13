import type {Conversation} from '../shared/contracts';
export function participants(group:Conversation,all:Conversation[]){return all.filter(c=>c.kind==='bot'&&(group.kind==='bot'?c.id===group.id:group.members.includes(c.id)||group.managerId===c.id));}
export function mentionsEveryone(text:string){return /[@＠](所有人|全体|全员|大家|all)(?=$|[\s\p{P}])/iu.test(text);}
export function mentioned(text:string,group:Conversation,all:Conversation[]):string[]{
 const members=participants(group,all);
 if(mentionsEveryone(text))return members.filter(c=>group.members.includes(c.id)).map(c=>c.id);
 const names=[...new Set(members.map(c=>c.name))].sort((a,b)=>b.length-a.length);
 if(!names.length)return [];
 const pattern=new RegExp(`[@＠](${names.map(name=>name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')})(?=$|[\\s\\p{P}])`,'gu');
 const matched=new Set([...text.matchAll(pattern)].map(match=>match[1]));
 return members.filter(c=>matched.has(c.name)).map(c=>c.id);
}

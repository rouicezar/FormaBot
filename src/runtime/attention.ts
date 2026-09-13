import type {Conversation} from '../shared/contracts';
import {mentioned,participants,mentionsEveryone} from './group-routing';

// E04d 语义注意力的确定性骨架：字面提及/广播由宿主精确解析，
// 语义层面的"谁相关"由模型在执行时通过 group_message/assign_tasks/silent 自主判断。
export interface Attention {ids:string[];mode:'explicit'|'broadcast'|'manager'}
export function resolveAttention(text:string,group:Conversation,all:Conversation[],selectedId?:string):Attention{
  if(group.kind!=='group')return {ids:[group.id],mode:'explicit'};
  const broadcast=mentionsEveryone(text);
  if(broadcast){
    // 广播必须不漏人：普通成员与协调人都纳入。
    const members=participants(group,all).map(c=>c.id);
    return {ids:[...new Set(members)],mode:'broadcast'};
  }
  const explicit=mentioned(text,group,all);
  if(explicit.length)return {ids:explicit,mode:'explicit'};
  return {ids:[selectedId&&group.members.includes(selectedId)?selectedId:group.managerId||group.members[0]||group.id],mode:'manager'};
}

import {test,expect} from 'vitest';
import {resolveAttention} from '../src/runtime/attention';
import type {Conversation} from '../src/shared/contracts';

const bots:Conversation[]=[
  {id:'mgr',name:'总监',role:'管理',kind:'bot',members:[]},
  {id:'w1',name:'编辑',role:'写作',kind:'bot',members:[]},
  {id:'w2',name:'研究员',role:'研究',kind:'bot',members:[]},
];
const group:Conversation={id:'g',name:'团队',role:'协作',kind:'group',members:['w1','w2'],managerId:'mgr'};

test('broadcast reaches every participant including the manager (不漏人)',()=>{
  const a=resolveAttention('@所有人 请确认',group,bots);
  expect(a.mode).toBe('broadcast');
  expect(a.ids.sort()).toEqual(['mgr','w1','w2'].sort());
  expect(a.ids).toHaveLength(3);
  const zh=resolveAttention('@全员 请确认',group,bots);
  expect(zh.mode).toBe('broadcast');expect(zh.ids).toHaveLength(3);
});

test('explicit mentions dispatch exactly the named members',()=>{
  const a=resolveAttention('@编辑 请交付',group,bots);
  expect(a.mode).toBe('explicit');
  expect(a.ids).toEqual(['w1']);
});

test('unaddressed messages route to the manager, honoring an explicit selection when present',()=>{
  expect(resolveAttention('大家好',group,bots)).toEqual({ids:['mgr'],mode:'manager'});
  expect(resolveAttention('大家好',group,bots,'w2')).toEqual({ids:['w2'],mode:'manager'});
});

test('private conversations always dispatch the bot itself',()=>{
  expect(resolveAttention('hi',bots[0]!,bots)).toEqual({ids:['mgr'],mode:'explicit'});
});

test('mention punctuation supports full-width input without matching a shorter member name',()=>{
  const compound={id:'w3',name:'编辑.校对',role:'校对',kind:'bot' as const,members:[]};
  expect(resolveAttention('＠编辑.校对？请回复',{...group,members:[...group.members,'w3']},[...bots,compound]).ids).toEqual(['w3']);
  expect(resolveAttention('＠全员；请回复',group,bots).ids).toHaveLength(3);
});

import {test,expect} from 'vitest';
import {memberReferences} from '../src/desktop/member-references';
import type {Conversation} from '../src/shared/contracts';
const bot=(id:string,name:string):Conversation=>({id,name,kind:'bot',role:'职责',members:[]});
test('public workflow names resolve to exact Bots with or without mention punctuation',()=>{
 const members=[bot('a','公众号文章审查员'),bot('b','公众号文章排版员')];
 const text='交给公众号文章审查员审核，之后由 @公众号文章排版员 排版。';
 expect(memberReferences(text,members).map(m=>[m.member.id,text.slice(m.start,m.end)])).toEqual([['a','公众号文章审查员'],['b','@公众号文章排版员']]);
 expect(memberReferences('m2→M3',members)).toEqual([]);
});
test('ambiguous names and longer paths or identifiers are not converted',()=>{
 expect(memberReferences('同名',[bot('a','同名'),bot('b','同名')])).toEqual([]);
 expect(memberReferences('AgentX /Agent/file Agent.md',[bot('a','Agent')])).toEqual([]);
 expect(memberReferences('编辑.校对',[bot('a','编辑'),bot('b','编辑.校对')]).map(m=>m.member.id)).toEqual(['b']);
});

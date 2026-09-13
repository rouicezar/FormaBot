import {it,expect} from 'vitest';
import {dispatchTool, type TaskLaunch} from '../src/runtime/task-host';

const options:TaskLaunch={node:'node',root:'.',home:'.',workspace:'/ws',provider:'x',model:'m',key:'k',prompt:'p',protectedPaths:[],readOnly:true};

it('summary (readOnly) jobs reject write/edit but allow read-style tools through to their handlers',async()=>{
  const deps={signal:new AbortController().signal,authorized:()=>true,
    browser:async()=>{throw new Error('browser');},onEvent:()=>{},onArtifact:()=>{},
    teamTool:(tool:string)=>`team:${tool}`};
  await expect(dispatchTool(options,'write',{path:'a.md',content:'x'},deps)).rejects.toThrow(/汇总阶段不能代成员产出/);
  await expect(dispatchTool(options,'edit',{path:'a.md',oldText:'a',newText:'b'},deps)).rejects.toThrow(/汇总阶段不能代成员产出/);
  await expect(dispatchTool(options,'task_result',{status:'completed',summary:'s'},deps)).resolves.toBe('team:task_result');
  await expect(dispatchTool(options,'unknown_tool',{},deps)).rejects.toThrow(/未知工具/);
  const aborted={signal:AbortSignal.abort('x'),authorized:()=>true,browser:async()=>'' as unknown as string,onEvent:()=>{},onArtifact:()=>{},teamTool:()=>'x'};
  await expect(dispatchTool(options,'read',{path:'a.md'},aborted)).rejects.toThrow(/已停止/);
});

it('normal jobs still allow write and reach the file layer',async()=>{
  const deps={signal:new AbortController().signal,authorized:()=>true,
    browser:async()=>{throw new Error('browser');},onEvent:()=>{},onArtifact:()=>{},
    teamTool:()=>'team'};
  await expect(dispatchTool({...options,readOnly:false},'write',{path:'a.md',content:'x'},deps)).rejects.not.toThrow(/汇总阶段/);
});

it('Skill tools reach the host only with an active authorized task',async()=>{
 let called=0;const deps={signal:new AbortController().signal,authorized:()=>true,browser:async()=>'',onEvent:()=>{},onArtifact:()=>{},teamTool:()=>{called++;return 'skill metadata';}};
 for(const tool of ['list_skills','read_skill']){
  await expect(dispatchTool(options,tool,{}, {...deps,authorized:()=>false})).rejects.toThrow('未授权');
  await expect(dispatchTool(options,tool,{}, {...deps,signal:AbortSignal.abort()})).rejects.toThrow('已停止');
 }
 expect(called).toBe(0);
 for(const tool of ['list_skills','read_skill'])await expect(dispatchTool(options,tool,{},deps)).resolves.toBe('skill metadata');
 expect(called).toBe(2);
});

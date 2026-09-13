import {test,expect} from 'vitest';
import {mkdtempSync,rmSync,mkdirSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {WorkbenchStore} from '../src/state/workbench';import {SettingsStore} from '../src/state/settings';import {TaskStore} from '../src/state/tasks';
test('conversation overrides are independent, group wins for group jobs, and workspace bindings reject reconfiguration and survive restart',()=>{
 const dir=mkdtempSync(join(tmpdir(),'scoped-space-')),db=join(dir,'db');let s=new WorkbenchStore(db);
 try{const bot=s.create('/catalog',{name:'开发',kind:'bot',role:'开发',members:[]},'user_create','/bot');const group=s.create('/catalog',{name:'协作',kind:'group',role:'协作',members:[bot]},'user_create','/group');
 expect(s.executionWorkspace('/catalog',bot,'/default').path).toBe('/bot');expect(s.executionWorkspace('/catalog',group,'/default').path).toBe('/group');
 s.queueJob('j','root',group,bot,'任务');s.pinJobWorkspace('/catalog','j','/group');expect(()=>s.update('/catalog',group,'协作','协作',undefined,undefined,'/next')).toThrow(/固定/);expect(s.jobWorkspace('/catalog','j')).toBe('/group');expect(()=>s.pinJobWorkspace('/catalog','j','/next')).toThrow(/固定/);
 expect(()=>s.update('/catalog',bot,'开发','开发',undefined,undefined,null)).toThrow(/固定/);expect(s.executionWorkspace('/catalog',bot,'/new-default').path).toBe('/bot');s.setPref('default-execution:/catalog','/new-default');const next=s.create('/catalog',{name:'新项目',kind:'bot',role:'开发',members:[]});expect(s.executionWorkspace('/catalog',next).path).toBe('/new-default');expect(()=>s.executionWorkspace('/foreign',bot)).toThrow(/不属于/);
 s.close();s=new WorkbenchStore(db);expect(s.executionWorkspace('/catalog',group).path).toBe('/group');expect(s.jobWorkspace('/catalog','j')).toBe('/group');expect(s.list('/catalog')).toHaveLength(3);
 }finally{s.close();rmSync(dir,{recursive:true,force:true});}
});
test('changing default workspace preserves catalog identity and model settings',()=>{
 const dir=mkdtempSync(join(tmpdir(),'default-space-'));try{const box={available:()=>true,encrypt:(v:string)=>Buffer.from(v),decrypt:(v:Buffer)=>v.toString()};const s=new SettingsStore(dir,box);s.saveModel({provider:'deepseek',model:'test-model',apiKey:'fixture-not-a-real-key'});s.chooseWorkspace('/first');s.chooseWorkspace('/second');expect(s.view().catalog).toBe('/first');expect(s.view().workspace?.path).toBe('/second');expect(s.view().model?.hasKey).toBe(true);const again=new SettingsStore(dir,box);expect(again.view().catalog).toBe('/first');s.forgetWorkspace();s.chooseWorkspace('/third');expect(s.view().catalog).toBe('/first');}finally{rmSync(dir,{recursive:true,force:true});}
});
test('folder grants do not authorize sibling roots and revocation preserves unrelated grant',()=>{
 const dir=mkdtempSync(join(tmpdir(),'scope-grants-')),a=join(dir,'a'),b=join(dir,'b');mkdirSync(a);mkdirSync(b);const s=new TaskStore(join(dir,'db'));try{s.authorize(a);expect(s.authorized(a)).toBe(true);expect(s.authorized(b)).toBe(false);s.authorize(b);s.revoke(a);expect(s.authorized(a)).toBe(false);expect(s.authorized(b)).toBe(true);}finally{s.close();rmSync(dir,{recursive:true,force:true});}
});
test('new project copies model configuration without copying messages or memories',()=>{
 const dir=mkdtempSync(join(tmpdir(),'scope-copy-')),s=new WorkbenchStore(join(dir,'db'));try{const original=s.create('/catalog',{name:'A',kind:'bot',role:'审查代码',members:[]},'user_create','/a');s.setMemberModel('/catalog',original,{provider:'deepseek',model:'deepseek-v4-flash'});s.add(original,'你','PROJECT_A_PRIVATE');const next=s.create('/catalog',{name:'B',kind:'bot',role:'审查代码',members:[]},'duplicate','/b',original);expect(s.memberModel('/catalog',next)).toEqual(s.memberModel('/catalog',original));expect(s.messages(next)).toEqual([]);expect(s.messages(original)[0].content).toBe('PROJECT_A_PRIVATE');expect(s.memories(next,next)).toEqual([]);expect(s.executionWorkspace('/catalog',original).path).toBe('/a');expect(s.executionWorkspace('/catalog',next).path).toBe('/b');}finally{s.close();rmSync(dir,{recursive:true,force:true});}
});

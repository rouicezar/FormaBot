import {test,expect} from 'vitest';
import {mkdtemp,mkdir,writeFile,rm,symlink,link,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {localTool} from '../tools/local';
import {SkillLibrary,type EnabledSkill} from './skills';
async function fixture(){const home=await mkdtemp(join(process.cwd(),'.tmp/skills-'));const source=join(home,'.agents/skills/example');await mkdir(join(source,'references'),{recursive:true});await writeFile(join(source,'SKILL.md'),'---\nname: example\ndescription: Example method\n---\nRead references/check.md');await writeFile(join(source,'references/check.md'),'fixed instructions');let saved:EnabledSkill[]=[];let idle=true;const prefs={get:()=>saved,set:(v:EnabledSkill[])=>{saved=v;}};const directory=join(home,'library');const library=new SkillLibrary(home,directory,prefs,()=>idle);const id=(await library.inventory()).items[0].id;return {home,source,directory,library,id,prefs,busy:()=>{idle=false;}};}
test('enable, on-demand reference, restart, frozen version and disable',async()=>{const f=await fixture();try{
 await expect(f.library.read({id:f.id})).rejects.toThrow('尚未启用');await f.library.setEnabled({id:f.id,enabled:true});expect(f.library.list()[0].description).toBe('Example method');const value=JSON.parse(await f.library.read({id:f.id}));expect(value.files).toContain('references/check.md');expect(value.content).not.toContain('fixed instructions');await writeFile(join(f.source,'references/check.md'),'changed');expect(JSON.parse(await new SkillLibrary(f.home,f.directory,f.prefs).read({id:f.id,path:'references/check.md'})).content).toBe('fixed instructions');await expect(f.library.read({id:f.id,path:'../secret'})).rejects.toThrow('相对');await f.library.setEnabled({id:f.id,enabled:false});await expect(f.library.read({id:f.id})).rejects.toThrow('停用');await f.library.setEnabled({id:f.id,enabled:true});expect(JSON.parse(await f.library.read({id:f.id,path:'references/check.md'})).content).toBe('changed');
 }finally{await rm(f.home,{recursive:true,force:true});}});
test('links, hidden secrets, oversized and binary files are not copied; tampering rejected',async()=>{const f=await fixture();try{
 const secret=join(f.home,'secret.txt');await writeFile(secret,'PRIVATE');await symlink(secret,join(f.source,'link.md'));await link(secret,join(f.source,'hard.md'));await writeFile(join(f.source,'.env'),'KEY');await writeFile(join(f.source,'large.txt'),'x'.repeat(262145));await writeFile(join(f.source,'binary.txt'),Buffer.from([0,255]));await f.library.setEnabled({id:f.id,enabled:true});const value=JSON.parse(await f.library.read({id:f.id}));expect(value.skipped).toBe(5);expect(value.files).toEqual(['SKILL.md','references/check.md']);const file=join(f.directory,`${f.library.list()[0].version}.json`);expect(await readFile(file,'utf8')).not.toContain('PRIVATE');await writeFile(file,'{}');await expect(f.library.read({id:f.id})).rejects.toThrow('校验失败');
 }finally{await rm(f.home,{recursive:true,force:true});}});
test('unsupported IDs and active-task changes are rejected',async()=>{const f=await fixture();try{
 await expect(f.library.setEnabled({id:'../x',enabled:true})).rejects.toThrow('无效');await expect(f.library.setEnabled({id:'a'.repeat(64),enabled:true})).rejects.toThrow('没有找到');f.busy();await expect(f.library.setEnabled({id:f.id,enabled:true})).rejects.toThrow('任务结束');expect(f.library.list()).toEqual([]);
 }finally{await rm(f.home,{recursive:true,force:true});}});

test('Skill text does not grant script access to the installed directory',async()=>{const f=await fixture();try{
 const workspace=join(f.home,'workspace');await mkdir(workspace);await f.library.setEnabled({id:f.id,enabled:true});await f.library.read({id:f.id});
 await expect(localTool(workspace,process.execPath,resolve('dist/runtime/file-worker.mjs'),'bash',{command:`cat '${f.source}/SKILL.md'`},[],new AbortController().signal)).rejects.toThrow('工具执行失败');
 expect(await localTool(workspace,process.execPath,resolve('dist/runtime/file-worker.mjs'),'bash',{command:'printf ok > proof.txt; cat proof.txt'},[],new AbortController().signal)).toBe('ok');
 }finally{await rm(f.home,{recursive:true,force:true});}});

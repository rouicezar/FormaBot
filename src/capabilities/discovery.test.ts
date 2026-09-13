import {test,expect} from 'vitest';
import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {discoverTools} from './discovery';
test('discovers metadata without exposing secrets, following child links or executing skills',async()=>{
 const home=await mkdtemp(join(process.cwd(),'.tmp/discovery-'));
 try{await mkdir(join(home,'.agents/skills/example'),{recursive:true});await writeFile(join(home,'.agents/skills/example/SKILL.md'),'SECRET_SKILL_BODY');await mkdir(join(home,'.cursor'),{recursive:true});await writeFile(join(home,'.cursor/mcp.json'),JSON.stringify({mcpServers:{sample:{env:{KEY:'SECRET_KEY'},command:'do-not-execute'}}}));await symlink('/etc',join(home,'.agents/skills/outside'));
 const result=await discoverTools(home);expect(result.items.map(x=>x.name)).toEqual(['example','sample']);expect(JSON.stringify(result)).not.toContain('SECRET');expect(JSON.stringify(result)).not.toContain('do-not-execute');expect(result.sources.some(x=>x.status==='missing')).toBe(true);
 await writeFile(join(home,'.cursor/mcp.json'),'{bad');expect((await discoverTools(home)).sources.find(x=>x.path.endsWith('mcp.json'))?.status).toBe('unavailable');
 }finally{await rm(home,{recursive:true,force:true});}
});

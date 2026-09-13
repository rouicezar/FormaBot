import { readdir, readFile, stat, realpath } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
export interface DiscoveredTool { id:string; kind:'skill'|'mcp'|'extension'; name:string; source:string; status:'discovered'|'enabled'; description?:string; version?:string; skipped?:number; }
export interface ToolInventory { items:DiscoveredTool[]; sources:{path:string;status:'scanned'|'missing'|'unavailable'|'limited'}[]; }
// Discovery is metadata-only. Never launch commands or return configuration secrets.
export async function discoverTools(home:string):Promise<ToolInventory>{
 const result:ToolInventory={items:[],sources:[]};const seen=new Set<string>();
 const add=(kind:DiscoveredTool['kind'],name:string,source:string)=>{const id=createHash('sha256').update(`${kind}:${source}:${name}`).digest('hex');if(!seen.has(id)){seen.add(id);result.items.push({id,kind,name:name.slice(0,160),source,status:'discovered'});}};
 const directories=[['.agents/skills','skill'],['.codex/skills','skill'],['.claude/skills','skill'],['.codex/plugins/cache','extension'],['.claude/plugins/cache','extension']] as const;
 for(const [suffix,kind] of directories){const path=join(home,suffix);let status:ToolInventory['sources'][number]['status']='scanned';let count=0;
  try{const root=await realpath(path);
   const walk=async(dir:string,depth:number):Promise<void>=>{if(++count>2000){status='limited';return;}const entries=await readdir(dir,{withFileTypes:true});
    if(kind==='skill'&&entries.some(e=>e.name==='SKILL.md'&&e.isFile())){add(kind,relative(root,dir)||suffix,dir);return;}
    if(kind==='extension'&&entries.some(e=>e.name==='.claude-plugin'||e.name==='.codex-plugin')){add(kind,relative(root,dir),dir);return;}
    if(depth===0)return;
    for(const entry of entries){if(count>2000){status='limited';break;}if(entry.isDirectory()&&!['node_modules','.git'].includes(entry.name))await walk(join(dir,entry.name),depth-1);}
   };await walk(root,kind==='skill'?2:4);
  }catch(e){status=(e as NodeJS.ErrnoException).code==='ENOENT'?'missing':'unavailable';}
  result.sources.push({path,status});
 }
 for(const suffix of ['.claude.json','Library/Application Support/Claude/claude_desktop_config.json','.cursor/mcp.json']){const path=join(home,suffix);let status:ToolInventory['sources'][number]['status']='scanned';try{if((await stat(path)).size>1024*1024){status='limited';}else{const config=JSON.parse(await readFile(path,'utf8'));const servers=config.mcpServers;if(servers&&typeof servers==='object'&&!Array.isArray(servers))for(const name of Object.keys(servers).slice(0,500))add('mcp',name,path);}}catch(e){status=(e as NodeJS.ErrnoException).code==='ENOENT'?'missing':'unavailable';}result.sources.push({path,status});}
 return result;
}

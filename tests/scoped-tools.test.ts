import {test,expect} from 'vitest';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {localTool} from '../src/tools/local';
test('actual scoped bash writes stay in the selected project and cannot read or overwrite its sibling',async()=>{
 const dir=mkdtempSync(resolve('.tmp/scoped-tools-')),a=join(dir,'a'),b=join(dir,'b');mkdirSync(a);mkdirSync(b);writeFileSync(join(a,'proof.txt'),'A');writeFileSync(join(b,'proof.txt'),'B');
 const call=(root:string,command:string)=>localTool(root,resolve('.local/runtime/node'),resolve('dist/runtime/file-worker.mjs'),'bash',{command},[],new AbortController().signal);
 try{await call(b,'printf B_UPDATED > proof.txt');expect(readFileSync(join(b,'proof.txt'),'utf8')).toBe('B_UPDATED');expect(readFileSync(join(a,'proof.txt'),'utf8')).toBe('A');await expect(call(b,'cat ../a/proof.txt')).rejects.toThrow();await expect(call(b,'printf BAD > ../a/proof.txt')).rejects.toThrow();expect(readFileSync(join(a,'proof.txt'),'utf8')).toBe('A');await call(a,'printf A_UPDATED > proof.txt');expect(readFileSync(join(b,'proof.txt'),'utf8')).toBe('B_UPDATED');}finally{rmSync(dir,{recursive:true,force:true});}
});

test('delivery verification accepts scripts independently of preview support',async()=>{
 const dir=mkdtempSync(resolve('.tmp/delivery-check-'));writeFileSync(join(dir,'check.pl'),'print "ok";');
 const call=(tool:string,path:string)=>localTool(dir,resolve('.local/runtime/node'),resolve('dist/runtime/file-worker.mjs'),tool,{path},[],new AbortController().signal);
 try{
  expect(JSON.parse(await call('delivery_check','check.pl')).path).toBe(join(dir,'check.pl'));
  await expect(call('preview','check.pl')).rejects.toThrow('预览');
  await expect(call('delivery_check','missing.pl')).rejects.toThrow();
  await expect(call('delivery_check','../outside.pl')).rejects.toThrow();
 }finally{rmSync(dir,{recursive:true,force:true});}
});

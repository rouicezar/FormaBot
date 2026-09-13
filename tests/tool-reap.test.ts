import {it,expect} from 'vitest';
import {mkdtempSync,mkdirSync,rmSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {localTool} from '../src/tools/local';

it('reaps same-group background children when the bash tool returns',async()=>{
  const dir=mkdtempSync(resolve('.tmp/tool-reap-'));const workspace=join(dir,'workspace');mkdirSync(workspace);
  try{
    const node=resolve('.local/runtime/node'),worker=resolve('dist/runtime/file-worker.mjs');
    await localTool(workspace,node,worker,'bash',{command:'(sleep 1; printf LATE > late.txt) </dev/null >/dev/null 2>&1 & echo ok'},[],new AbortController().signal);
    await new Promise(r=>setTimeout(r,1600));
    expect(existsSync(join(workspace,'late.txt'))).toBe(false);
  }finally{rmSync(dir,{recursive:true,force:true});}
},15000);

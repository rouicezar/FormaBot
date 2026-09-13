import { build } from 'esbuild';
import { mkdtempSync,mkdirSync,writeFileSync,readFileSync,symlinkSync,rmSync } from 'node:fs';
import { resolve,join } from 'node:path';
import assert from 'node:assert/strict';
await build({entryPoints:['src/tools/local.ts'],outfile:'.tmp/local-tools.mjs',bundle:true,platform:'node',format:'esm'});
const {localTool}=await import('../.tmp/local-tools.mjs');
const dir=mkdtempSync(resolve('.tmp/tool-boundary-'));const workspace=join(dir,'workspace');mkdirSync(workspace);
const outside=join(dir,'private.txt');writeFileSync(outside,'outside-sentinel');symlinkSync(outside,join(workspace,'escape.txt'));
const node=resolve('.local/runtime/node'),worker=resolve('dist/runtime/file-worker.mjs');
const invoke=(tool,input)=>localTool(workspace,node,worker,tool,input,[],new AbortController().signal);
try {
  await invoke('write',{path:'outputs/report.md',content:'first'});
  assert.equal(await invoke('read',{path:'outputs/report.md'}),'first');
  await invoke('edit',{path:'outputs/report.md',oldText:'first',newText:'second'});
  assert.equal(await invoke('bash',{command:'cat outputs/report.md'}),'second');
  const preview=JSON.parse(await invoke('preview',{path:'outputs/report.md'}));assert.equal(preview.kind,'text');assert.equal(preview.content,'second');
  await invoke('write',{path:'outputs/page.html',content:'<script>window.evil=true</script>'});assert.equal(JSON.parse(await invoke('preview',{path:'outputs/page.html'})).kind,'text');
  writeFileSync(join(workspace,'outputs/pixel.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5QAAAABJRU5ErkJggg==','base64'));
  assert.ok(JSON.parse(await invoke('preview',{path:'outputs/pixel.png'})).content.startsWith('data:image/png;base64,'));
  for(const tool of ['read','write','preview'])await assert.rejects(invoke(tool,{path:'escape.txt',content:'bad'}));
  await assert.rejects(invoke('bash',{command:`cat ${JSON.stringify(outside)}`}));
  await assert.rejects(invoke('bash',{command:`printf bad > ${JSON.stringify(outside)}`}));
  assert.equal(readFileSync(outside,'utf8'),'outside-sentinel');
  const env=await invoke('bash',{command:'env'});assert.equal(env.includes('FORMABOT_MODEL_KEY'),false);
  console.log('PASS: real read/write/edit/bash, safe text/image preview, outside read/write and symlink denial, clean command environment. No model used.');
}finally{rmSync(dir,{recursive:true,force:true});}

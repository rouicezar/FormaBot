// Real Electron browser/tool tests against a loopback-only site; no model or real account.
import {_electron as electron} from 'playwright-core';
import {build} from 'esbuild';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createServer} from 'node:http';
const dir=mkdtempSync(resolve('.tmp/browser-audit-'));
const bundle=join(dir,'browser.cjs'),entry=join(dir,'main.cjs');
await build({entryPoints:['src/tools/browser.ts'],outfile:bundle,bundle:true,platform:'node',format:'cjs',external:['electron']});
writeFileSync(entry,`const {app,BrowserWindow}=require('electron');
app.setPath('userData',${JSON.stringify(join(dir,'user-data'))});
app.whenReady().then(async()=>{const win=new BrowserWindow({show:false});await win.loadURL('about:blank');globalThis.auditBrowser=new (require(${JSON.stringify(bundle)}).TaskBrowser)('audit-workspace',win,()=>{});});`);
const requests=[];
const site=createServer((req,res)=>{
  requests.push({url:req.url,method:req.method,cookie:req.headers.cookie??''});
  res.setHeader('Content-Type','text/html');
  if(req.url==='/login'){res.setHeader('Set-Cookie','audit_identity=ACCOUNT_A; Path=/');res.end('<h1>构造账号 A</h1>');}
  else if(req.url==='/form')res.end('<form method="POST" action="/submitted"><button id="publish">测试提交</button></form>');
  else if(req.url==='/delayed')res.end('<script>setTimeout(()=>fetch("/late-side-effect",{method:"POST"}),700)</script><h1>定时构造操作</h1>');
  else res.end('<h1>仅本地测试站点</h1>');
});
await new Promise(r=>site.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${site.address().port}`;
let app;const results=[];
const record=(id,observed)=>{results.push({id,observed});console.log(JSON.stringify({id,observed}));};
try{
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({args:[entry],env,timeout:30000});await app.firstWindow();
  const call=input=>app.evaluate(async(_electron,input)=>globalThis.auditBrowser.call(input,new AbortController().signal),input);
  await call({action:'open',url:base+'/login'});
  await app.evaluate(()=>globalThis.auditBrowser.close());
  await call({action:'open',url:base+'/form'});
  record('E09-browser-identity',{sameWorkspaceAfterCloseCookie:requests.find(r=>r.url==='/form')?.cookie});
  await call({action:'click',selector:'#publish'});
  await new Promise(r=>setTimeout(r,400));
  record('E10-browser-side-effect',{postWithoutActionGrant:requests.some(r=>r.url==='/submitted'&&r.method==='POST')});
  await app.evaluate(async(_electron,url)=>{
    const abort=new AbortController();await globalThis.auditBrowser.call({action:'open',url},abort.signal);abort.abort();
  },base+'/delayed');
  await new Promise(r=>setTimeout(r,1100));
  record('E11-browser-after-tool-abort',{pagePostedAfterAbort:requests.some(r=>r.url==='/late-side-effect'&&r.method==='POST')});
}finally{
  await app?.close();await new Promise(r=>site.close(r));
  writeFileSync(join(dir,'results.json'),JSON.stringify(results,null,2));console.log(`Evidence: ${dir}`);
}

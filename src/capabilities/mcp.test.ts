import {describe,it,expect} from 'vitest';
import {createServer} from 'node:http';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {McpConnection,registrationFailure} from './mcp';
const box={available:()=>true,encrypt:(s:string)=>Buffer.from(s),decrypt:(b:Buffer)=>b.toString()};
async function waitFor(check:()=>boolean){for(let i=0;i<200;i++){if(check())return;await new Promise(r=>setTimeout(r,10));}throw Error('timed out');}
async function fixture(){
 let base='',tokenCalls=0,registrationName='';
 const server=createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json');const chunks=[];for await(const c of req)chunks.push(c);const raw=Buffer.concat(chunks).toString();
  if(req.url?.includes('oauth-protected-resource')){res.end(JSON.stringify({resource:base+'/mcp',authorization_servers:[base]}));return;}
  if(req.url?.includes('oauth-authorization-server')){res.end(JSON.stringify({issuer:base,authorization_endpoint:base+'/authorize',token_endpoint:base+'/token',registration_endpoint:base+'/register',response_types_supported:['code'],code_challenge_methods_supported:['S256']}));return;}
  if(req.url==='/register'){const body=JSON.parse(raw);registrationName=body.client_name;res.end(JSON.stringify({...body,client_id:'forma-test',client_secret:'test-secret'}));return;}
  if(req.url==='/token'){tokenCalls++;const params=new URLSearchParams(raw);if(!params.get('code_verifier')){res.writeHead(400);res.end('{}');return;}res.end(JSON.stringify({access_token:'test-token',token_type:'Bearer'}));return;}
  if(req.headers.authorization!=='Bearer test-token'){res.writeHead(401,{'WWW-Authenticate':`Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`});res.end('{}');return;}
  if(req.method==='GET'){res.writeHead(405);res.end();return;}
  const body=JSON.parse(raw);if(body.id===undefined){res.writeHead(202);res.end();return;}
  const result=body.method==='initialize'?{protocolVersion:body.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1'}}:{tools:[{name:'read_example',inputSchema:{type:'object'}}]};
  res.end(JSON.stringify({jsonrpc:'2.0',id:body.id,result}));
 });await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const addr=server.address();base=`http://127.0.0.1:${typeof addr==='object'&&addr?.port}`;
 return {base,stats:()=>({tokenCalls,registrationName}),close:()=>new Promise<void>(r=>{server.close(()=>r());server.closeAllConnections();})};
}
describe('FormaBot MCP authorization',()=>{
 it('uses own registration, verifies callback and tools, saves only after success; restart needs verification',async()=>{
  const f=await fixture(),dir=mkdtempSync(join(tmpdir(),'forma-mcp-'));let auth:URL|undefined;
  const mcp=new McpConnection(dir,box,async url=>{auth=new URL(url);},f.base+'/mcp');
  try{
   expect(mcp.start().status).toBe('connecting');await waitFor(()=>mcp.view().status==='authorizing');expect(f.stats().registrationName).toBe('FormaBot');
   const callback=new URL(auth!.searchParams.get('redirect_uri')!);callback.searchParams.set('code','code');callback.searchParams.set('state','wrong');
   expect((await fetch(callback)).status).toBe(400);expect(f.stats().tokenCalls).toBe(0);
   callback.searchParams.set('state',auth!.searchParams.get('state')!);await fetch(callback);
   await waitFor(()=>mcp.view().status==='connected');expect(mcp.view().toolCount).toBe(1);expect(f.stats().tokenCalls).toBe(1);
   expect(mcp.view()).not.toHaveProperty('tokens');expect(readFileSync(join(dir,'figma-mcp.enc'),'utf8')).toContain('test-token');
   const reopened=new McpConnection(dir,box,async()=>{throw Error('must not open browser');},f.base+'/mcp');expect(reopened.view().status).toBe('saved');reopened.start();await waitFor(()=>reopened.view().status==='connected');reopened.disconnect();expect(reopened.view().status).toBe('disconnected');reopened.close();
  }finally{mcp.close();await f.close();rmSync(dir,{recursive:true,force:true});}
 });
 it('denial and cancellation never become connected',async()=>{
  const f=await fixture(),dir=mkdtempSync(join(tmpdir(),'forma-mcp-'));let auth:URL|undefined;
  const mcp=new McpConnection(dir,box,async url=>{auth=new URL(url);},f.base+'/mcp');
  try{
   mcp.start();await waitFor(()=>mcp.view().status==='authorizing');const callback=new URL(auth!.searchParams.get('redirect_uri')!);callback.searchParams.set('error','access_denied');callback.searchParams.set('state',auth!.searchParams.get('state')!);await fetch(callback);expect(mcp.view().status).toBe('failed');expect(f.stats().tokenCalls).toBe(0);
   mcp.start();await waitFor(()=>mcp.view().status==='authorizing');mcp.cancel();expect(mcp.view().status).toBe('disconnected');await new Promise(r=>setTimeout(r,50));expect(mcp.view().status).toBe('disconnected');expect(f.stats().tokenCalls).toBe(0);
  }finally{mcp.close();await f.close();rmSync(dir,{recursive:true,force:true});}
 });
});

it('classifies registration errors without inventing a permission diagnosis',()=>{expect(registrationFailure(403)).toContain('未提供更具体');expect(registrationFailure(400)).toContain('连接参数');expect(registrationFailure(429)).toContain('次数');expect(registrationFailure(503)).toContain('暂时不可用');});

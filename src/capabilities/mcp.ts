import {createServer, type Server} from 'node:http';
import {randomBytes} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,renameSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {UnauthorizedError,type OAuthClientProvider} from '@modelcontextprotocol/sdk/client/auth.js';
import type {OAuthClientInformationMixed,OAuthTokens} from '@modelcontextprotocol/sdk/shared/auth.js';
import type {SecretBox} from '../state/settings';

export interface McpView {status:'disconnected'|'connecting'|'authorizing'|'connected'|'saved'|'failed';message:string;toolCount:number}
interface Credentials {client?:OAuthClientInformationMixed;tokens?:OAuthTokens;redirect?:string}
interface Attempt {failure?:string;abort:AbortController;server?:Server;transport?:StreamableHTTPClientTransport;client?:Client;timer?:ReturnType<typeof setTimeout>}
export function registrationFailure(status:number):string {
 if(status===403)return 'Figma 拒绝了本次接入请求（403），尚未进入账号授权。官方要求新客户端申请接入，当前响应未提供更具体的原因。';
 if(status===429)return 'Figma 暂时限制了连接次数，请稍后重试。';
 if(status>=500)return 'Figma 服务暂时不可用，请稍后重试。';
 if(status===400||status===422)return 'Figma 未接受应用提交的连接参数，需要修复接入配置。此时尚未开始账号授权。';
 return `连接请求未通过（${status}），尚未开始账号授权。`;
}
const endpoint='https://mcp.figma.com/mcp';
/** Settings-only connection probe. Does not expose server tools to task execution. */
export class McpConnection {
 private file:string;
 private current?:Attempt;
 private viewState:McpView={status:'disconnected',message:'',toolCount:0};
 constructor(directory:string,private box:SecretBox,private openBrowser:(url:string)=>Promise<void>,private serverUrl=endpoint){
  mkdirSync(directory,{recursive:true,mode:0o700});this.file=join(directory,'figma-mcp.enc');
  try{readFileSync(this.file);this.viewState.status='saved';}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')this.viewState={status:'failed',message:'无法读取已保存的连接，请重试。',toolCount:0};}
 }
 view():McpView{return {...this.viewState};}
 start():McpView{
  if(this.current)return this.view();
  const attempt:Attempt={abort:new AbortController()};this.current=attempt;
  this.viewState={status:'connecting',message:'',toolCount:0};
  attempt.timer=setTimeout(()=>this.finish(attempt,'授权或连接超时，请重试。'),180_000);
  void this.connect(attempt).catch(()=>this.finish(attempt,attempt.failure??'未能连接 Figma，请检查网络后重试。'));
  return this.view();
 }
 cancel(){if(this.current)this.release(this.current);this.viewState={status:'disconnected',message:'已取消连接。',toolCount:0};return this.view();}
 disconnect(){if(this.current)this.release(this.current);rmSync(this.file,{force:true});this.viewState={status:'disconnected',message:'已在 FormaBot 断开连接。',toolCount:0};return this.view();}
 close(){if(this.current)this.release(this.current);}
 private release(a:Attempt){if(this.current===a)this.current=undefined;a.abort.abort();clearTimeout(a.timer);a.server?.close();a.server?.closeAllConnections();void a.client?.close().catch(()=>{});void a.transport?.close().catch(()=>{});}
 private finish(a:Attempt,message:string){if(this.current!==a)return;this.release(a);this.viewState={status:'failed',message,toolCount:0};}
 private async connect(a:Attempt){
  const active=()=>{if(this.current!==a||a.abort.signal.aborted)throw Error('cancelled');};
  if(!this.box.available())throw Error('secret storage unavailable');
  let saved:Credentials={};try{saved=JSON.parse(this.box.decrypt(readFileSync(this.file)));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  let verifier='',state=randomBytes(32).toString('hex'),authorizationUrl:URL|undefined,consumed=false;
  // Saved registration uses its registered loopback URI; first registration gets an ephemeral port.
  const previous=saved.redirect?new URL(saved.redirect):undefined;
  if(previous&&(previous.hostname!=='127.0.0.1'||previous.protocol!=='http:'))throw Error('invalid redirect');
  const callbackPath=previous?.pathname??`/callback/${randomBytes(20).toString('hex')}`;
  let redirect='';
  const fetchFn:typeof fetch=async(input,init)=>{
   active();const url=new URL(input instanceof Request?input.url:String(input));
   const testLocal=this.serverUrl!==endpoint&&url.hostname==='127.0.0.1';
   if(!testLocal&&(url.protocol!=='https:'||!['mcp.figma.com','api.figma.com','www.figma.com'].includes(url.hostname)))throw Error('untrusted endpoint');
   const response=await fetch(input,{...init,redirect:'error',signal:AbortSignal.any([a.abort.signal,AbortSignal.timeout(25_000),...(init?.signal?[init.signal]:[])])});active();if(!response.ok&&url.pathname==='/v1/oauth/mcp/register')a.failure=registrationFailure(response.status);return response;
  };
  const verify=async()=>{
   active();const client=new Client({name:'FormaBot',version:'0.1.0'});a.client=client;
   const transport=new StreamableHTTPClientTransport(new URL(this.serverUrl),{authProvider:provider,fetch:fetchFn});a.transport=transport;
   await client.connect(transport);active();
   let cursor:string|undefined,count=0;const seen=new Set<string>();
   do{const result=await client.listTools(cursor?{cursor}:undefined);active();count+=result.tools.length;cursor=result.nextCursor;if(cursor){if(seen.has(cursor)||seen.size>=100)throw Error('invalid pagination');seen.add(cursor);}}while(cursor);
   const temp=`${this.file}.tmp`;writeFileSync(temp,this.box.encrypt(JSON.stringify(saved)),{mode:0o600});renameSync(temp,this.file);
   this.release(a);this.viewState={status:'connected',message:'',toolCount:count};
  };
  const provider:OAuthClientProvider={
   get redirectUrl(){return redirect;},
   get clientMetadata(){return {client_name:'FormaBot',redirect_uris:[redirect],grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:'client_secret_post'};},
   state:()=>state,clientInformation:()=>saved.client,saveClientInformation:info=>{active();saved.client=info;saved.redirect=redirect;},
   tokens:()=>saved.tokens,saveTokens:tokens=>{active();saved.tokens=tokens;},
   saveCodeVerifier:value=>{active();verifier=value;},codeVerifier:()=>verifier,
   invalidateCredentials:scope=>{active();if(scope==='all'||scope==='client')saved.client=undefined;if(scope==='all'||scope==='tokens')saved.tokens=undefined;if(scope==='all'||scope==='verifier')verifier='';},
   redirectToAuthorization:async url=>{
    active();if(url.protocol!=='https:'||url.hostname!=='www.figma.com'){if(!(this.serverUrl!==endpoint&&url.hostname==='127.0.0.1'&&url.protocol==='http:'))throw Error('untrusted authorization');}
    authorizationUrl=url;this.viewState={status:'authorizing',message:'',toolCount:0};try{await this.openBrowser(url.href);}catch{a.failure='无法打开系统浏览器，请检查默认浏览器设置后重试。';throw Error('browser unavailable');}active();
   },
  };
  const server=createServer((req,res)=>{
   res.setHeader('Content-Type','text/plain; charset=utf-8');res.setHeader('Cache-Control','no-store');
   const url=new URL(req.url??'/',redirect);
   if(req.method!=='GET'||req.headers.host!==new URL(redirect).host||url.pathname!==callbackPath||url.searchParams.get('state')!==state||consumed||this.current!==a){res.writeHead(400);res.end('此授权回调无效，请返回 FormaBot。');return;}
   const issuer=url.searchParams.get('iss');if(issuer&&issuer!==(this.serverUrl===endpoint?'https://api.figma.com':new URL(this.serverUrl).origin)){res.writeHead(400);res.end('授权来源不匹配。');return;}
   if(!authorizationUrl){res.writeHead(400);res.end('尚未开始授权。');return;}
   consumed=true;
   if(url.searchParams.has('error')||!url.searchParams.get('code')){res.end('授权未完成，请返回 FormaBot。');this.finish(a,'未获得授权。你可以重新连接。');return;}
   const code=url.searchParams.get('code')!;res.end('已收到授权，请返回 FormaBot 查看连接结果。');
   this.viewState={status:'connecting',message:'',toolCount:0};
   void (async()=>{await a.transport!.finishAuth(code);active();await a.client?.close();await verify();})().catch(()=>this.finish(a,'授权后的连接验证失败，请重试。'));
  });a.server=server;
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(previous?Number(previous.port):0,'127.0.0.1',()=>resolve());});active();
  const address=server.address();if(!address||typeof address==='string')throw Error('no callback listener');redirect=`http://127.0.0.1:${address.port}${callbackPath}`;
  try{await verify();}catch(e){if(e instanceof UnauthorizedError&&authorizationUrl){active();return;}throw e;}
 }
}

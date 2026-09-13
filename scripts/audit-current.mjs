// Deterministic audit counterexamples. No model, production data or external site.
import {build} from 'esbuild';
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import {execFileSync} from 'node:child_process';
const root=resolve('.');mkdirSync('.tmp',{recursive:true});
const dir=mkdtempSync(resolve('.tmp/current-audit-'));
await build({stdin:{contents:"export {WorkbenchStore} from './src/state/workbench'; export {ConversationSession} from './src/runtime/conversation-session'; export {dispatchTool} from './src/runtime/task-host'; export {evaluateApproval} from './src/runtime/approval-policy';",resolveDir:root},outfile:join(dir,'core.mjs'),bundle:true,platform:'node',format:'esm',plugins:[{name:'unused-electron-network',setup(b){b.onResolve({filter:/^electron$/},()=>({path:'electron',namespace:'audit'}));b.onLoad({filter:/.*/,namespace:'audit'},()=>({contents:'export const net={};'}));}}]});
const {WorkbenchStore,ConversationSession,dispatchTool,evaluateApproval}=await import(pathToFileURL(join(dir,'core.mjs')));
const facts={baseline:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),workingTreeDirty:!!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),directory:dir,modelTasksRun:false};
for(const scenario of ['responded','failed','silent','cycle','blocked-chain']){
 const s=new WorkbenchStore(join(dir,scenario+'.sqlite'));
 const boss=s.create(dir,{name:'Boss',role:'Coordinate',kind:'bot',members:[]});
 const team=s.createTeam(dir,boss,{name:scenario,purpose:'audit',members:[{name:'A',role:'A'},{name:'B',role:'B'},{name:'C',role:'C'}]});
 const c=new ConversationSession(dir,scenario,s),dispatched=[];
 try{c.tool({id:'dispatch',conversation:team.group,member:team.manager,instruction:'audit'},'assign_tasks',{tasks:[{memberId:'A',instruction:'A',...(scenario==='cycle'?{depends_on:'B'}:{})},{memberId:'B',instruction:'B',depends_on:'A'},...(scenario==='blocked-chain'?[{memberId:'C',instruction:'C',depends_on:'B'}]:[])]});}
 catch(error){facts[scenario]={rejected:error.message,jobs:s.jobs(team.group.id)};s.close();continue;}
 const outcome=await c.run(async j=>{dispatched.push(j.member.name);if(j.member.name==='A'){
  if(scenario==='failed')throw Error('fixture failure');
  if(scenario==='silent')c.tool(j,'silent',{reason:'fixture'});
  if(scenario==='blocked-chain')c.tool(j,'task_result',{status:'blocked',summary:'fixture blocker'});
 }else c.tool(j,'task_result',{status:'completed',summary:'fixture completion'});
 return {text:'fixture response',artifacts:[]};},()=>{});
 facts[scenario]={outcome:outcome.status,dispatched,jobs:s.jobs(team.group.id).map(j=>({member:j.memberName,status:j.status}))};s.close();
}
const s=new WorkbenchStore(join(dir,'ledger.sqlite')),p=join(dir,'delivery.txt');
writeFileSync(p,'original');s.recordDelivery('j',p,createHash('sha256').update('original').digest('hex'),8);writeFileSync(p,'changed');
facts.changedDelivery=s.verifyDeliveries('j');facts.noDelivery=s.verifyDeliveries('absent');s.close();
const deps={signal:new AbortController().signal,authorized:()=>true,browser:async()=>'',onEvent:()=>{},onArtifact:()=>{},teamTool:()=>''};
try{await dispatchTool({node:process.execPath,root,home:dir,workspace:dir,provider:'fixture',model:'fixture',key:'fixture',prompt:'',protectedPaths:[],readOnly:true},'bash',{command:'printf audit > summary-wrote.txt'},deps);facts.summaryBashWrite=readFileSync(join(dir,'summary-wrote.txt'),'utf8');}catch(e){facts.summaryBashWriteError=e.message;}
facts.openWithoutApproval=evaluateApproval([],{tool:'browser',action:'open',url:'https://example.invalid/action?content=fixture'});
// Execute the exact page selection script with a small DOM fixture, count listeners after cleanup.
const browserSource=readFileSync('src/tools/browser.ts','utf8');
const pick=browserSource.split('const PICK_SCRIPT=`')[1].split('`;')[0];
const listeners=[];const dummy=()=>({classList:{remove(){}},remove(){},style:{}});
const document={createElement:dummy,head:{appendChild(){}},documentElement:{appendChild(){}},getElementById:()=>dummy(),addEventListener:(type,fn)=>listeners.push({type,fn}),getSelection:()=>null};
const context={window:{},document};runInNewContext(pick,context);context.window.__formabotPickCleanup();
facts.selectionListenersAfterCleanup=listeners.length;
runInNewContext(pick,context);context.window.__formabotPickCleanup();facts.selectionListenersAfterSecondCleanup=listeners.length;
const packageMain=join(root,'build/mac-arm64/FormaBot.app/Contents/Resources/app/dist/desktop/main.cjs');
try{facts.buildMatchesMain=readFileSync(packageMain).equals(readFileSync('dist/desktop/main.cjs'));}catch(e){facts.buildCompareError=e.message;}
writeFileSync(join(dir,'facts.json'),JSON.stringify(facts,null,2));console.log(JSON.stringify(facts,null,2));

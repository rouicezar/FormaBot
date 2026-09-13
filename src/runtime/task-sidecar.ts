import { isModelResponse, publicTextChunk } from './model-status';
import { DeepSeekHarness } from '@deepseek-ai/dsh-sdk-client';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

process.once('message',async (message:{home:string;workspace:string;provider:string;model:string;key:string;prompt:string;url:string;token:string;outputDir?:string;images?:{data:string;mimeType:'image/png'}[]})=>{
  let harness:DeepSeekHarness|undefined;
  const redact=(value:string)=>value.split(message.key).join('[REDACTED]').split(message.token).join('[REDACTED]');
  try {
    await mkdir(message.home,{recursive:true,mode:0o700});
    const patch=join(message.home,'task.patch.json');
    await writeFile(patch,JSON.stringify([
      ...['persistent-bash','persistent-pwsh','str-replace-editor','terminal-bash','terminal-pwsh','pty'].map(id=>({id,disabled:true})),
      {id:'sandbox-policy',config:{mode:'read-only',workspaceRoot:message.workspace}},
      {id:'system-prompt',config:{includeHarnessIdentity:false,includeRuntimeContext:false,persona:`你是 FormaBot 的工作成员。用工具实际完成用户任务，交付文件保存到工作空间 ${message.workspace} 下的 ${message.outputDir??'outputs'}/。没有工具成功证据不能声称已完成。工具失败应解释具体原因。用户的工作空间已授权，勿重复请求工作空间权限。外部发布需用户明确指令。用户要求建团队/群组时必须调用 create_team 创建实际成员与群组，不能用写文档代替。可用 list_team 核对已创建团队。旧会话中关于缺少建队工具的说法已过时，以当前工具列表为准。`}},
      {insert:[
        // E12b：本地附件存储——SDK 收到 image 块时要求 attachments 服务（与 dsh-base 相同挂法）。
        {id:'formabot-attachments',name:'@deepseek-ai/dsh-attachment-local',config:{}},
        {id:'formabot-model',name:'@deepseek-ai/dsh-llm-pi-ai',config:{providers:{[message.provider]:{apiKeyEnv:'FORMABOT_MODEL_KEY',retryPolicy:{mode:'normal',maxRetries:1}}}}},
        {id:'formabot-tools',name:fileURLToPath(new URL('./tools-plugin.mjs',import.meta.url)),config:{url:message.url,search:message.provider==='deepseek',outputsDir:message.outputDir??'outputs'}},
      ]},
    ]));
    harness=new DeepSeekHarness({profile:'sdk-minimal',dshHome:message.home,processCwd:message.home,cwd:message.workspace,
      dshBin:fileURLToPath(import.meta.resolve('@deepseek-ai/dsh/package.json')).replace(/package\.json$/,'lib/bin.js'),patches:[patch],provider:message.provider,model:message.model,maxTokens:8192,initializeTimeoutMs:20000,
      env:{...process.env,PATH:'/usr/bin:/bin:/usr/sbin:/sbin',HOME:message.home,TMPDIR:message.home,LANG:'en_US.UTF-8',DSH_TELEMETRY_DISABLED:'1',FORMABOT_MODEL_KEY:message.key,FORMABOT_BRIDGE_TOKEN:message.token},
    });
    let connected=false,streamStep=-1,publicText='';
    // E12b-2：图片以 base64 image 块随指令真正传入多模态模型；纯文本任务保持字符串输入。
    const input=(message.images?.length?[{type:'text' as const,text:message.prompt},...message.images.map(image=>({type:'image' as const,data:image.data,mimeType:image.mimeType}))]:message.prompt) as Parameters<typeof harness.run>[0];
    const result=await harness.run(input,{onNotification:notification=>{
      const chunk=publicTextChunk(notification);
      if(chunk){if(streamStep!==chunk.step){streamStep=chunk.step;publicText='';}publicText+=chunk.text;process.send?.({type:'text',text:redact(publicText)});}
      if(!connected&&isModelResponse(notification)){connected=true;process.send?.({type:'connected'});}
    }});
    if(!result.finalResponse)throw new Error('模型没有返回最终答复，请检查模型服务和任务记录。');
    process.send?.({type:'result',text:redact(result.finalResponse)});
  }catch(error){process.send?.({type:'failed',text:redact(error instanceof Error?error.message:'执行失败')});process.exitCode=1;}
  finally {await harness?.close();process.disconnect?.();}
});

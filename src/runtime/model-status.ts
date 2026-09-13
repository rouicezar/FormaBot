// Failure-only usage/finish notifications do not prove that a model responded.
export function isModelResponse(notification:{method:string;params:Record<string,unknown>}):boolean {
  if(notification.method!=='session.event')return false;
  const event=notification.params.event as {type?:string;data?:{chunk?:{type?:string};message?:{content?:unknown[]}}}|undefined;
  if(event?.type==='assistant/chunk')return ['block-start','text-delta','reasoning-delta','tool-call-delta','block-end'].includes(event.data?.chunk?.type??'');
  return event?.type==='assistant/message'&&Array.isArray(event.data?.message?.content)&&event.data.message.content.length>0;
}

export function publicTextChunk(notification:{method:string;params:Record<string,unknown>}):{step:number;text:string}|undefined{
 if(notification.method!=='session.event')return;
 const event=notification.params.event as {type?:string;data?:{step?:number;chunk?:{type?:string;text?:string}}}|undefined;
 if(event?.type==='assistant/chunk'&&event.data?.chunk?.type==='text-delta'&&typeof event.data.chunk.text==='string')return {step:event.data.step??-1,text:event.data.chunk.text};
}

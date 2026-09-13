import {test,expect} from 'vitest';
import {isModelResponse,publicTextChunk} from '../src/runtime/model-status';
test('model connection requires response content, never request start or failure accounting',()=>{
 const event=(type:string,data:unknown)=>({method:'session.event',params:{event:{type,data}}});
 expect(isModelResponse(event('assistant/chunk',{chunk:{type:'usage'}}))).toBe(false);
 expect(isModelResponse(event('assistant/chunk',{chunk:{type:'finish',reason:{kind:'error'}}}))).toBe(false);
 expect(isModelResponse(event('assistant/message',{message:{content:[]}}))).toBe(false);
 expect(isModelResponse(event('request/start',{}))).toBe(false);
 expect(isModelResponse(event('assistant/chunk',{chunk:{type:'tool-call-delta'}}))).toBe(true);
 expect(isModelResponse(event('assistant/message',{message:{content:[{type:'text',text:'hello'}]}}))).toBe(true);
});

test('public streaming excludes reasoning and tool argument channels',()=>{
 const chunk=(type:string)=>({method:'session.event',params:{event:{type:'assistant/chunk',data:{step:2,chunk:{type,text:'sample'}}}}});
 expect(publicTextChunk(chunk('text-delta'))).toEqual({step:2,text:'sample'});
 for(const type of ['reasoning-delta','tool-call-delta','block-start','usage'])expect(publicTextChunk(chunk(type))).toBeUndefined();
});

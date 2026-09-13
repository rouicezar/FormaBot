import {test,expect,vi,afterEach} from 'vitest';
import {webSearch} from '../src/tools/web-search';
afterEach(()=>vi.unstubAllGlobals());
test('search rejects a model answer without actual completed search evidence',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'I searched'}]}]}))));
 await expect(webSearch({provider:'deepseek',model:'deepseek-v4-flash',key:'fixture'},{query:'2026公开资料'},new AbortController().signal)).rejects.toThrow('搜索记录');
});
test('search retains source annotations and original query, sends only configured provider credential',async()=>{
 const request=vi.fn(async()=>new Response(JSON.stringify({status:'completed',output:[{type:'web_search_call',status:'completed'},{type:'message',content:[{type:'output_text',text:'source',annotations:[{type:'url_citation',url:'https://example.org/source'}]}]}]})));vi.stubGlobal('fetch',request);
 const result=JSON.parse(await webSearch({provider:'deepseek',model:'deepseek-v4-flash',key:'fixture'},{query:'2026公开资料'},new AbortController().signal));expect(result.query).toBe('2026公开资料');expect(result.results[0].annotations[0].url).toBe('https://example.org/source');
 await expect(webSearch({provider:'openai',model:'other',key:'fixture'},{query:'query'},new AbortController().signal)).rejects.toThrow('尚未接入');expect(request).toHaveBeenCalledTimes(1);
});
test('streamed search requires the completed response and never returns reasoning deltas',async()=>{
 const result={status:'completed',output:[{type:'web_search_call',status:'completed'},{type:'message',content:[{type:'output_text',text:'verified source'}]}]};
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('data: '+JSON.stringify({type:'response.reasoning_text.delta',delta:'private reasoning'})+'\n\ndata: '+JSON.stringify({type:'response.completed',response:result})+'\n\n',{headers:{'Content-Type':'text/event-stream'}})));
 const text=await webSearch({provider:'deepseek',model:'deepseek-v4-flash',key:'fixture'},{query:'query'},new AbortController().signal);expect(text).toContain('verified source');expect(text).not.toContain('private reasoning');
});

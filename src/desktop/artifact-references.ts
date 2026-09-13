export interface ArtifactReference {path:string;taskId:string}
export interface ArtifactMention {start:number;end:number;label:string;reference:ArtifactReference}
// Aliases are derived only from registered files, never from invented document titles.
export function artifactAliases(references:ArtifactReference[],memberNames:string[]=[]){
 const candidates=new Map<string,ArtifactReference[]>();
 for(const reference of references){const parts=reference.path.split('/'),name=parts.at(-1)!,stem=name.replace(/\.[^.]+$/,'');const aliases=new Set([reference.path,name,stem,...parts.slice(1,-1).map((_,i)=>parts.slice(i+1).join('/'))]);
   let title=stem.replace(/[_-]\d{8}(?:[_-]\d{6})?$/,'');for(const member of memberNames)if(title.endsWith('_'+member))title=title.slice(0,-member.length-1);if(title.length>=2)aliases.add(title);
   for(const alias of aliases){if(alias.length<2)continue;const values=candidates.get(alias)??[];if(!values.some(v=>v.path===reference.path&&v.taskId===reference.taskId))values.push(reference);candidates.set(alias,values);}
 }
 return new Map([...candidates].filter(([,values])=>values.length===1).map(([alias,values])=>[alias,values[0]]));
}
export function artifactMentions(text:string,aliases:Map<string,ArtifactReference>):ArtifactMention[]{
 const matches:ArtifactMention[]=[];
 for(const [alias,reference] of aliases){let start=text.indexOf(alias);while(start!==-1){const end=start+alias.length,before=text[start-1]??'',after=text[end]??'';
   // Do not turn a filename inside a longer path or filename into a misleading link.
   if(!/[\w/\\.-]/.test(before)&&!/[\w/\\.-]/.test(after))matches.push({start,end,label:alias.includes('/')?reference.path.split('/').at(-1)!:alias,reference});
   start=text.indexOf(alias,start+alias.length);
 }}
 matches.sort((a,b)=>a.start-b.start||(b.end-b.start)-(a.end-a.start));const result:ArtifactMention[]=[];for(const match of matches)if(!result.length||match.start>=result.at(-1)!.end)result.push(match);return result;
}

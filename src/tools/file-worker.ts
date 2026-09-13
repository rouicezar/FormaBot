import { readFile, writeFile, mkdir, stat, realpath } from 'node:fs/promises';
import { resolve, dirname, relative, isAbsolute, extname } from 'node:path';

let raw='';for await(const chunk of process.stdin)raw+=String(chunk);
try {
  const {workspace,tool,input}=JSON.parse(raw);
  if(typeof input?.path!=='string')throw new Error('缺少文件路径。');
  const path=resolve(workspace,input.path);const rel=relative(workspace,path);
  if(rel==='..'||rel.startsWith('../')||isAbsolute(rel))throw new Error('文件路径超出工作空间。');
  try { const info=await stat(path);if(info.nlink>1&&!info.isDirectory())throw new Error('拒绝操作硬链接文件。'); }catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  if(tool==='delivery_check') {
    const actual=await realpath(path),relativePath=relative(workspace,actual);
    if(relativePath==='..'||relativePath.startsWith('../')||isAbsolute(relativePath))throw Error('交付文件超出工作空间。');
    const info=await stat(actual);if(!info.isFile()||info.size>16000000)throw Error('交付登记支持16 MB以内的普通文件。');
    process.stdout.write(JSON.stringify({path:actual,size:info.size}));
  } else if(tool==='preview') {
    const info=await stat(path);if(!info.isFile()||info.size>4000000)throw new Error('预览仅支持 4 MB 以内的文件。');
    const ext=extname(path).toLowerCase();
    const mime:Record<string,string>={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif'};
    const bytes=await readFile(path);
    if(mime[ext])process.stdout.write(JSON.stringify({kind:'image',content:`data:${mime[ext]};base64,${bytes.toString('base64')}`,path}));
    else if(['.md','.txt','.json','.csv','.html','.htm','.css','.js','.ts','.py','.log','.yaml','.yml','.xml','.svg'].includes(ext)&&!bytes.includes(0))process.stdout.write(JSON.stringify({kind:'text',content:bytes.toString('utf8'),path}));
    else throw new Error('此文件格式暂不支持内置预览，文件已保存在工作空间。');
  } else if(tool==='read') {
    const info=await stat(path);if(info.size>200000)throw new Error('文件过大，请用 Bash 分段读取。');
    process.stdout.write(await readFile(path,'utf8'));
  } else if(tool==='write') {
    if(typeof input.content!=='string'||input.content.length>1000000)throw new Error('内容无效或超过限制。');
    await mkdir(dirname(path),{recursive:true});await writeFile(path,input.content,'utf8');process.stdout.write(await realpath(path));
  } else if(tool==='edit') {
    if(typeof input.oldText!=='string'||!input.oldText||typeof input.newText!=='string')throw new Error('需要 oldText/newText。');
    const text=await readFile(path,'utf8');if(text.split(input.oldText).length!==2)throw new Error('旧文本必须唯一匹配。');
    await writeFile(path,text.replace(input.oldText,input.newText),'utf8');process.stdout.write(await realpath(path));
  } else throw new Error('未知文件工具。');
}catch(error){process.stderr.write(error instanceof Error?error.message:'文件操作失败');process.exitCode=1;}

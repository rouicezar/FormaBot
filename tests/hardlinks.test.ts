import {it,expect} from 'vitest';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,linkSync,symlinkSync,statSync,rmSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {breakWorkspaceHardlinks} from '../src/tools/hardlinks';

it('breaks hardlinks pointing outside the workspace without changing path or content',()=>{
  const dir=mkdtempSync(resolve('.tmp/hardlinks-'));const workspace=join(dir,'workspace');mkdirSync(workspace);
  try{
    const outside=join(dir,'outside.txt');writeFileSync(outside,'OUTSIDE');
    const linked=join(workspace,'linked.txt');linkSync(outside,linked);
    const nested=join(workspace,'sub');mkdirSync(nested);linkSync(outside,join(nested,'nested.txt'));
    const{broken}=breakWorkspaceHardlinks(workspace);
    expect(broken).toHaveLength(2);
    expect(readFileSync(linked,'utf8')).toBe('OUTSIDE');
    expect(statSync(linked).nlink).toBe(1);
    expect(statSync(join(nested,'nested.txt')).nlink).toBe(1);
    expect(statSync(outside).nlink).toBe(1);
    writeFileSync(linked,'CHANGED');
    expect(readFileSync(outside,'utf8')).toBe('OUTSIDE');
  }finally{rmSync(dir,{recursive:true,force:true});}
});

it('ignores symlinks and plain files, and fails closed over the entry limit',()=>{
  const dir=mkdtempSync(resolve('.tmp/hardlinks-'));const workspace=join(dir,'workspace');mkdirSync(workspace);
  try{
    writeFileSync(join(workspace,'plain.txt'),'PLAIN');
    symlinkSync(join(dir,'whatever'),join(workspace,'link.txt'));
    const{broken}=breakWorkspaceHardlinks(workspace);
    expect(broken).toHaveLength(0);
    expect(existsSync(join(workspace,'plain.txt'))).toBe(true);
    expect(()=>{statSync(join(workspace,'link.txt'));}).toThrow(); // 符号链接未被跟随/删除（目标不存在）
    expect(()=>breakWorkspaceHardlinks(workspace,{maxEntries:0})).toThrow(/硬链接安全检查/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

import {it,expect} from 'vitest';
import {mkdtempSync,mkdirSync,rmSync,symlinkSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {TaskStore} from '../src/state/tasks';
it('keeps workspace authorization and task results across restart; marks unfinished work interrupted',()=>{
  const dir=mkdtempSync(resolve('.tmp/grants-'));const workspace=join(dir,'workspace');mkdirSync(workspace);const file=join(dir,'tasks.sqlite');
  try{
    let store=new TaskStore(file);expect(store.authorized(workspace)).toBe(false);store.authorize(workspace);store.start('one','test',workspace);store.close();
    store=new TaskStore(file);expect(store.authorized(workspace)).toBe(true);expect(store.latest()?.status).toBe('interrupted');store.revoke(workspace);expect(store.authorized(workspace)).toBe(false);store.close();
  }finally{rmSync(dir,{recursive:true,force:true});}
});

it('treats revoked, missing or replaced workspaces as unauthorized without throwing',()=>{
  const dir=mkdtempSync(resolve('.tmp/grants-'));const workspace=join(dir,'workspace');mkdirSync(workspace);const file=join(dir,'tasks.sqlite');
  try{
    const store=new TaskStore(file);store.authorize(workspace);
    // 撤销时传入符号链接路径也应删除规范化后的授权记录
    symlinkSync(workspace,join(dir,'workspace-link'));
    store.revoke(join(dir,'workspace-link'));expect(store.authorized(workspace)).toBe(false);
    // 重新授权幂等；同路径但目录被替换（新 inode）后旧授权失效
    store.authorize(workspace);store.authorize(workspace);expect(store.authorized(workspace)).toBe(true);
    rmSync(workspace,{recursive:true,force:true});mkdirSync(workspace);
    expect(store.authorized(workspace)).toBe(false);
    store.close();
  }finally{rmSync(dir,{recursive:true,force:true});}
});

it('returns false instead of throwing when the workspace path no longer exists',()=>{
  const dir=mkdtempSync(resolve('.tmp/grants-'));const workspace=join(dir,'gone');const file=join(dir,'tasks.sqlite');
  try{
    const store=new TaskStore(file);
    expect(()=>store.authorized(workspace)).not.toThrow();
    expect(store.authorized(workspace)).toBe(false);
    store.close();
  }finally{rmSync(dir,{recursive:true,force:true});}
});

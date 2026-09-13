import {it,expect} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {WorkbenchStore} from '../src/state/workbench';

it('persists and dedupes per-workspace approval rules across restart',()=>{
  const dir=mkdtempSync(resolve('.tmp/approvals-'));const file=join(dir,'workbench.sqlite');
  try{
    let store=new WorkbenchStore(file);const ws='/tmp/space';
    store.ensure(ws);
    store.addApprovalRule(ws,{host:'tests.example.com',action:'click',decision:'always_allow'});
    store.addApprovalRule(ws,{host:'tests.example.com',action:'click',decision:'always_allow'});
    expect(store.approvalRules(ws)).toHaveLength(1);
    store.close();
    store=new WorkbenchStore(file);
    expect(store.approvalRules(ws)).toEqual([{host:'tests.example.com',action:'click',decision:'always_allow'}]);
    store.close();
  }finally{rmSync(dir,{recursive:true,force:true});}
});

import {expect as expect2} from 'vitest';
import {WorkbenchStore as W2} from '../src/state/workbench';

it('role change requests persist, approve creates a user_approved version, deny leaves roles untouched',()=>{
  const dir=mkdtempSync(resolve('.tmp/rolereq-'));const file=join(dir,'wb.sqlite');
  try{
    const store=new W2(file);store.ensure('/ws');
    const editor=store.create('/ws',{name:'编辑',role:'写作',kind:'bot',members:[]});
    const requester=store.create('/ws',{name:'研究员',role:'研究',kind:'bot',members:[]});
    const before=store.roleHistory('/ws',editor)[0];
    const id=store.requestRoleChange('/ws',{requesterName:'研究员',requesterId:requester,targetId:editor,targetName:'编辑',role:'复盘专员',reason:'用户在群里提出'});
    expect(store.roleRequests('/ws')).toHaveLength(1);
    expect2(store.resolveRoleRequest('/ws',id,false)).toBe(false);
    expect(store.roleRequests('/ws')).toHaveLength(0);
    expect(store.list('/ws').find(c=>c.id===editor)!.role).toBe('写作');
    const id2=store.requestRoleChange('/ws',{requesterName:'研究员',requesterId:requester,targetId:editor,targetName:'编辑',role:'复盘专员',reason:'用户在群里提出'});
    expect2(store.resolveRoleRequest('/ws',id2,true)).toBe(true);
    const after=store.list('/ws').find(c=>c.id===editor)!;
    expect2(after.role).toBe('复盘专员');
    const history=store.roleHistory('/ws',editor);
    expect2(history[0]!.source).toBe('user_approved');
    expect2(history[0]!.version).toBe(before!.version+1);
    expect(()=>store.resolveRoleRequest('/ws',id2,true)).toThrow(/不存在/);
    store.close();
  }finally{rmSync(dir,{recursive:true,force:true});}
});

it('transfers group coordinator persistently and validates membership',()=>{
  const dir=mkdtempSync(resolve('.tmp/manager-'));const file=join(dir,'wb.sqlite');
  try{
    const store=new W2(file);store.ensure('/ws');
    const manager=store.create('/ws',{name:'总监',role:'管理',kind:'bot',members:[]});
    const team=store.createTeam('/ws',manager,{name:'转移组',purpose:'协作',members:[{name:'编辑',role:'写作'},{name:'研究员',role:'研究'}]});
    expect(store.list('/ws').find(c=>c.id===team.group.id)!.managerId).toBe(manager);
    expect(()=>store.setManager('/ws',team.group.id,'stranger')).toThrow(/本群普通成员/);
    const newManager=team.members[0]!.id;
    expect(store.setManager('/ws',team.group.id,newManager)).toBe(true);
    expect(store.list('/ws').find(c=>c.id===team.group.id)!.managerId).toBe(newManager);
    store.close();
    const reopened=new W2(file);
    expect(reopened.list('/ws').find(c=>c.id===team.group.id)!.managerId).toBe(newManager);
    reopened.close();
  }finally{rmSync(dir,{recursive:true,force:true});}
});

import {it,expect,describe} from 'vitest';
import {evaluateApproval, type ApprovalRule} from '../src/runtime/approval-policy';

const call=(action:'open'|'read'|'click'|'fill',url='https://tests.example.com/post')=>({tool:'browser' as const,action,url});

describe('approval policy (R30)',()=>{
  it('requires approval by default for publish-capable click/fill, allows open/read',()=>{
    expect(evaluateApproval([],call('click'))).toBe('approval');
    expect(evaluateApproval([],call('fill'))).toBe('approval');
    expect(evaluateApproval([],call('open'))).toBe('allow');
    expect(evaluateApproval([],call('read'))).toBe('allow');
  });
  it('always-allow rules are bound to host and action, non-matching hosts stay gated',()=>{
    const rules:ApprovalRule[]=[{host:'tests.example.com',action:'click',decision:'always_allow'}];
    expect(evaluateApproval(rules,call('click'))).toBe('allow');
    expect(evaluateApproval(rules,call('fill'))).toBe('approval');
    expect(evaluateApproval(rules,call('click','https://other.example.com/post'))).toBe('approval');
  });
  it('require rules always take precedence over allow rules',()=>{
    const rules:ApprovalRule[]=[
      {host:'tests.example.com',action:'*',decision:'always_allow'},
      {host:'tests.example.com',action:'click',decision:'require'},
    ];
    expect(evaluateApproval(rules,call('click'))).toBe('approval');
    expect(evaluateApproval(rules,call('fill'))).toBe('allow');
  });
  it('non-browser tools and malformed urls never bypass the gate',()=>{
    expect(evaluateApproval([],{tool:'browser',action:'click',url:'not a url'})).toBe('approval');
    expect(evaluateApproval([{host:'tests.example.com',action:'click',decision:'always_allow'}],{tool:'browser',action:'click',url:'not a url'})).toBe('approval');
  });
});

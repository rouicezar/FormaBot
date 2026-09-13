import {it,expect} from 'vitest';
import {ControlLease} from '../src/tools/lease';

it('holds for the requested window, auto-expires, and can be released',async()=>{
  const lease=new ControlLease();
  expect(lease.held()).toBe(false);
  lease.hold(20);
  expect(lease.held()).toBe(true);
  expect(lease.remainingMs()).toBeGreaterThan(0);
  await new Promise(r=>setTimeout(r,30));
  expect(lease.held()).toBe(false);
  lease.hold(50);lease.release();
  expect(lease.held()).toBe(false);
});

it('refreshes the hold window on every user action',()=>{
  const lease=new ControlLease();
  lease.hold(30);
  const first=lease.remainingMs();
  expect(first).toBeGreaterThan(0);
  lease.hold(30); // 用户再次操作
  expect(lease.remainingMs()).toBeGreaterThanOrEqual(first);
});

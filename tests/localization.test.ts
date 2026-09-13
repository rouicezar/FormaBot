import { expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SettingsStore } from '../src/state/settings';
import { en, zh, setLocale, t } from '../src/shared/i18n';

it('persists language without changing workspace or encrypted credentials', () => {
  const dir = mkdtempSync(join(tmpdir(), 'formabot-locale-'));
  const box = { available: () => true, encrypt: () => Buffer.from('fixture-ciphertext'), decrypt: () => 'fixture' };
  try {
    const store = new SettingsStore(dir, box);
    store.chooseWorkspace('/project/unchanged');
    store.saveModel({ provider: 'deepseek', model: 'fixture', apiKey: 'fixture' });
    const before = JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8'));
    store.setLocale('en');
    const after = JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8'));
    expect(after).toEqual({ ...before, locale: 'en' });
    expect(new SettingsStore(dir, box).view().locale).toBe('en');
    expect(() => store.setLocale('invalid' as 'en')).toThrow();
    expect(store.view().locale).toBe('en');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

it('keeps catalog keys and interpolation placeholders in sync', () => {
  expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort());
  for (const key of Object.keys(zh) as (keyof typeof zh)[]) {
    expect(en[key].match(/\{\w+\}/g) ?? []).toEqual(zh[key].match(/\{\w+\}/g) ?? []);
  }
  setLocale('en');
  expect(t('showConversation', { name: '中文 Bot' })).toBe('Show 中文 Bot');
  setLocale('zh-CN');
});

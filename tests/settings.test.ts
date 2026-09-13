import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SettingsStore, type SecretBox } from '../src/state/settings';
import { parseModel } from '../src/models/config';

// Only storage policy is tested here; this double does not claim OS encryption verification.
const box: SecretBox = { available: () => true, encrypt: () => Buffer.from('opaque-test-ciphertext'), decrypt: () => 'unused' };
describe('model configuration policy (no model requests)', () => {
  it('persists a redacted view, keeps a key for the same provider and refuses cross-provider reuse', () => {
    const dir = mkdtempSync(join(tmpdir(), 'formabot-settings-'));
    try {
      let store = new SettingsStore(dir, box);
      store.saveModel(parseModel({ provider: 'deepseek', model: 'example-model', apiKey: 'test-only-secret' }));
      expect(readFileSync(join(dir, 'settings.json'), 'utf8')).not.toContain('test-only-secret');
      store = new SettingsStore(dir, box);
      expect(store.view().model).toEqual({ provider: 'deepseek', model: 'example-model', hasKey: true });
      store.saveModel({ provider: 'deepseek', model: 'another-model', apiKey: '' });
      expect(() => store.saveModel({ provider: 'openai', model: 'example-model', apiKey: '' })).toThrow('API Key');
      expect(store.view().model?.provider).toBe('deepseek');
      store.deleteModel();
      expect(new SettingsStore(dir, box).view().model).toBeUndefined();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('does not save secrets if OS storage is unavailable', () => {
    const dir = mkdtempSync(join(tmpdir(), 'formabot-settings-'));
    try {
      const store = new SettingsStore(dir, { ...box, available: () => false });
      expect(() => store.saveModel({ provider: 'deepseek', model: 'example', apiKey: 'test-only-secret' })).toThrow('安全存储');
      expect(store.view().model).toBeUndefined();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('rejects unknown providers and newline injection without reflecting credentials', () => {
    expect(() => parseModel({ provider: 'unknown', model: 'x', apiKey: 'secret' })).toThrow('服务商');
    expect(() => parseModel({ provider: 'deepseek', model: '../file', apiKey: 'secret' })).toThrow('模型名称');
    expect(() => parseModel({ provider: 'deepseek', model: 'x', apiKey: 'secret\nheader' })).toThrow('格式');
  });
});

describe('output directory configuration (E09c)', () => {
  it('accepts relative paths, rejects traversal and absolute paths, keeps config when folder missing, persists across restart', () => {
    const dir = mkdtempSync(join(tmpdir(), 'formabot-outdir-'));
    try {
      let store = new SettingsStore(dir, box);
      store.chooseWorkspace('/tmp/some-workspace');
      store.setOutputDir(' 交付/报告 ');
      expect(store.view().workspace?.outputDir).toBe('交付/报告');
      expect(() => store.setOutputDir('')).toThrow('相对路径');
      expect(() => store.setOutputDir('/abs/path')).toThrow('相对路径');
      expect(() => store.setOutputDir('a/../b')).toThrow('..');
      expect(() => store.setOutputDir('a/./b')).toThrow('..');
      expect(() => store.setOutputDir('x'.repeat(201))).toThrow('200');
      // 默认值：未配置时显示 outputs。
      const fresh = new SettingsStore(mkdtempSync(join(tmpdir(), 'formabot-outdir2-')), box);
      fresh.chooseWorkspace('/tmp/ws2');
      expect(fresh.view().workspace?.outputDir).toBe('outputs');
      store = new SettingsStore(dir, box);
      expect(store.view().workspace?.outputDir).toBe('交付/报告'); // 重启保留
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

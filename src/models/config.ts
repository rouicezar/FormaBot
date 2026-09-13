import type { ModelInput, ProviderId } from '../shared/contracts';

export const providers: { id: ProviderId; name: string }[] = [
  { id: 'deepseek', name: 'DeepSeek' }, { id: 'openai', name: 'OpenAI' },
  { id: 'anthropic', name: 'Anthropic' }, { id: 'openrouter', name: 'OpenRouter' },
];
// Presets include the official DeepSeek Vision ID; image-input integration is tracked separately.
export const presets: Record<ProviderId, string[]> = {
  deepseek: ['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-v4-flash-vision-exp'],
  openai: ['gpt-5.6-sol', 'gpt-5.6-luna', 'gpt-5.5'],
  anthropic: ['claude-sonnet-5', 'claude-opus-5', 'claude-haiku-4-5'],
  openrouter: ['deepseek/deepseek-v4-flash', 'openai/gpt-5.5', 'anthropic/claude-sonnet-5'],
};

export function parseModel(value: unknown): ModelInput {
  if (!value || typeof value !== 'object') throw new Error('请填写模型配置。');
  const v = value as Record<string, unknown>;
  if (!providers.some(p => p.id === v.provider)) throw new Error('请选择支持的服务商。');
  if (typeof v.model !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:/+-]{0,159}$/.test(v.model)) throw new Error('模型名称无效。');
  if (typeof v.apiKey !== 'string' || v.apiKey.length > 8192 || /[\r\n\0]/.test(v.apiKey)) throw new Error('API Key 格式无效。');
  return { provider: v.provider as ProviderId, model: v.model, apiKey: v.apiKey.trim() };
}

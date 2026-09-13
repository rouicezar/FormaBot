import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ModelInput, ModelView, WorkspaceView } from '../shared/contracts';

export interface SecretBox { available(): boolean; encrypt(value: string): Buffer; decrypt(value: Buffer): string }
interface Settings { version: 1; locale?: 'en' | 'zh-CN'; catalog?:string; model?: ModelView & { secret: string }; workspace?: WorkspaceView & { outputDir?: string } }

export class SettingsStore {
  private data: Settings;
  private file: string;
  constructor(directory: string, private box: SecretBox) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.file = join(directory, 'settings.json');
    try {
      this.data = JSON.parse(readFileSync(this.file, 'utf8'));
      if (this.data.version !== 1) throw new Error('配置版本不兼容。');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('无法读取配置文件，请保留文件以便修复。');
      this.data = { version: 1 };
    }
  }
  view() {
    const model = this.data.model;
    return { locale:this.data.locale, catalog:this.data.catalog??this.data.workspace?.path, model: model ? { provider: model.provider, model: model.model, hasKey: !!model.secret } : undefined, workspace: this.data.workspace ? { ...this.data.workspace, outputDir: this.data.workspace.outputDir ?? 'outputs' } : undefined };
  }
  setLocale(locale: 'en' | 'zh-CN') {
    if (locale !== 'en' && locale !== 'zh-CN') throw new Error('Unsupported language');
    this.persist({ ...this.data, locale });
  }
  // E09c：空间内产出文件夹。相对路径，禁绝对路径与 .. 穿越；文件夹失效保留配置（写入时按需创建）。
  setOutputDir(value: string) {
    if (!this.data.workspace) throw new Error('请先选择工作空间。');
    const dir = value.trim().replace(/\\/g, '/');
    if (!dir || dir.length > 200) throw new Error('产出文件夹路径需为 1–200 字符的相对路径。');
    if (dir.startsWith('/') || /^[a-zA-Z]:/.test(dir)) throw new Error('产出文件夹必须是工作空间内的相对路径。');
    const segments = dir.split('/').filter(Boolean);
    if (segments.some(s => s === '.' || s === '..' || /[\0]/.test(s))) throw new Error('产出文件夹路径不能包含 .、.. 或空字符。');
    this.persist({ ...this.data, workspace: { ...this.data.workspace, outputDir: segments.join('/') } });
  }
  saveModel(input: ModelInput) {
    if (!this.box.available()) throw new Error('系统安全存储不可用，无法保存 API Key。');
    const previous = this.data.model;
    if (!input.apiKey && (!previous?.secret || previous.provider !== input.provider)) throw new Error('请填写此服务商的 API Key。');
    const secret = input.apiKey ? this.box.encrypt(input.apiKey).toString('base64') : previous!.secret;
    this.persist({ ...this.data, model: { provider: input.provider, model: input.model, hasKey: true, secret } });
  }
  deleteModel() { this.persist({ ...this.data, model: undefined }); }
  modelForExecution() {
    const m=this.data.model;
    if(!m?.secret)throw new Error('请先在 App 中保存模型配置。');
    if(!this.box.available())throw new Error('系统密钥存储暂不可用；已保存配置仍保留。');
    return {provider:m.provider,model:m.model,key:this.box.decrypt(Buffer.from(m.secret,'base64'))};
  }
  chooseWorkspace(path: string) { this.persist({ ...this.data, catalog:this.data.catalog??this.data.workspace?.path??path, workspace: { path, authorized: false, outputDir:this.data.workspace?.outputDir??'outputs' } }); }
  forgetWorkspace(){this.persist({...this.data,workspace:undefined});}
  private persist(next: Settings) {
    const temp = `${this.file}.tmp`;
    writeFileSync(temp, JSON.stringify(next), { mode: 0o600 });
    renameSync(temp, this.file);
    this.data = next;
  }
}

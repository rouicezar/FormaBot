import { BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';

// E03b-3/R31：敏感值（如网页密码）由用户在模态安全输入框中亲自填写；
// 值只经内存注入目标页面，不进入对话、工具事件或模型上下文。
export function securePrompt(parent: BrowserWindow, message: string): Promise<string | null> {
  return new Promise(resolve => {
    let settled = false;
    const finish = (value: string | null) => { if (!settled) { settled = true; ipcMain.removeListener('secure-prompt-value', onValue); win.destroy(); resolve(value); } };
    const onValue = (_event: Electron.IpcMainEvent, value: string | null) => finish(value);
    ipcMain.on('secure-prompt-value', onValue);
    const win = new BrowserWindow({ width: 460, height: 240, parent, modal: true, show: false, title: '安全输入', webPreferences: { preload: join(__dirname, 'secure-prompt-preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true } });
    win.on('closed', () => finish(null));
    win.loadFile(join(__dirname, 'secure-prompt.html'), { hash: encodeURIComponent(message) }).then(() => win.show());
  });
}

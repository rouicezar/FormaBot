import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('forma', { secureSubmit: (value: string | null) => ipcRenderer.send('secure-prompt-value', value) });

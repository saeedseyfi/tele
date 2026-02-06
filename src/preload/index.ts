import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  close: () => ipcRenderer.send('close'),
  moveBy: (dx: number, dy: number) => ipcRenderer.send('move-by', dx, dy),
  resize: (h: number) => ipcRenderer.send('resize', h),
  openSettings: () => ipcRenderer.send('open-settings'),
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config: unknown) => ipcRenderer.invoke('save-config', config),
  onMedia: (cb: (action: string) => void) => {
    ipcRenderer.on('media', (_e, action) => cb(action));
  },
  onConfigChanged: (cb: (config: unknown) => void) => {
    ipcRenderer.on('config-changed', (_e, config) => cb(config));
  },
  onStuckTop: (cb: (stuck: boolean) => void) => {
    ipcRenderer.on('stuck-top', (_e, stuck) => cb(stuck));
  },
  onMenuBarColor: (cb: (color: string, isLight: boolean) => void) => {
    ipcRenderer.on('menu-bar-color', (_e, color, isLight) => cb(color, isLight));
  },
});

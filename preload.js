const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronForAll', {
  minimize: () => ipcRenderer.send('window:minimize'),
  toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
  close: () => ipcRenderer.send('window:close'),
  onMaximizeChange: (callback) => {
    ipcRenderer.on('window:maximized', (event, isMaximized) => callback(isMaximized));
  }
});

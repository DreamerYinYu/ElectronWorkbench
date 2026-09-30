const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 500,
    frame: false,
    title: 'ElectronForAll',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('index.html');

  // 窗口最大化/还原时，通知渲染进程同步图标
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window:maximized', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window:maximized', false);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 去掉默认应用菜单栏
Menu.setApplicationMenu(null);

app.whenReady().then(() => {
  createWindow();

  // IPC：窗口控制
  ipcMain.on('window:minimize', () => {
    if (mainWindow) {
      mainWindow.minimize();
    }
  });
  ipcMain.on('window:toggle-maximize', () => {
    if (!mainWindow) {
      return;
    }
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });
  ipcMain.on('window:close', () => {
    if (mainWindow) {
      mainWindow.close();
    }
  });

  // macOS：点击 Dock 图标且没有窗口时，重新创建一个窗口
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Windows / Linux：所有窗口都关闭时退出应用
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

import { app, BrowserWindow, Menu, ipcMain, protocol, net, Tray } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { registerProjectIpc } from './ipc/project'
import { registerFsIpc } from './ipc/fs'
import { registerTodoIpc } from './ipc/todo'
import { registerArchiveIpc } from './ipc/archive'
import { registerAppIpc } from './ipc/app'
import { validatePath } from './paths'
import { loadState, saveState } from './state'
import { appearanceArgs } from './appSettings'
import { appIconPath, iconIcoPath } from './resources'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

// workbench 协议需支持 CORS，才能让 <video> 跨源加载并 canvas 截帧不污染
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'workbench',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
  }
])

// 禁用硬件加速：避免无 GPU/远程桌面等环境下 GPU 进程崩溃
app.disableHardwareAcceleration()
app.commandLine.appendSwitch('disable-gpu')
app.commandLine.appendSwitch('disable-gpu-compositing')
app.commandLine.appendSwitch('in-process-gpu')
// 禁用 overlay 滚动条，让 ::-webkit-scrollbar 自定义宽度生效（否则 Windows 下滚动条宽度不可控）
app.commandLine.appendSwitch('disable-features', 'OverlayScrollbar')

// 注册 workbench:// 协议：让渲染层加载本地文件（图片/视频缩略图），带路径校验
function registerProtocol(): void {
  protocol.handle('workbench', (request) => {
    try {
      const url = new URL(request.url)
      const filePath = decodeURIComponent(url.pathname.slice(1))
      validatePath(filePath)
      return net.fetch(pathToFileURL(filePath).toString())
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}

function createWindow(): void {
  const ws = loadState().window
  mainWindow = new BrowserWindow({
    width: ws.width,
    height: ws.height,
    x: ws.x,
    y: ws.y,
    minWidth: 1160,
    minHeight: 680,
    frame: false,
    title: 'Workbench',
    backgroundColor: '#f4f5f7',
    icon: appIconPath(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      additionalArguments: appearanceArgs()
    }
  })
  if (ws.maximized) mainWindow.maximize()

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // 持久化窗口大小/位置/最大化（resize/move 用防抖，最大化/关闭立即保存）
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  const persistWindow = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    const maximized = mainWindow.isMaximized()
    const bounds = maximized ? mainWindow.getNormalBounds() : mainWindow.getBounds()
    const state = loadState()
    state.window = {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      maximized
    }
    saveState(state)
  }
  const debouncedPersist = () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(persistWindow, 500)
  }

  mainWindow.on('resize', debouncedPersist)
  mainWindow.on('move', debouncedPersist)
  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:maximized', true)
    persistWindow()
  })
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:maximized', false)
    persistWindow()
  })
  mainWindow.on('close', (e) => {
    // 托盘常驻：非退出流程下，关闭窗口时隐藏到托盘
    if (!isQuitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
    persistWindow()
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

/** 显示并聚焦主窗口（窗口被隐藏到托盘后重新打开用） */
function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

/** 创建系统托盘：左键单击打开主窗口，右键菜单打开/退出 */
function createTray(): void {
  tray = new Tray(iconIcoPath())
  tray.setToolTip('Workbench')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '打开 Workbench', click: () => showMainWindow() },
      { type: 'separator' },
      {
        label: '退出 Workbench',
        click: () => {
          isQuitting = true
          app.quit()
        }
      }
    ])
  )
  tray.on('click', () => showMainWindow())
}

Menu.setApplicationMenu(null)

app.whenReady().then(() => {
  registerProtocol()
  registerProjectIpc()
  registerFsIpc()
  registerTodoIpc()
  registerArchiveIpc()
  registerAppIpc()

  createWindow()
  createTray()

  ipcMain.on('window:minimize', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.minimize()
  })
  ipcMain.on('window:toggle-maximize', (e) => {
    const w = BrowserWindow.fromWebContents(e.sender)
    if (!w) return
    if (w.isMaximized()) w.unmaximize()
    else w.maximize()
  })
  ipcMain.on('window:close', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

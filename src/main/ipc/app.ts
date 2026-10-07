import { ipcMain, BrowserWindow, dialog, app, shell } from 'electron'
import type { OpenDialogOptions } from 'electron'
import { join, basename } from 'path'
import { readFileSync, existsSync, statfsSync } from 'fs'
import os from 'os'
import { loadAppSettings, saveAppSettings, resolveDefaultProjectsDir, appearanceArgs } from '../appSettings'
import type { AppSettings } from '../appSettings'
import { loadState, saveState } from '../state'
import type { UiState } from '../state'
import { appIconPath } from '../resources'
import { readWallpaper, getSystemBootTime } from '../platform'
import { loadSection, saveSection, resetAll } from '../store'
import type { DesktopLayout } from '../types'
import { loadProjects } from '../config'
import { readTodos } from '../projectFiles'
import { scheduleWorkReminder, hideToastWindow, setToastInteractive } from '../reminder'
import { applyMotto, previewMotto } from '../motto'

let settingsWindow: BrowserWindow | null = null
let previewWindow: BrowserWindow | null = null
let currentPreviewPath = ''
let previewDirty = false
let previewForceClose = false

export function openSettingsWindow(tab?: string): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    if (tab) settingsWindow.webContents.send('settings:switchTab', tab)
    settingsWindow.focus()
    return
  }
  settingsWindow = new BrowserWindow({
    width: 860,
    height: 600,
    minWidth: 760,
    minHeight: 520,
    frame: false,
    title: '设置',
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

  const hash = tab ? `settings/${tab}` : 'settings'
  if (process.env['ELECTRON_RENDERER_URL']) {
    settingsWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '#' + hash)
  } else {
    settingsWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash })
  }

  settingsWindow.on('maximize', () => settingsWindow?.webContents.send('window:maximized', true))
  settingsWindow.on('unmaximize', () => settingsWindow?.webContents.send('window:maximized', false))
  settingsWindow.on('closed', () => {
    settingsWindow = null
  })
}

function openPreviewWindow(filePath: string): void {
  currentPreviewPath = filePath
  previewDirty = false
  previewForceClose = false
  if (previewWindow && !previewWindow.isDestroyed()) {
    previewWindow.setTitle(basename(filePath))
    previewWindow.focus()
    previewWindow.webContents.send('preview:fileChanged', filePath)
    return
  }
  previewWindow = new BrowserWindow({
    width: 1000,
    height: 720,
    minWidth: 680,
    minHeight: 460,
    frame: false,
    title: basename(filePath),
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

  if (process.env['ELECTRON_RENDERER_URL']) {
    previewWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '#preview')
  } else {
    previewWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'preview' })
  }

  previewWindow.on('maximize', () => previewWindow?.webContents.send('window:maximized', true))
  previewWindow.on('unmaximize', () => previewWindow?.webContents.send('window:maximized', false))
  // 有未保存修改时，拦截关闭，通知渲染层弹自研确认框（保存 / 不保存 / 取消）
  previewWindow.on('close', (e) => {
    if (!previewDirty || previewForceClose) {
      previewForceClose = false
      return
    }
    e.preventDefault()
    previewWindow?.webContents.send('preview:confirmClose')
  })
  previewWindow.on('closed', () => {
    previewWindow = null
  })
}

export function registerAppIpc(): void {
  // 启动时同步开机自启状态到系统，确保设置与系统一致
  // 注意：未打包（dev）时 electron.exe 无法作为自启目标，强制不注册，否则重启后会弹出 electron 报错窗口
  app.setLoginItemSettings({ openAtLogin: app.isPackaged && loadAppSettings().autoStart })

  // 系统桌面目录路径（侧边栏「桌面」入口浏览用）
  ipcMain.handle('app:getDesktopPath', (): string => {
    return app.getPath('desktop')
  })

  // 系统桌面壁纸（Windows 读注册表转 dataURL；macOS 暂不支持返回 null，前端用默认背景）
  ipcMain.handle('app:getWallpaper', (): string | null => {
    return readWallpaper()
  })

  // 桌面布局（分页/小组件/Dock 钉选）读取；从未保存过时返回 null，渲染层据此预置默认小组件
  ipcMain.handle('desktop:getLayout', (): DesktopLayout | null => {
    return (loadSection('desktop') as DesktopLayout | null) ?? null
  })

  // 桌面布局保存（拖拽/增删小组件/编辑 Dock 后持久化）
  ipcMain.handle('desktop:saveLayout', (_e, layout: DesktopLayout): void => {
    saveSection('desktop', layout)
  })

  // 系统状态小组件：内存占用 + 应用数据盘磁盘空间
  ipcMain.handle('desktop:getSystemInfo', () => {
    const totalMem = os.totalmem()
    const freeMem = os.freemem()
    let disk = { total: 0, free: 0 }
    try {
      const s = statfsSync(app.getPath('appData'))
      disk = { total: s.bsize * s.blocks, free: s.bsize * s.bavail }
    } catch {
      // statfs 不可用时磁盘返回 0
    }
    return { mem: { used: totalMem - freeMem, total: totalMem }, disk }
  })

  // 待办小组件：所有项目未完成待办（按项目名分组，最多取 6 条）
  ipcMain.handle('desktop:getTodos', () => {
    const projects = loadProjects()
    const items: { project: string; title: string }[] = []
    for (const p of projects) {
      for (const t of readTodos(p.path)) {
        if (!t.completed) items.push({ project: p.name, title: t.title })
      }
    }
    return items.slice(0, 6)
  })

  // 应用图标（icon.png）转 base64 dataURL，标题栏 logo 展示用
  ipcMain.handle('app:getAppIcon', (): string => {
    try {
      const iconPath = appIconPath()
      if (!existsSync(iconPath)) return ''
      return `data:image/png;base64,${readFileSync(iconPath).toString('base64')}`
    } catch {
      return ''
    }
  })

  // 系统开机时间 + 已运行时长（设置面板「工作时长提醒」展示 + 计时用）
  ipcMain.handle('app:getBootInfo', (): { bootTime: number; uptimeMs: number } => {
    const bootTime = getSystemBootTime()
    return { bootTime, uptimeMs: Date.now() - bootTime }
  })

  ipcMain.handle('app:getDefaultProjectsDir', () => {
    // 优先用设置里保存的项目文件夹，未设置时才回退到文档目录
    const s = loadAppSettings()
    return s.projectsFolder || resolveDefaultProjectsDir()
  })

  // 软件本地数据路径（设置面板展示用）：配置目录 + 项目文件夹
  ipcMain.handle('app:getDataPaths', () => {
    const s = loadAppSettings()
    return {
      configDir: join(app.getPath('appData'), 'Workbench'),
      projectsFolder: s.projectsFolder || resolveDefaultProjectsDir()
    }
  })

  // 打开任意本地路径（文件或文件夹），不做项目内越界校验（用于打开配置/项目目录）
  ipcMain.handle('app:openPath', (_e, target: string): Promise<string> => {
    return shell.openPath(target)
  })

  ipcMain.handle('state:getUi', () => loadState().ui)

  ipcMain.handle('state:saveUi', (_e, ui: UiState) => {
    const state = loadState()
    state.ui = ui
    saveState(state)
  })

  ipcMain.handle('app:openSettings', (_e, tab?: string) => {
    openSettingsWindow(tab)
  })

  // 清除全部缓存数据：清空 workbench.json（settings/projects/ui/window/desktop），恢复默认；
  // 同步关闭开机自启，然后 reload 所有窗口让其重新按默认加载
  ipcMain.handle('app:resetAllData', (): void => {
    resetAll()
    app.setLoginItemSettings({ openAtLogin: false })
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.reload()
    }
  })

  ipcMain.handle('app:getSettings', () => {
    const s = loadAppSettings()
    if (!s.projectsFolder) {
      s.projectsFolder = resolveDefaultProjectsDir()
    }
    return s
  })

  ipcMain.handle('app:saveSettings', (_e, settings: AppSettings) => {
    const prev = loadAppSettings()
    saveAppSettings(settings)

    // 开机自启：仅当该字段变化时同步到系统（写注册表/登录项）；未打包（dev）时不注册，避免 electron.exe 被写入登录项
    if (prev.autoStart !== settings.autoStart) {
      app.setLoginItemSettings({ openAtLogin: app.isPackaged && settings.autoStart })
    }
    // 工作时长提醒：仅当提醒配置变化时重新调度计时器
    if (
      prev.workReminder.enabled !== settings.workReminder.enabled ||
      prev.workReminder.hours !== settings.workReminder.hours ||
      prev.workReminder.message !== settings.workReminder.message
    ) {
      scheduleWorkReminder()
    }
    // 座右铭：仅当座右铭配置变化时同步座右铭窗口（保存时正式应用；实时预览走 previewMotto）
    if (JSON.stringify(prev.motto) !== JSON.stringify(settings.motto)) {
      applyMotto()
    }
    // 外观（主题/字号）：仅当变化时广播，主窗口 applyAppearance 同步
    if (prev.theme !== settings.theme || prev.fontSize !== settings.fontSize) {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('appearance:changed', settings)
      }
    }
    // 文件隐藏项：仅当变化时通知主窗口刷新文件列表（fs:changed 复用现有刷新通道）
    if (JSON.stringify(prev.hiddenItems) !== JSON.stringify(settings.hiddenItems)) {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('fs:changed')
      }
    }
  })

  // 座右铭实时预览：更新桌面窗口但不持久化（取消时由渲染层传回原值）
  ipcMain.handle('motto:preview', (_e, motto: unknown) => {
    previewMotto(motto as Parameters<typeof previewMotto>[0])
  })

  // 所有 toast 关闭后隐藏通知窗口
  ipcMain.handle('toast:close', () => {
    hideToastWindow()
  })

  // 动态切换 toast 窗口鼠标穿透（渲染层 mousemove 判断鼠标是否在卡片上）
  ipcMain.handle('toast:interactive', (_e, interactive: boolean) => {
    setToastInteractive(interactive)
  })

  ipcMain.handle('dialog:selectDirectory', async (e): Promise<string | null> => {
    const parent = BrowserWindow.fromWebContents(e.sender)
    const options: OpenDialogOptions = {
      title: '选择外部文件夹',
      properties: ['openDirectory', 'createDirectory']
    }
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('preview:open', (_e, filePath: string) => {
    openPreviewWindow(filePath)
  })

  ipcMain.handle('preview:getFile', () => currentPreviewPath)

  ipcMain.handle('preview:setDirty', (_e, dirty: boolean) => {
    previewDirty = dirty
  })

  // 渲染层确认对话框「保存 / 不保存」后，强制关闭预览窗口（绕过 close 拦截）
  ipcMain.handle('preview:forceClose', () => {
    previewDirty = false
    previewForceClose = true
    previewWindow?.close()
  })
}

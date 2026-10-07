import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { loadAppSettings, appearanceArgs } from './appSettings'
import { getSystemBootTime } from './platform'

let timer: ReturnType<typeof setTimeout> | null = null
let toastWindow: BrowserWindow | null = null

/**
 * 显示通知：屏幕右下角自绘小窗（图标 + 程序名 + 文案）。
 * 不用系统 toast——Windows 通知中心缓存 AUMID 信息，显示名/图标改不过来；
 * 自绘窗口图标/名字/字号全可控，且窗口隐藏到托盘时照常弹出。
 */
function showNotification(title: string, body: string): void {
  // 已有通知窗：直接换内容
  if (toastWindow && !toastWindow.isDestroyed()) {
    toastWindow.webContents.send('toast:data', { title, body })
    return
  }
  const { workArea } = screen.getPrimaryDisplay()
  const W = 380
  const H = 180
  toastWindow = new BrowserWindow({
    width: W,
    height: H,
    // 窗口右/下边缘贴屏幕工作区，卡片由渲染层的 padding 内缩，保证内容+阴影不被裁
    x: workArea.x + workArea.width - W,
    y: workArea.y + workArea.height - H,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments: appearanceArgs()
    }
  })
  toastWindow.setAlwaysOnTop(true, 'screen-saver')
  toastWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'toast' })
  // transparent 窗口的 ready-to-show 不可靠，改用 did-finish-load 再显示并注入内容
  toastWindow.webContents.once('did-finish-load', () => {
    toastWindow?.showInactive()
    toastWindow?.webContents.send('toast:data', { title, body })
  })
  toastWindow.on('closed', () => {
    toastWindow = null
  })
}

/**
 * 调度工作时长提醒：从电脑本次开机起计时，满 workReminder.hours 小时后弹一次通知。
 * 设置变更（开关/时长/文案）后重新调用本函数即可重排定时器。
 */
export function scheduleWorkReminder(): void {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  const r = loadAppSettings().workReminder
  if (!r.enabled) return
  const bootTime = getSystemBootTime()
  const elapsed = Date.now() - bootTime
  const target = Math.max(1, r.hours) * 3600 * 1000
  const delay = Math.max(0, target - elapsed)
  timer = setTimeout(() => {
    const cur = loadAppSettings().workReminder
    if (!cur.enabled) return
    showNotification('休息提醒', cur.message || '工作满 8 小时，注意休息')
  }, delay)
}

/** 启动欢迎通知 */
export function showWelcomeNotification(): void {
  showNotification('欢迎你再次回来！', '')
}

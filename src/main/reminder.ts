import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { loadAppSettings, appearanceArgs } from './appSettings'
import { getSystemBootTime } from './platform'

let timer: ReturnType<typeof setTimeout> | null = null
let toastWindow: BrowserWindow | null = null

const TOAST_W = 380

/**
 * 显示通知：屏幕右下角自绘小窗（图标 + 程序名 + 文案），多条纵向堆叠、不自动关闭。
 * 不用系统 toast——Windows 通知中心缓存 AUMID 信息，显示名/图标改不过来；
 * 自绘窗口图标/名字/字号全可控，且窗口隐藏到托盘时照常弹出。
 *
 * 窗口高度固定为屏幕工作区高度（不再动态 resize）：内容贴底堆叠、空白区域鼠标穿透，
 * 从根上避免「测量 → setBounds 异步 → 裁剪/抖动」的时序问题。
 */
function showNotification(title: string, body: string): void {
  if (toastWindow && !toastWindow.isDestroyed()) {
    if (!toastWindow.isVisible()) toastWindow.showInactive()
    toastWindow.webContents.send('toast:data', { title, body })
    return
  }
  const { workArea } = screen.getPrimaryDisplay()
  toastWindow = new BrowserWindow({
    width: TOAST_W,
    height: workArea.height,
    // 铺满主屏工作区右缘：内容贴底堆叠，上方空白由渲染层 pointer-events 穿透
    x: workArea.x + workArea.width - TOAST_W,
    y: workArea.y,
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
      additionalArguments: appearanceArgs('toast')
    }
  })
  toastWindow.setAlwaysOnTop(true, 'screen-saver')
  // 鼠标穿透空白区（forward 让卡片上的 hover/close 正常响应）；窗口大小固定，无裁剪无抖动
  toastWindow.setIgnoreMouseEvents(true, { forward: true })
  toastWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'toast' })
  // transparent 窗口的 ready-to-show 不可靠，改用 did-finish-load 后注入数据；窗口高度固定、内容永不裁剪，可立即显示
  toastWindow.webContents.once('did-finish-load', () => {
    toastWindow?.showInactive()
    toastWindow?.webContents.send('toast:data', { title, body })
  })
  toastWindow.on('closed', () => {
    toastWindow = null
  })
}

/** 所有 toast 关闭后隐藏窗口（保留复用，下次通知再 show） */
export function hideToastWindow(): void {
  if (toastWindow && !toastWindow.isDestroyed()) toastWindow.hide()
}

/**
 * 动态切换鼠标穿透：interactive=true 时窗口可交互（卡片能点关闭），false 时整窗穿透。
 * 由渲染层 mousemove 判断鼠标是否在卡片上后调用——forward:true 只转发 mouse move、不转发 click，
 * 所以不能靠「整体 ignore + CSS pointer-events」静态实现点击，必须鼠标悬停卡片时动态取消穿透。
 */
export function setToastInteractive(interactive: boolean): void {
  if (!toastWindow || toastWindow.isDestroyed()) return
  toastWindow.setIgnoreMouseEvents(!interactive, { forward: true })
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

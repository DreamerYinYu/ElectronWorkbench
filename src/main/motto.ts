import { BrowserWindow, screen, app } from 'electron'
import { join } from 'path'
import { writeFileSync } from 'fs'
import { spawn } from 'child_process'
import { loadAppSettings, appearanceArgs } from './appSettings'
import type { Motto } from './appSettings'

let mottoWindow: BrowserWindow | null = null

function getHwnd(win: BrowserWindow): string {
  const buf = win.getNativeWindowHandle()
  return (process.arch === 'x64' ? buf.readBigUInt64LE(0) : buf.readUInt32LE(0)).toString()
}

/**
 * 把座右铭窗口置底到桌面层级（紧贴壁纸上方、所有应用窗口之下）。
 * Windows：SetWindowPos(HWND_BOTTOM)，约 2.5 秒内做 3 次（防 Chromium 在 focus/blur 时提回窗口）。
 * macOS：win.setLevel 设 desktop 层级（kCGDesktopWindowLevel，待 Mac 真机验证）。
 */
function sendToBottom(win: BrowserWindow): Promise<void> {
  if (process.platform === 'darwin') {
    // macOS：Electron 44 已移除 setLevel API，无法内置设 desktop 层级。
    // 置底需原生方案（NSWindow level / CGWindowLevel），待 Mac 真机/CI 时实现。
    // 当前降级为普通层级窗口：透明/穿透/主屏/文字均正常，仅不置底（不崩）。
    return Promise.resolve()
  }
  if (process.platform !== 'win32') {
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    const ps1 = join(app.getPath('appData'), 'Workbench', 'motto-bottom.ps1')
    const script = [
      "Add-Type -TypeDefinition @'\nusing System;\nusing System.Runtime.InteropServices;\npublic class WbBottom {\n  [DllImport(\"user32.dll\")]\n  public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);\n}\n'@",
      `$h = [IntPtr]${getHwnd(win)}`,
      '# HWND_BOTTOM=1，SWP_NOSIZE(0x1)|SWP_NOMOVE(0x2)|SWP_NOACTIVATE(0x10)=0x13',
      '[WbBottom]::SetWindowPos($h, [IntPtr]1, 0, 0, 0, 0, 0x13) | Out-Null',
      'Start-Sleep -Milliseconds 800',
      '[WbBottom]::SetWindowPos($h, [IntPtr]1, 0, 0, 0, 0, 0x13) | Out-Null',
      'Start-Sleep -Milliseconds 1500',
      '[WbBottom]::SetWindowPos($h, [IntPtr]1, 0, 0, 0, 0, 0x13) | Out-Null'
    ].join('\r\n')
    try {
      writeFileSync(ps1, '\ufeff' + script, 'utf-8')
    } catch {
      resolve()
      return
    }
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1], {
      windowsHide: true
    })
    child.on('error', () => resolve())
    child.on('close', () => resolve())
  })
}

/**
 * 显示/更新座右铭窗口（用传入的 motto，不读配置、不持久化）。
 * 文字非空则创建/更新透明窗口，空则关闭。供 applyMotto（正式）与 previewMotto（实时预览）共用。
 */
function showMottoWindow(motto: Motto): void {
  const text = (motto?.text ?? '').trim()
  if (!text) {
    if (mottoWindow && !mottoWindow.isDestroyed()) mottoWindow.close()
    mottoWindow = null
    return
  }
  if (mottoWindow && !mottoWindow.isDestroyed()) {
    mottoWindow.webContents.send('motto:update', motto)
    return
  }
  const { workArea } = screen.getPrimaryDisplay()
  // 窗口直接铺满主屏工作区：透明 + 事件穿透 + 置底，大小无所谓，文字由渲染层 flex 居中，
  // 避免「先粗估高度再测量 resize」导致的二次跳动。启动即铺满、无抖动。
  const win = new BrowserWindow({
    width: workArea.width,
    height: workArea.height,
    x: workArea.x,
    y: workArea.y,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: false,
      backgroundColor: '#00000000',
      additionalArguments: appearanceArgs()
    }
  })
  win.setIgnoreMouseEvents(true)
  win.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'motto' })
  win.webContents.once('did-finish-load', () => {
    if (win.isDestroyed()) return
    win.webContents.send('motto:update', motto)
    // 用 show() 激活显示（保证透明），稍后失焦还焦点，再压到 Z 序底部
    win.show()
    setTimeout(() => {
      if (win.isDestroyed()) return
      win.blur()
      void sendToBottom(win)
    }, 300)
  })
  win.on('closed', () => {
    mottoWindow = null
  })
  mottoWindow = win
}

/**
 * 应用座右铭：文字非空则创建/更新透明窗口（仅主屏、事件穿透、Z 序置底），空则关闭。
 * 关键：用 show() 激活显示（showInactive 会首帧白底），显示后 blur 失焦还焦点，
 * 再 SetWindowPos(HWND_BOTTOM) 压到 Z 序底部。透明依赖 GPU 合成。
 */
export function applyMotto(): void {
  showMottoWindow(loadAppSettings().motto)
}

/** 实时预览座右铭：用传入的 motto 更新窗口内容，但不持久化到配置（取消时由调用方恢复原值） */
export function previewMotto(motto: Motto): void {
  showMottoWindow(motto)
}

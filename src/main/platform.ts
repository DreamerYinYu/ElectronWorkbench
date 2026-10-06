import { app, shell } from 'electron'
import { join, dirname } from 'path'
import { existsSync, readFileSync } from 'fs'
import { writeFile } from 'fs/promises'
import { spawn, spawnSync } from 'child_process'
import type { FileEntry } from './types'

/** 平台判断 */
export const isWindows = process.platform === 'win32'

// ==================== 平台能力抽象 ====================
// 把 Windows 专属能力（.lnk 快捷方式、reg 注册表、PowerShell 图标提取、公共桌面、
// 桌面虚拟图标）收拢到此模块；macOS 走降级实现，保证跨平台不崩、逻辑清晰。

/** 托盘图标：Windows 用 ico（DPI 自适应），macOS 用 png */
export function trayIconPath(): string {
  return join(app.getAppPath(), isWindows ? 'resources/icon.ico' : 'resources/icon.png')
}

/** 真实桌面目录列表：Windows = 用户桌面 + 公共桌面；macOS = 用户桌面 */
export function desktopDirs(): string[] {
  const user = app.getPath('desktop')
  if (!isWindows) return [user]
  const publicRoot = process.env.PUBLIC || join(dirname(dirname(user)), 'Public')
  return [user, join(publicRoot, 'Desktop')]
}

/** 读取系统壁纸（Windows 读注册表转 dataURL；macOS 暂不支持返回 null） */
export function readWallpaper(): string | null {
  if (!isWindows) return null
  try {
    const out = spawnSync('reg', ['query', 'HKCU\\Control Panel\\Desktop', '/v', 'Wallpaper'], { encoding: 'utf-8' })
    const m = out.stdout.match(/Wallpaper\s+REG_SZ\s+(.+)/)
    if (!m) return null
    const wallpaperPath = m[1].trim()
    if (!wallpaperPath || !existsSync(wallpaperPath)) return null
    const ext = wallpaperPath.slice(wallpaperPath.lastIndexOf('.') + 1).toLowerCase()
    const mime = ext === 'png' ? 'image/png' : ext === 'bmp' ? 'image/bmp' : 'image/jpeg'
    return `data:${mime};base64,${readFileSync(wallpaperPath).toString('base64')}`
  } catch {
    return null
  }
}

/** 桌面虚拟图标（此电脑/回收站）：Windows 命名空间对象，macOS 无 */
export function desktopVirtualItems(): FileEntry[] {
  if (!isWindows) return []
  return [
    {
      name: '此电脑',
      type: 'file',
      virtual: true,
      shellPath: '::{20D04FE0-3AEA-1069-A2D8-08002B30309D}',
      size: 0,
      mtime: 0,
      ext: ''
    },
    {
      name: '回收站',
      type: 'file',
      virtual: true,
      shellPath: '::{645FF040-5081-101B-9F08-00AA002F954E}',
      size: 0,
      mtime: 0,
      ext: ''
    }
  ]
}

/** 解析快捷方式目标路径（Windows .lnk；macOS 无快捷方式返回空串） */
export function readShortcutTarget(lnkPath: string): string {
  if (!isWindows) return ''
  try {
    return shell.readShortcutLink(lnkPath).target || ''
  } catch {
    return ''
  }
}

/** 桌面虚拟图标的可见性缓存（系统「桌面图标设置」不常变） */
let visibilityCache: { thisPc: boolean; recycleBin: boolean } | null = null

/**
 * 桌面虚拟图标可见性：Windows 读注册表 HideDesktopIcons（值名带花括号的 CLSID，
 * 仅明确 0x1 才隐藏）；macOS 无此电脑/回收站概念，返回都隐藏。
 */
export function desktopIconsVisibility(): { thisPc: boolean; recycleBin: boolean } {
  if (!isWindows) return { thisPc: false, recycleBin: false }
  if (visibilityCache) return visibilityCache
  const result = { thisPc: true, recycleBin: true }
  try {
    const key = 'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\HideDesktopIcons\\NewStartPanel'
    const query = (clsid: string): boolean => {
      const out = spawnSync('reg', ['query', key, '/v', clsid], { encoding: 'utf-8' })
      // 仅当明确读到 0x1 时才隐藏，其余（0x0、值不存在、查询失败）都显示
      if (out.status === 0 && /0x1\b/.test(out.stdout)) return false
      return true
    }
    result.thisPc = query('{20D04FE0-3AEA-1069-A2D8-08002B30309D}')
    result.recycleBin = query('{645FF040-5081-101B-9F08-00AA002F954E}')
  } catch {
    // 读注册表失败：都显示
  }
  visibilityCache = result
  return result
}

/**
 * 批量提取文件真实图标到 PNG 文件（items：src=源文件、out=输出 PNG 路径）。
 * Windows：PowerShell SHDefExtractIcon（直接读 PE 资源，不经过 Shell 图标缓存，256px）；
 * macOS：逐个 app.getFileIcon 保存 PNG。
 */
export async function extractIconsToFiles(items: { src: string; out: string }[]): Promise<void> {
  if (isWindows) {
    await extractIconsViaPowerShell(items)
    return
  }
  for (const it of items) {
    try {
      const icon = await app.getFileIcon(it.src, { size: 'large' })
      if (!icon.isEmpty()) {
        await writeFile(it.out, icon.toPNG())
      }
    } catch {
      // 提取失败跳过，交由调用方回退默认图标
    }
  }
}

/** Windows：PowerShell 批量提取（SHDefExtractIcon 256px，失败回退 32px） */
async function extractIconsViaPowerShell(items: { src: string; out: string }[]): Promise<void> {
  if (items.length === 0) return
  const ps1 = join(app.getPath('appData'), 'Workbench', 'iconcache', 'extract.ps1')
  // C# P/Invoke 定义放进单引号 here-string（字面量，不插值）；ps1 写 UTF-8 BOM 防中文路径乱码
  const header = [
    'Add-Type -AssemblyName System.Drawing',
    "Add-Type -TypeDefinition @'\nusing System;\nusing System.Runtime.InteropServices;\npublic class WbIcon {\n  [DllImport(\"shell32.dll\", CharSet=CharSet.Unicode)]\n  public static extern int SHDefExtractIcon(string file, int index, uint flags, out IntPtr large, out IntPtr small, uint size);\n  [DllImport(\"user32.dll\")]\n  public static extern bool DestroyIcon(IntPtr h);\n}\n'@",
    'function Save-WbIcon([string]$path, [string]$out) {',
    '  try {',
    '    $l=[IntPtr]::Zero; $s=[IntPtr]::Zero',
    '    $r=[WbIcon]::SHDefExtractIcon($path, 0, 0, [ref]$l, [ref]$s, 0x01000100)',
    '    if ($r -eq 0 -and $l -ne [IntPtr]::Zero) {',
    '      $ic=[System.Drawing.Icon]::FromHandle($l)',
    '      $bmp=$ic.ToBitmap()',
    '      $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)',
    '      $bmp.Dispose(); $ic.Dispose()',
    '      [WbIcon]::DestroyIcon($l) | Out-Null',
    '    } else {',
    '      $ic=[System.Drawing.Icon]::ExtractAssociatedIcon($path)',
    '      if ($ic) { $ic.ToBitmap().Save($out, [System.Drawing.Imaging.ImageFormat]::Png); $ic.Dispose() }',
    '    }',
    '  } catch {}',
    '}'
  ]
  const lines: string[] = [...header]
  const psSafe = (p: string): string => p.replace(/'/g, "''")
  for (const it of items) {
    lines.push(`Save-WbIcon '${psSafe(it.src)}' '${psSafe(it.out)}'`)
  }
  await writeFile(ps1, '\ufeff' + lines.join('\r\n'), 'utf-8')
  await new Promise<void>((resolve) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1], {
      windowsHide: true
    })
    const timer = setTimeout(() => {
      try {
        child.kill()
      } catch {
        // 已退出则忽略
      }
    }, 20000)
    child.on('close', () => {
      clearTimeout(timer)
      resolve()
    })
    child.on('error', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

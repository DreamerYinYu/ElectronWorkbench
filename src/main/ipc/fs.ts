import { ipcMain, shell, BrowserWindow, app } from 'electron'
import { readdirSync, statSync, lstatSync, mkdirSync, renameSync, copyFileSync, readFileSync, writeFileSync, existsSync, rmSync, watch } from 'fs'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { spawn, spawnSync } from 'child_process'
import { createHash } from 'crypto'
import { join, dirname, basename, extname, resolve, sep } from 'path'
import { loadProjects } from '../config'
import { readSettings, readPinned, writePinned, WORKBENCH_DIR } from '../projectFiles'
import { validatePath, validateName } from '../paths'
import { loadAppSettings } from '../appSettings'
import { HIDDEN_ITEM_RULES } from '../hiddenItems'
import type { FileEntry, ProjectMeta } from '../types'

// ==================== 真实图标提取（桌面视图用） ====================
// 背景：app.getFileIcon 基于 SHGetFileInfo，在本机对 .exe/.lnk 恒返回默认图标（经 Shell 图标缓存
// 的提取路径失效），但文件夹与注册表关联类型（docx 等）正常。因此 exe 图标改走 PowerShell 的
// System.Drawing.Icon.ExtractAssociatedIcon（直接读 PE 资源，不经过 Shell 图标缓存，与
// getWallpaper 同样用子进程方案）；.lnk 先用 shell.readShortcutLink 解析目标再提取。

/** 图标磁盘缓存目录：PowerShell 提取结果 PNG 按路径 md5 命名，跨启动复用 */
function iconCacheDir(): string {
  return join(app.getPath('appData'), 'Workbench', 'iconcache')
}

/**
 * 图标磁盘缓存文件路径：md5(路径) + 目标文件 mtime + 尺寸后缀。
 * 文件名编码目标 exe 的修改时间，程序升级（mtime 变化）后缓存文件名变化、自动失效重新提取，
 * 无需用户手动清缓存。全 ASCII，规避中文文件名问题。
 */
function iconCacheFile(target: string): string {
  let mtime = 0
  try {
    mtime = Math.floor(statSync(target).mtimeMs)
  } catch {
    // 目标不存在（坏 lnk 等）：mtime 记 0
  }
  return join(iconCacheDir(), createHash('md5').update(target.toLowerCase()).digest('hex') + `_${mtime}_256.png`)
}

/** 内存图标缓存：请求路径 -> dataURL（空串=提取失败，同样缓存避免重复请求） */
const iconMemCache = new Map<string, string>()

/** 等待批量提取的请求：exePath=提取源（PE 资源所在 exe），cacheKey=缓存/响应 key（请求路径） */
interface PendingIconRequest {
  exePath: string
  resolve: (url: string) => void
}
const iconQueue = new Map<string, PendingIconRequest[]>()
let iconBatchTimer: ReturnType<typeof setTimeout> | null = null

/** getFileIcon 提取（文件夹/注册表关联类型这条路径正常），空图标/失败返回空串 */
async function getFileIconViaElectron(target: string): Promise<string> {
  try {
    const icon = await app.getFileIcon(target, { size: 'large' })
    return icon.isEmpty() ? '' : icon.toDataURL()
  } catch {
    return ''
  }
}

/** 把图标请求加入批量队列（60ms 防抖聚合），一次 PowerShell 进程处理全部目标 */
function queueIconExtract(exePath: string, cacheKey: string): Promise<string> {
  return new Promise((resolve) => {
    const list = iconQueue.get(cacheKey)
    if (list) list.push({ exePath, resolve })
    else iconQueue.set(cacheKey, [{ exePath, resolve }])
    if (iconBatchTimer) clearTimeout(iconBatchTimer)
    iconBatchTimer = setTimeout(() => {
      void flushIconQueue()
    }, 60)
  })
}

/** 执行批量提取：生成 ps1（带 UTF-8 BOM，防中文路径乱码）→ spawn 一次 PowerShell → 读结果 PNG */
async function flushIconQueue(): Promise<void> {
  const batch = new Map(iconQueue)
  iconQueue.clear()
  iconBatchTimer = null
  if (batch.size === 0) return

  try {
    await mkdir(iconCacheDir(), { recursive: true })
    // SHDefExtractIcon 直接读 PE 资源（不经过 Shell 图标缓存），请求 256px 大图标，避免 32px 放大模糊；
    // 提取失败回退 ExtractAssociatedIcon（32px）。C# P/Invoke 定义放进单引号 here-string（字面量，不插值）。
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
    for (const [, waiters] of batch) {
      for (const w of waiters) {
        const out = psSafe(iconCacheFile(w.exePath))
        const src = psSafe(w.exePath)
        lines.push(`Save-WbIcon '${src}' '${out}'`)
      }
    }
    const ps1 = join(iconCacheDir(), 'extract.ps1')
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
  } catch {
    // 脚本生成失败：所有等待请求按失败处理
  }

  for (const [cacheKey, waiters] of batch) {
    // 多个请求可能共享同一提取源（同名 lnk 场景极少，但按第一个 waiter 的源读结果即可）
    let url = ''
    try {
      const file = iconCacheFile(waiters[0].exePath)
      if (existsSync(file)) {
        url = `data:image/png;base64,${(await readFile(file)).toString('base64')}`
      }
    } catch {
      // 结果读取失败按空处理
    }
    iconMemCache.set(cacheKey, url)
    for (const w of waiters) w.resolve(url)
  }
}

/** 读磁盘缓存 PNG（按提取源命名），命中返回 dataURL */
async function readIconDiskCache(exePath: string): Promise<string> {
  try {
    const file = iconCacheFile(exePath)
    if (existsSync(file)) {
      return `data:image/png;base64,${(await readFile(file)).toString('base64')}`
    }
  } catch {
    // 磁盘缓存读失败按未命中处理
  }
  return ''
}

/** 取文件真实图标：内存缓存 → 按类型分流（lnk 解析目标 / exe 走 PE 提取 / 其余走 getFileIcon） */
async function getRealIcon(resolved: string): Promise<string> {
  const mem = iconMemCache.get(resolved)
  if (mem !== undefined) return mem

  const ext = extname(resolved).slice(1).toLowerCase()

  // 快捷方式：解析目标路径，按目标类型取图标
  if (ext === 'lnk') {
    let target = ''
    try {
      target = shell.readShortcutLink(resolved).target || ''
    } catch {
      // 坏 lnk：target 为空走默认提取
    }
    if (target && existsSync(target)) {
      if (statSync(target).isDirectory()) {
        // 目标是文件夹：getFileIcon 对文件夹提取正常
        return await cacheMemIcon(resolved, await getFileIconViaElectron(target))
      }
      // 目标是 exe/文件：走 PE 提取，磁盘缓存按提取源命名，内存缓存按 lnk 路径
      const disk = await readIconDiskCache(target)
      if (disk) return await cacheMemIcon(resolved, disk)
      return await cacheMemIcon(resolved, await queueIconExtract(target, resolved))
    }
    // 目标丢失/坏 lnk：走默认提取（返回快捷方式默认图标）
    return await cacheMemIcon(resolved, await getFileIconViaElectron(resolved))
  }

  if (ext === 'exe') {
    const disk = await readIconDiskCache(resolved)
    if (disk) return await cacheMemIcon(resolved, disk)
    return await cacheMemIcon(resolved, await queueIconExtract(resolved, resolved))
  }

  // 文件夹与其他注册表关联类型（docx/txt 等）：getFileIcon 提取正常
  return await cacheMemIcon(resolved, await getFileIconViaElectron(resolved))
}

/** 写内存缓存并返回 */
async function cacheMemIcon(key: string, url: string): Promise<string> {
  iconMemCache.set(key, url)
  return url
}

function projectOf(dir: string): ProjectMeta | undefined {
  return loadProjects().find((p) => {
    const root = resolve(p.path)
    return dir === root || dir.startsWith(root + sep)
  })
}

/** 解析 .lnk 快捷方式指向的类型（文件夹/文件），用于桌面图标按目标类型显示；解析失败返回 undefined */
function detectLnkTargetType(lnkPath: string): 'file' | 'folder' | undefined {
  try {
    const target = shell.readShortcutLink(lnkPath).target
    if (target && existsSync(target)) {
      return statSync(target).isDirectory() ? 'folder' : 'file'
    }
  } catch {
    // 坏 lnk 或解析失败：返回 undefined
  }
  return undefined
}

/** 生成不冲突的目标路径：同名时在扩展名前追加「（2）」「（3）」编号（文件专用，仿 Windows 副本命名） */
function resolveCopyTarget(destDir: string, name: string): string {
  const ext = extname(name)
  const base = name.slice(0, name.length - ext.length)
  let target = join(destDir, name)
  let n = 2
  while (existsSync(target)) {
    target = join(destDir, `${base}（${n}）${ext}`)
    n++
  }
  return target
}

/** 递归统计目录大小时的文件数预算上限，超出即停止，避免超大目录卡死主进程 */
const DIR_SIZE_MAX_FILES = 5000

/** 递归计算目录总大小（字节）；符号链接按其指向统计避免循环，不可读则返回 0；带文件数预算限流 */
function dirSize(dir: string, budget: { left: number }): number {
  let st
  try {
    st = lstatSync(dir)
  } catch {
    return 0
  }
  if (st.isSymbolicLink() || st.isFile()) {
    budget.left--
    return st.size
  }
  if (!st.isDirectory()) return 0
  let total = 0
  try {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (budget.left <= 0) break
      total += dirSize(join(dir, e.name), budget)
    }
  } catch {
    // 目录不可读时返回已累计的部分
  }
  return total
}

/** 外链目录大小后台统计的进行中 Promise（按路径去重，避免重复统计同一大目录） */
const dirSizePending = new Map<string, Promise<number>>()

/** 异步分批统计目录大小：每处理一层让出事件循环，避免阻塞主进程（用于外链大目录后台统计） */
async function dirSizeAsync(dir: string): Promise<number> {
  let total = 0
  const stack: string[] = [dir]
  while (stack.length > 0) {
    const current = stack.pop()!
    let entries
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      const full = join(current, e.name)
      let st
      try {
        st = lstatSync(full)
      } catch {
        continue
      }
      if (st.isSymbolicLink()) continue
      if (st.isFile()) total += st.size
      else if (st.isDirectory()) stack.push(full)
    }
    await new Promise((r) => setImmediate(r))
  }
  return total
}

/** 同名冲突时的处理策略：替换（覆盖）或跳过（保留原有项） */
type ConflictMode = 'replace' | 'skip'

/** 桌面虚拟图标：命名空间对象（此电脑/回收站），双击用 shell 路径打开 */
const DESKTOP_VIRTUAL_ITEMS: FileEntry[] = [
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

/** 桌面虚拟图标的可见性缓存（读一次，系统「桌面图标设置」不常变） */
let desktopIconsVisibility: { thisPc: boolean; recycleBin: boolean } | null = null

/**
 * 读取系统「桌面图标设置」决定此电脑/回收站是否显示（HideDesktopIcons 注册表）。
 * 值名是带花括号的 CLSID；0x1=隐藏、其余（0x0/值不存在/读取失败）=显示，避免虚拟图标误消失。
 */
function readDesktopIconsVisibility(): { thisPc: boolean; recycleBin: boolean } {
  if (desktopIconsVisibility) return desktopIconsVisibility
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
  desktopIconsVisibility = result
  return result
}

/**
 * 列出真实桌面内容：用户桌面 + 公共桌面（去重，用户桌面优先）+ 虚拟图标（此电脑/回收站）。
 * 真实桌面是用户桌面与公共桌面（C:\Users\Public\Desktop）的合并视图。
 */
function listDesktopEntries(): FileEntry[] {
  const userDesktop = app.getPath('desktop')
  const publicRoot = process.env.PUBLIC || join(dirname(dirname(userDesktop)), 'Public')
  const publicDesktop = join(publicRoot, 'Desktop')

  const seen = new Set<string>()
  const entries: FileEntry[] = []

  const pushDir = (dir: string): void => {
    if (!existsSync(dir)) return
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      if (d.name.toLowerCase() === 'desktop.ini') continue
      const full = join(dir, d.name)
      let st
      try {
        st = statSync(full)
      } catch {
        continue
      }
      const isDir = d.isDirectory()
      const ext = isDir ? '' : extname(d.name).slice(1).toLowerCase()
      const lower = d.name.toLowerCase()
      if (seen.has(lower)) continue
      seen.add(lower)
      entries.push({
        name: d.name,
        type: isDir ? 'folder' : 'file',
        path: full,
        size: isDir ? 0 : st.size,
        mtime: st.mtimeMs,
        ext,
        linkTargetType: !isDir && ext === 'lnk' ? detectLnkTargetType(full) : undefined
      })
    }
  }

  pushDir(userDesktop)
  pushDir(publicDesktop)

  // 虚拟图标置前（此电脑/回收站），按系统「桌面图标设置」过滤
  const vis = readDesktopIconsVisibility()
  const virtualItems = DESKTOP_VIRTUAL_ITEMS.filter((item) =>
    item.shellPath?.includes('20D04FE0') ? vis.thisPc : item.shellPath?.includes('645FF040') ? vis.recycleBin : true
  )
  return [...virtualItems, ...entries]
}

/** 递归复制：文件直接覆盖，目录逐层合并（目标独有的文件/子目录保留，不丢数据） */
function copyPath(src: string, dest: string): void {
  const st = statSync(src)
  if (st.isFile()) {
    copyFileSync(src, dest)
    return
  }
  if (st.isDirectory()) {
    if (!existsSync(dest)) mkdirSync(dest, { recursive: true })
    for (const e of readdirSync(src, { withFileTypes: true })) {
      copyPath(join(src, e.name), join(dest, e.name))
    }
  }
}

/** 递归移动：文件覆盖；目录同名时合并内容（先尝试整体 rename，跨盘 EXDEV 降级为复制+删源） */
function movePath(src: string, dest: string): void {
  const st = statSync(src)
  if (st.isFile()) {
    if (existsSync(dest)) rmSync(dest, { force: true })
    try {
      renameSync(src, dest)
    } catch (e) {
      if ((e as { code?: string }).code !== 'EXDEV') throw e
      copyFileSync(src, dest)
      rmSync(src, { force: true })
    }
    return
  }
  if (st.isDirectory()) {
    if (!existsSync(dest)) {
      try {
        renameSync(src, dest)
        return
      } catch (e) {
        if ((e as { code?: string }).code !== 'EXDEV') throw e
        copyPath(src, dest)
        rmSync(src, { recursive: true, force: true })
        return
      }
    }
    // 目标存在同名目录：合并（逐个子项递归移动），最后清理源目录残留
    for (const e of readdirSync(src, { withFileTypes: true })) {
      movePath(join(src, e.name), join(dest, e.name))
    }
    rmSync(src, { recursive: true, force: true })
  }
}

export function registerFsIpc(): void {
  // 列出真实桌面（用户桌面 + 公共桌面 + 虚拟图标），桌面视图专用
  ipcMain.handle('fs:listDesktop', (): FileEntry[] => {
    return listDesktopEntries()
  })

  ipcMain.handle('fs:listDir', (event, dir: string): FileEntry[] => {
    const resolved = validatePath(dir)
    const project = projectOf(resolved)
    const pinnedSet = new Set(project ? readPinned(project.path) : [])

    // 全局隐藏规则（设置里勾选的隐藏项）
    const hiddenItems = loadAppSettings().hiddenItems
    const dirs = new Set<string>()
    const exts = new Set<string>()
    let hideDot = false
    for (const id of hiddenItems) {
      const rule = HIDDEN_ITEM_RULES[id]
      if (!rule) continue
      rule.dirs.forEach((d) => dirs.add(d))
      rule.exts.forEach((e) => exts.add(e))
      if (rule.dot) hideDot = true
    }

    const entries: FileEntry[] = readdirSync(resolved, { withFileTypes: true })
      .filter((d) => d.name !== WORKBENCH_DIR)
      .filter((d) => d.name.toLowerCase() !== 'desktop.ini')
      .filter((d) => {
        if (hideDot && d.name.startsWith('.')) return false
        if (d.isDirectory()) return !dirs.has(d.name)
        const ext = extname(d.name).slice(1).toLowerCase()
        return !exts.has(ext)
      })
      .map((d) => {
        const full = join(resolved, d.name)
        const st = statSync(full)
        const isDir = d.isDirectory()
        const ext = isDir ? '' : extname(d.name).slice(1).toLowerCase()
        return {
          name: d.name,
          type: isDir ? 'folder' : 'file',
          pinned: pinnedSet.has(full),
          size: isDir ? dirSize(full, { left: DIR_SIZE_MAX_FILES }) : st.size,
          mtime: st.mtimeMs,
          ext,
          linkTargetType: !isDir && ext === 'lnk' ? detectLnkTargetType(full) : undefined
        }
      })

    // 项目根目录：合并外部链接（依附同名文件夹或额外显示，检测路径是否丢失）
    if (project && resolved === resolve(project.path)) {
      const settings = readSettings(project.path)
      for (const link of settings.externalLinks) {
        const broken = !existsSync(link.targetPath)
        const existing = entries.find((e) => e.type === 'folder' && e.name === link.name && !e.link)
        if (existing) {
          // 依附到项目根同名文件夹（占位入口）
          existing.link = true
          existing.target = link.targetPath
          existing.linkBroken = broken
          existing.pinned = pinnedSet.has(resolve(link.targetPath))
          existing.size = broken ? 0 : -1
        } else {
          entries.push({
            name: link.name,
            type: 'folder',
            link: true,
            target: link.targetPath,
            linkBroken: broken,
            pinned: pinnedSet.has(resolve(link.targetPath)),
            size: broken ? 0 : -1,
            mtime: 0,
            ext: ''
          })
        }

        // 后台异步统计外链大小（不阻塞刷新），统计完广播给渲染层更新
        if (!broken) {
          const target = link.targetPath
          if (!dirSizePending.has(target)) {
            const p = dirSizeAsync(target)
              .then((size) => {
                event.sender.send('fs:dirSizeDone', { path: target, size })
                return size
              })
              .finally(() => dirSizePending.delete(target))
            dirSizePending.set(target, p)
          }
        }
      }
    }
    return entries
  })

  ipcMain.handle('fs:mkdir', (_e, parent: string, name: string): string => {
    const resolvedParent = validatePath(parent)
    const safeName = validateName(name)
    // 同名文件夹在名称末尾追加「（2）」「（3）」编号（文件夹不拆扩展名）
    let finalName = safeName
    let n = 2
    while (existsSync(join(resolvedParent, finalName))) {
      finalName = `${safeName}（${n}）`
      n++
    }
    const target = validatePath(join(resolvedParent, finalName))
    mkdirSync(target)
    return target
  })

  ipcMain.handle('fs:createFile', (_e, parent: string, name: string): string => {
    const resolvedParent = validatePath(parent)
    const target = resolveCopyTarget(resolvedParent, validateName(name))
    writeFileSync(target, '', 'utf-8')
    return target
  })

  ipcMain.handle('fs:rename', (_e, oldPath: string, newName: string): string => {
    const resolvedOld = validatePath(oldPath)
    const newPath = resolve(dirname(resolvedOld), validateName(newName))
    renameSync(resolvedOld, newPath)
    // 同步更新置顶记录里的路径，避免重命名后置顶状态丢失
    const project = projectOf(dirname(resolvedOld))
    if (project) {
      const pinned = readPinned(project.path)
      const idx = pinned.indexOf(resolvedOld)
      if (idx >= 0) {
        pinned[idx] = newPath
        writePinned(project.path, pinned)
      }
    }
    return newPath
  })

  ipcMain.handle('fs:remove', async (_e, target: string): Promise<void> => {
    const resolved = validatePath(target)
    await shell.trashItem(resolved)
  })

  ipcMain.handle('fs:removeMany', async (_e, targets: string[]): Promise<void> => {
    for (const t of targets) {
      await shell.trashItem(validatePath(t))
    }
  })

  ipcMain.handle('fs:copy', (_e, sources: string[], destDir: string): void => {
    const resolvedDest = validatePath(destDir)
    for (const src of sources) {
      // 递归复制：文件覆盖、目录递归（支持从外部拖入文件夹导入）
      copyPath(src, resolveCopyTarget(resolvedDest, basename(src)))
    }
  })

  ipcMain.handle('fs:copyEntries', (_e, sources: string[], destDir: string, conflict: ConflictMode): void => {
    const resolvedDest = validatePath(destDir)
    for (const src of sources) {
      const resolvedSrc = validatePath(src)
      const dest = join(resolvedDest, basename(resolvedSrc))
      // 复制到自身所在目录且同名：跳过，避免自覆盖损坏
      if (resolve(resolvedSrc) === resolve(dest)) continue
      if (existsSync(dest) && conflict === 'skip') continue
      copyPath(resolvedSrc, dest)
    }
  })

  ipcMain.handle('fs:stat', (_e, target: string): { size: number; mtime: number; birthtime: number; type: 'file' | 'folder' } => {
    const resolved = validatePath(target)
    const st = statSync(resolved)
    return {
      size: st.isDirectory() ? 0 : st.size,
      mtime: st.mtimeMs,
      birthtime: st.birthtimeMs,
      type: st.isDirectory() ? 'folder' : 'file'
    }
  })

  ipcMain.handle('fs:statExternal', (_e, target: string): { type: 'file' | 'folder' } => {
    // 外部拖入项类型判断：源路径在项目外，不做路径校验
    const st = statSync(target)
    return { type: st.isDirectory() ? 'folder' : 'file' }
  })

  ipcMain.handle('fs:moveEntries', (_e, sources: string[], destDir: string, conflict: ConflictMode): void => {
    const resolvedDest = validatePath(destDir)
    for (const src of sources) {
      const resolvedSrc = validatePath(src)
      const dest = join(resolvedDest, basename(resolvedSrc))
      if (resolve(resolvedSrc) === resolve(dest)) continue
      if (existsSync(dest) && conflict === 'skip') continue
      movePath(resolvedSrc, dest)
      // 移动后同步置顶记录路径，避免置顶状态丢失
      const project = projectOf(dirname(resolvedSrc))
      if (project) {
        const pinned = readPinned(project.path)
        const idx = pinned.indexOf(resolvedSrc)
        if (idx >= 0) {
          pinned[idx] = dest
          writePinned(project.path, pinned)
        }
      }
    }
  })

  // 提取文件/快捷方式的真实系统图标（桌面视图用），返回 dataURL；失败返回空串由前端回退内置图标
  ipcMain.handle('fs:getIcon', async (_e, target: string): Promise<string> => {
    const resolved = validatePath(target)
    return getRealIcon(resolved)
  })

  ipcMain.handle('fs:readText', (_e, target: string): string => {
    const resolved = validatePath(target)
    return readFileSync(resolved, 'utf-8')
  })

  ipcMain.handle('fs:writeText', (_e, target: string, content: string): void => {
    const resolved = validatePath(target)
    writeFileSync(resolved, content, 'utf-8')
  })

  ipcMain.handle('fs:readBinary', (_e, target: string): string => {
    const resolved = validatePath(target)
    const buf = readFileSync(resolved)
    return buf.toString('base64')
  })

  ipcMain.handle('fs:readImage', (_e, target: string): string => {
    const resolved = validatePath(target)
    const buf = readFileSync(resolved)
    const mime = extname(resolved).slice(1).toLowerCase()
    return `data:image/${mime === 'jpg' ? 'jpeg' : mime};base64,${buf.toString('base64')}`
  })

  ipcMain.handle('fs:openPath', async (_e, target: string): Promise<string> => {
    const resolved = validatePath(target)
    return shell.openPath(resolved)
  })

  ipcMain.handle('fs:showInFolder', (_e, target: string): void => {
    const resolved = validatePath(target)
    shell.showItemInFolder(resolved)
  })

  ipcMain.handle('fs:togglePin', (_e, target: string): boolean => {
    const resolved = validatePath(target)
    // 定位项目：普通文件用 projectOf；外部链接目录遍历项目 externalLinks 匹配
    let project = projectOf(resolved)
    if (!project) {
      project = loadProjects().find((p) =>
        readSettings(p.path).externalLinks.some((l) => resolve(l.targetPath) === resolved)
      )
    }
    if (!project) throw new Error('无法定位项目')
    const pinned = readPinned(project.path)
    const idx = pinned.indexOf(resolved)
    if (idx >= 0) {
      pinned.splice(idx, 1)
    } else {
      pinned.push(resolved)
    }
    writePinned(project.path, pinned)
    return idx < 0
  })

  // 监听目标目录（递归），磁盘上任何文件/文件夹变化（新建/删除/改名）都广播给渲染层刷新
  const projectWatchers: ReturnType<typeof watch>[] = []
  let watchDebounce: NodeJS.Timeout | null = null
  ipcMain.handle('fs:watchProject', (_e, projectPath: string): void => {
    for (const w of projectWatchers) {
      try {
        w.close()
      } catch {
        // 已关闭则忽略
      }
    }
    projectWatchers.length = 0

    // 桌面场景：真实桌面 = 用户桌面 + 公共桌面合并，两个目录都要监听
    const dirs: string[] = [validatePath(projectPath)]
    if (dirs[0] === app.getPath('desktop')) {
      const publicRoot = process.env.PUBLIC || join(dirname(dirname(app.getPath('desktop'))), 'Public')
      const publicDesktop = join(publicRoot, 'Desktop')
      if (!dirs.includes(publicDesktop)) dirs.push(publicDesktop)
    }

    for (const dir of dirs) {
      const w = watch(dir, { recursive: true }, () => {
        if (watchDebounce) clearTimeout(watchDebounce)
        watchDebounce = setTimeout(() => {
          for (const win of BrowserWindow.getAllWindows()) {
            if (!win.isDestroyed()) win.webContents.send('fs:changed')
          }
        }, 300)
      })
      w.on('error', () => {
        // 目录被删除/改名时 watcher 报错，忽略；下次切换/聚焦会重新 watch
      })
      projectWatchers.push(w)
    }
  })
}

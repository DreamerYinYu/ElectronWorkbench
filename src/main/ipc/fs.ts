import { ipcMain, shell, BrowserWindow } from 'electron'
import { readdirSync, statSync, lstatSync, mkdirSync, renameSync, copyFileSync, readFileSync, writeFileSync, existsSync, rmSync, watch } from 'fs'
import { join, dirname, basename, extname, resolve, sep } from 'path'
import { loadProjects } from '../config'
import { readSettings, readPinned, writePinned, WORKBENCH_DIR } from '../projectFiles'
import { validatePath, validateName } from '../paths'
import { loadAppSettings } from '../appSettings'
import { HIDDEN_ITEM_RULES } from '../hiddenItems'
import type { FileEntry, ProjectMeta } from '../types'

function projectOf(dir: string): ProjectMeta | undefined {
  return loadProjects().find((p) => {
    const root = resolve(p.path)
    return dir === root || dir.startsWith(root + sep)
  })
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

/** 递归计算目录总大小（字节）；符号链接按其指向统计避免循环，不可读则返回 0 */
function dirSize(dir: string): number {
  let st
  try {
    st = lstatSync(dir)
  } catch {
    return 0
  }
  if (st.isSymbolicLink() || st.isFile()) return st.size
  if (!st.isDirectory()) return 0
  let total = 0
  try {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      total += dirSize(join(dir, e.name))
    }
  } catch {
    // 目录不可读时返回已累计的部分
  }
  return total
}

/** 同名冲突时的处理策略：替换（覆盖）或跳过（保留原有项） */
type ConflictMode = 'replace' | 'skip'

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
  ipcMain.handle('fs:listDir', (_e, dir: string): FileEntry[] => {
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
      .filter((d) => {
        if (hideDot && d.name.startsWith('.')) return false
        if (d.isDirectory()) return !dirs.has(d.name)
        const ext = extname(d.name).slice(1).toLowerCase()
        return !exts.has(ext)
      })
      .map((d) => {
        const full = join(resolved, d.name)
        const st = statSync(full)
        return {
          name: d.name,
          type: d.isDirectory() ? 'folder' : 'file',
          pinned: pinnedSet.has(full),
          size: d.isDirectory() ? dirSize(full) : st.size,
          mtime: st.mtimeMs,
          ext: d.isDirectory() ? '' : extname(d.name).slice(1).toLowerCase()
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
          existing.size = broken ? 0 : dirSize(link.targetPath)
        } else {
          entries.push({
            name: link.name,
            type: 'folder',
            link: true,
            target: link.targetPath,
            linkBroken: broken,
            pinned: pinnedSet.has(resolve(link.targetPath)),
            size: broken ? 0 : dirSize(link.targetPath),
            mtime: 0,
            ext: ''
          })
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

  // 监听项目根目录（递归），磁盘上任何文件/文件夹变化（新建/删除/改名）都广播给渲染层刷新
  let projectWatcher: ReturnType<typeof watch> | null = null
  let watchDebounce: NodeJS.Timeout | null = null
  ipcMain.handle('fs:watchProject', (_e, projectPath: string): void => {
    if (projectWatcher) {
      projectWatcher.close()
      projectWatcher = null
    }
    const resolved = validatePath(projectPath)
    projectWatcher = watch(resolved, { recursive: true }, () => {
      if (watchDebounce) clearTimeout(watchDebounce)
      watchDebounce = setTimeout(() => {
        for (const w of BrowserWindow.getAllWindows()) {
          if (!w.isDestroyed()) w.webContents.send('fs:changed')
        }
      }, 300)
    })
    projectWatcher.on('error', () => {
      // 目录被删除/改名时 watcher 报错，忽略；下次切换/聚焦会重新 watch
    })
  })
}

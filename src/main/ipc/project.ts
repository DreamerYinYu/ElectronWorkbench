import { ipcMain, shell } from 'electron'
import { existsSync, renameSync, readdirSync, statSync } from 'fs'
import { join, dirname, resolve } from 'path'
import { randomUUID } from 'crypto'
import { loadProjects, saveProjects } from '../config'
import { ensureProjectDir, readSettings, writeSettings, WORKBENCH_DIR } from '../projectFiles'
import { validateName } from '../paths'
import type { ProjectMeta, ProjectSettings } from '../types'

export function registerProjectIpc(): void {
  ipcMain.handle('project:list', (): ProjectMeta[] => loadProjects())

  // 拖拽排序后按新顺序持久化项目清单
  ipcMain.handle('project:reorder', (_e, orderedIds: string[]): ProjectMeta[] => {
    const projects = loadProjects()
    const byId = new Map(projects.map((p) => [p.id, p]))
    const reordered = orderedIds
      .map((id) => byId.get(id))
      .filter((p): p is ProjectMeta => Boolean(p))
    // 兜底：追加任何不在 orderedIds 里的项目（避免遗漏）
    for (const p of projects) {
      if (!reordered.includes(p)) reordered.push(p)
    }
    saveProjects(reordered)
    return reordered
  })

  // 扫描「项目文件夹」同步磁盘状态：识别带 .workbench 的文件夹合并进清单，并移除磁盘上已不存在的项目
  ipcMain.handle('project:scan', (_e, folderPath: string): ProjectMeta[] => {
    let projects = loadProjects()

    const root = resolve(folderPath)
    if (folderPath && existsSync(root) && statSync(root).isDirectory()) {
      const existingPaths = new Set(projects.map((p) => resolve(p.path)))
      for (const e of readdirSync(root, { withFileTypes: true })) {
        if (!e.isDirectory()) continue
        const sub = join(root, e.name)
        if (!existsSync(join(sub, WORKBENCH_DIR))) continue
        if (existingPaths.has(resolve(sub))) continue
        projects.push({
          id: randomUUID(),
          name: e.name,
          path: sub,
          createdAt: new Date().toISOString()
        })
        existingPaths.add(resolve(sub))
      }
    }

    // 移除磁盘上已不存在的项目，保证清单始终反映磁盘真实状态（删除/改名后失效项清除）
    projects = projects.filter((p) => existsSync(p.path))

    saveProjects(projects)
    return projects
  })

  ipcMain.handle('project:create', (_e, parentDir: string, name: string): ProjectMeta => {
    const safeName = validateName(name)
    const projectPath = join(parentDir, safeName)
    if (existsSync(projectPath)) throw new Error('同名文件夹已存在')
    ensureProjectDir(projectPath)
    const meta: ProjectMeta = {
      id: randomUUID(),
      name: safeName,
      path: projectPath,
      createdAt: new Date().toISOString()
    }
    const projects = loadProjects()
    projects.push(meta)
    saveProjects(projects)
    return meta
  })

  ipcMain.handle('project:rename', (_e, id: string, newName: string): ProjectMeta => {
    const projects = loadProjects()
    const p = projects.find((x) => x.id === id)
    if (!p) throw new Error('项目不存在')
    const safeName = validateName(newName)
    const newPath = join(dirname(p.path), safeName)
    if (existsSync(newPath)) throw new Error('同名文件夹已存在')
    renameSync(p.path, newPath)
    p.name = safeName
    p.path = newPath
    saveProjects(projects)
    return p
  })

  ipcMain.handle('project:delete', async (_e, id: string): Promise<void> => {
    const projects = loadProjects()
    const p = projects.find((x) => x.id === id)
    if (!p) throw new Error('项目不存在')
    await shell.trashItem(p.path)
    saveProjects(projects.filter((x) => x.id !== id))
  })

  ipcMain.handle('project:getSettings', (_e, id: string): ProjectSettings => {
    const p = loadProjects().find((x) => x.id === id)
    if (!p) throw new Error('项目不存在')
    return readSettings(p.path)
  })

  ipcMain.handle('project:saveSettings', (_e, id: string, settings: ProjectSettings): void => {
    const p = loadProjects().find((x) => x.id === id)
    if (!p) throw new Error('项目不存在')
    writeSettings(p.path, settings)
  })

  // 设置外部链接：按 name 定位，已存在则更新 targetPath，否则追加（不限数量）
  ipcMain.handle('project:setLink', (_e, id: string, name: string, targetPath: string): void => {
    const p = loadProjects().find((x) => x.id === id)
    if (!p) throw new Error('项目不存在')
    const safeName = validateName(name)
    const settings = readSettings(p.path)
    const existing = settings.externalLinks.find((l) => l.name === safeName)
    if (existing) {
      existing.targetPath = targetPath
    } else {
      settings.externalLinks.push({ name: safeName, targetPath })
    }
    writeSettings(p.path, settings)
  })

  // 重命名外部链接：同步重命名项目根下的占位文件夹，保持显示名与真实文件夹名一致
  ipcMain.handle('project:renameLink', (_e, id: string, targetPath: string, newName: string): void => {
    const p = loadProjects().find((x) => x.id === id)
    if (!p) throw new Error('项目不存在')
    const safeName = validateName(newName)
    const settings = readSettings(p.path)
    const link = settings.externalLinks.find((l) => l.targetPath === targetPath)
    if (!link) throw new Error('链接不存在')

    // 占位文件夹存在时一并改名，否则会出现「旧文件夹 + 新名虚拟外链」两个并列项
    if (link.name !== safeName) {
      const oldFolder = join(p.path, link.name)
      const newFolder = join(p.path, safeName)
      if (existsSync(oldFolder)) {
        if (existsSync(newFolder)) throw new Error('同名文件夹已存在')
        renameSync(oldFolder, newFolder)
      }
    }

    link.name = safeName
    writeSettings(p.path, settings)
  })

  // 移除外部链接：只删引用，不删真实目录
  ipcMain.handle('project:removeLink', (_e, id: string, targetPath: string): void => {
    const p = loadProjects().find((x) => x.id === id)
    if (!p) throw new Error('项目不存在')
    const settings = readSettings(p.path)
    settings.externalLinks = settings.externalLinks.filter((l) => l.targetPath !== targetPath)
    writeSettings(p.path, settings)
  })
}

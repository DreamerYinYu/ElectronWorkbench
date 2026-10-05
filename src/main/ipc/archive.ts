import { ipcMain } from 'electron'
import { join, basename } from 'path'
import { existsSync, mkdirSync, createWriteStream, readdirSync, renameSync, rmSync } from 'fs'
import { randomUUID } from 'crypto'
import { ZipArchive } from 'archiver'
import extract from 'extract-zip'
import { loadProjects, saveProjects } from '../config'
import { ensureProjectDir, readSettings } from '../projectFiles'
import type { ProjectMeta } from '../types'

/**
 * 递归压缩项目目录。
 * 包含空文件夹、隐藏文件（点开头）与 .workbench 元数据；
 * 外链文件夹仅保留空目录节点，不压缩其内部内容；
 * zip 内先有一层项目文件夹（projectName），解压后得到项目文件夹而非散乱内容。
 */
async function zipProject(projectPath: string, projectName: string, destZip: string): Promise<void> {
  const linkNames = new Set(readSettings(projectPath).externalLinks.map((l) => l.name))

  const output = createWriteStream(destZip)
  const archive = new ZipArchive({ zlib: { level: 9 } })
  archive.pipe(output)

  // directory 默认 dot:true（含隐藏文件）且保留空目录；dataFunction 跳过外链内部内容
  archive.directory(projectPath, projectName, (entry) => {
    for (const linkName of linkNames) {
      if (entry.name.startsWith(linkName + '/')) return false
    }
    return entry
  })

  await new Promise<void>((resolve, reject) => {
    output.on('close', () => resolve())
    output.on('error', reject)
    archive.on('error', reject)
    archive.finalize()
  })
}

export function registerArchiveIpc(): void {
  ipcMain.handle('project:compress', async (_e, id: string, destDir: string): Promise<string> => {
    const p = loadProjects().find((x) => x.id === id)
    if (!p) throw new Error('项目不存在')
    const destZip = join(destDir, `${p.name}.zip`)
    await zipProject(p.path, p.name, destZip)
    return destZip
  })

  ipcMain.handle('project:import', async (_e, archivePath: string, destDir: string): Promise<ProjectMeta> => {
    // 解压到临时目录，再定位实际项目文件夹，避免解压后结构不确定（可能包一层项目名）
    const tmpDir = join(destDir, `.wb-import-${randomUUID()}`)
    mkdirSync(tmpDir, { recursive: true })
    try {
      await extract(archivePath, { dir: tmpDir })

      // 定位含 .workbench 的项目文件夹：直接解压 或 包了一层项目名
      let projectDir = tmpDir
      let projectName = basename(archivePath).replace(/\.zip$/i, '')
      if (!existsSync(join(tmpDir, '.workbench'))) {
        const subs = readdirSync(tmpDir, { withFileTypes: true }).filter((e) => e.isDirectory())
        const found = subs.find((s) => existsSync(join(tmpDir, s.name, '.workbench')))
        if (!found) throw new Error('不是有效的 Workbench 项目（缺少 .workbench）')
        projectDir = join(tmpDir, found.name)
        projectName = found.name
      }

      const finalPath = join(destDir, projectName)
      if (existsSync(finalPath)) throw new Error('同名项目已存在')
      renameSync(projectDir, finalPath)
      try {
        rmSync(tmpDir, { recursive: true, force: true })
      } catch {
        // 临时目录清理失败忽略（可能已被 rename 移走）
      }
      ensureProjectDir(finalPath)

      const meta: ProjectMeta = {
        id: randomUUID(),
        name: projectName,
        path: finalPath,
        createdAt: new Date().toISOString()
      }
      const projects = loadProjects()
      projects.push(meta)
      saveProjects(projects)
      return meta
    } catch (e) {
      try {
        rmSync(tmpDir, { recursive: true, force: true })
      } catch {
        // 忽略清理失败
      }
      throw e
    }
  })
}

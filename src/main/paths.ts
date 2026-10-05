import { resolve, sep } from 'path'
import { loadProjects } from './config'
import { readSettings } from './projectFiles'

export function allowedRoots(): string[] {
  return loadProjects().flatMap((p) => {
    const roots = [resolve(p.path)]
    const settings = readSettings(p.path)
    for (const link of settings.externalLinks) {
      roots.push(resolve(link.targetPath))
    }
    return roots
  })
}

export function validatePath(target: string): string {
  const resolved = resolve(target)
  const ok = allowedRoots().some((root) => resolved === root || resolved.startsWith(root + sep))
  if (!ok) throw new Error('非法路径：越界访问')
  return resolved
}

/**
 * 校验单个文件/文件夹名，防止路径穿越（禁止路径分隔符与相对路径片段）。
 * 用于新建/重命名等接收用户输入名称的 IPC。
 */
export function validateName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed || trimmed === '.' || trimmed === '..') throw new Error('名称不能为空')
  if (/[/\\]/.test(trimmed)) throw new Error('名称不能包含路径分隔符')
  return trimmed
}

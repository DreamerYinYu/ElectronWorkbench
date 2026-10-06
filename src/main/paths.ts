import { resolve, sep } from 'path'
import { loadProjects } from './config'
import { readSettings } from './projectFiles'

/** 额外放行的根目录（如系统桌面）：不在项目内但允许浏览/操作 */
const extraRoots = new Set<string>()

export function registerExtraRoot(dir: string): void {
  extraRoots.add(resolve(dir))
}

export function allowedRoots(): string[] {
  const roots = loadProjects().flatMap((p) => {
    const roots = [resolve(p.path)]
    const settings = readSettings(p.path)
    for (const link of settings.externalLinks) {
      roots.push(resolve(link.targetPath))
    }
    return roots
  })
  for (const root of extraRoots) roots.push(root)
  return roots
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

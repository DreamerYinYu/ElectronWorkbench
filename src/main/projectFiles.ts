import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import type { TodoItem, ProjectSettings } from './types'

export const WORKBENCH_DIR = '.workbench'

export function ensureProjectDir(projectPath: string): void {
  mkdirSync(join(projectPath, WORKBENCH_DIR), { recursive: true })
}

export function readTodos(projectPath: string): TodoItem[] {
  const p = join(projectPath, WORKBENCH_DIR, 'todos.json')
  if (!existsSync(p)) return []
  try {
    return JSON.parse(readFileSync(p, 'utf-8'))
  } catch {
    return []
  }
}

export function writeTodos(projectPath: string, todos: TodoItem[]): void {
  const p = join(projectPath, WORKBENCH_DIR, 'todos.json')
  writeFileSync(p, JSON.stringify(todos, null, 2), 'utf-8')
}

export function readSettings(projectPath: string): ProjectSettings {
  const p = join(projectPath, WORKBENCH_DIR, 'project.json')
  const defaults: ProjectSettings = { externalLinks: [] }
  if (!existsSync(p)) return defaults
  try {
    return { ...defaults, ...JSON.parse(readFileSync(p, 'utf-8')) }
  } catch {
    return defaults
  }
}

export function writeSettings(projectPath: string, settings: ProjectSettings): void {
  const p = join(projectPath, WORKBENCH_DIR, 'project.json')
  writeFileSync(p, JSON.stringify(settings, null, 2), 'utf-8')
}

export function readPinned(projectPath: string): string[] {
  const p = join(projectPath, WORKBENCH_DIR, 'pinned.json')
  if (!existsSync(p)) return []
  try {
    const data = JSON.parse(readFileSync(p, 'utf-8'))
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

export function writePinned(projectPath: string, pinned: string[]): void {
  const p = join(projectPath, WORKBENCH_DIR, 'pinned.json')
  writeFileSync(p, JSON.stringify(pinned, null, 2), 'utf-8')
}

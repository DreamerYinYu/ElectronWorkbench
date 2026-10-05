import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { loadProjects } from '../config'
import { readTodos, writeTodos } from '../projectFiles'
import type { TodoItem } from '../types'

function projectPathById(id: string): string {
  const p = loadProjects().find((x) => x.id === id)
  if (!p) throw new Error('项目不存在')
  return p.path
}

export function registerTodoIpc(): void {
  ipcMain.handle('todo:list', (_e, projectId: string): TodoItem[] => readTodos(projectPathById(projectId)))

  ipcMain.handle('todo:add', (_e, projectId: string, title: string): TodoItem => {
    const path = projectPathById(projectId)
    const todos = readTodos(path)
    const item: TodoItem = {
      id: randomUUID(),
      title,
      completed: false,
      createdAt: new Date().toISOString(),
      completedAt: null
    }
    todos.push(item)
    writeTodos(path, todos)
    return item
  })

  ipcMain.handle('todo:toggle', (_e, projectId: string, id: string): TodoItem => {
    const path = projectPathById(projectId)
    const todos = readTodos(path)
    const item = todos.find((t) => t.id === id)
    if (!item) throw new Error('待办不存在')
    item.completed = !item.completed
    item.completedAt = item.completed ? new Date().toISOString() : null
    writeTodos(path, todos)
    return item
  })

  ipcMain.handle('todo:update', (_e, projectId: string, id: string, title: string): TodoItem => {
    const path = projectPathById(projectId)
    const todos = readTodos(path)
    const item = todos.find((t) => t.id === id)
    if (!item) throw new Error('待办不存在')
    item.title = title
    writeTodos(path, todos)
    return item
  })

  ipcMain.handle('todo:remove', (_e, projectId: string, id: string): void => {
    const path = projectPathById(projectId)
    writeTodos(path, readTodos(path).filter((t) => t.id !== id))
  })

  ipcMain.handle('todo:reorder', (_e, projectId: string, orderedIds: string[]): void => {
    const path = projectPathById(projectId)
    const todos = readTodos(path)
    const map = new Map(todos.map((t) => [t.id, t]))
    const reordered = orderedIds.map((id) => map.get(id)).filter(Boolean) as TodoItem[]
    for (const t of todos) {
      if (!orderedIds.includes(t.id)) reordered.push(t)
    }
    writeTodos(path, reordered)
  })
}

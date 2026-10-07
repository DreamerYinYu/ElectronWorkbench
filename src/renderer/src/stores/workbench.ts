import { create } from 'zustand'
import type {
  ProjectMeta,
  FileEntry,
  TodoItem,
  ProjectSettings,
  SortKey,
  SortDir,
  ViewMode,
  DesktopLayout,
  DesktopWidget,
  DesktopIconPos
} from '../types'
import { typeLabel } from '../utils/format'

function sortFiles(files: FileEntry[], key: SortKey, dir: SortDir): FileEntry[] {
  const mult = dir === 'asc' ? 1 : -1
  return [...files].sort((a, b) => {
    // 虚拟桌面图标（此电脑/回收站）固定最前
    if (!!a.virtual !== !!b.virtual) return a.virtual ? -1 : 1
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1
    if (key === 'name') return mult * a.name.localeCompare(b.name, 'zh-CN')
    if (key === 'size') {
      return mult * (a.size - b.size)
    }
    if (key === 'type') return mult * typeLabel(a).localeCompare(typeLabel(b), 'zh-CN')
    if (key === 'mtime') return mult * (a.mtime - b.mtime)
    return 0
  })
}

/** 迁移旧桌面布局（pages/grid/像素坐标）到新 icons 网格坐标；补齐缺省字段 */
function migrateLayout(raw: DesktopLayout | null): DesktopLayout {
  if (!raw) return { icons: [], widgets: [], dock: [] }
  const any = raw as unknown as {
    pages?: string[][]
    grid?: { kind: string; key?: string; id?: string }[]
    icons?: { key: string; col?: number; row?: number; x?: number; y?: number }[]
    widgets?: { id: string; type: DesktopWidget['type']; w: number; h: number; col?: number; row?: number; x?: number; y?: number }[]
    dock?: string[]
    autoArrange?: boolean
  }

  // 像素 → 网格坐标（列宽 96 + 间距 14 = 110，起点 20）
  const toCol = (v: number): number => Math.max(0, Math.round((v - 20) / 110))
  const toRow = (v: number): number => Math.max(0, Math.round((v - 20) / 110))

  let icons: DesktopIconPos[]
  let widgets: DesktopWidget[]
  let dock: string[]

  if (Array.isArray(any.icons)) {
    icons = any.icons.map((p) => {
      if (typeof p.col === 'number' && typeof p.row === 'number') {
        return { key: p.key, col: p.col, row: p.row }
      }
      return { key: p.key, col: toCol(p.x ?? 0), row: toRow(p.y ?? 0) }
    })
    widgets = (any.widgets ?? []).map((w) => {
      if (typeof w.col === 'number' && typeof w.row === 'number') {
        return { id: w.id, type: w.type, w: w.w, h: w.h, col: w.col, row: w.row }
      }
      return { id: w.id, type: w.type, w: w.w, h: w.h, col: toCol(w.x ?? 0), row: toRow(w.y ?? 0) }
    })
    dock = any.dock ?? []
  } else {
    const keys: string[] = []
    if (Array.isArray(any.grid)) {
      for (const g of any.grid) if (g && g.kind === 'icon' && g.key) keys.push(g.key)
    } else if (Array.isArray(any.pages)) {
      for (const page of any.pages) for (const k of page) keys.push(k)
    }
    const COLS = 8
    icons = keys.map((key, i) => ({ key, col: i % COLS, row: Math.floor(i / COLS) }))
    widgets = (any.widgets ?? []).map((w, i) => ({
      id: w.id,
      type: w.type,
      w: w.w,
      h: w.h,
      col: (i % 4) * 2,
      row: Math.floor(i / 4) * 2 + 3
    }))
    dock = any.dock ?? []
  }

  // 清理：dock 里的图标从 icons 移除（移动语义：icons 与 dock 互斥，避免幽灵占用）
  const dockSet = new Set(dock)
  icons = icons.filter((p) => !dockSet.has(p.key))

  return { icons, widgets, dock, autoArrange: any.autoArrange ?? true }
}

/** 把当前 UI 状态写入 state.json（主进程统一管理）；防抖避免拖拽栏宽时频繁写盘 */
let persistTimer: ReturnType<typeof setTimeout> | null = null
function persistUi(): void {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    const s = useWorkbench.getState()
    window.workbench.state.saveUi({
      activeNav: s.activeNav,
      currentProjectId: s.currentProjectId,
      view: s.view,
      sortKey: s.sortKey,
      sortDir: s.sortDir,
      sidebarWidth: s.sidebarWidth,
      todoWidth: s.todoWidth
    })
  }, 300)
}

export interface BreadcrumbItem {
  name: string
  path: string
}

interface WorkbenchState {
  projects: ProjectMeta[]
  currentProjectId: string | null
  currentDir: string
  breadcrumb: BreadcrumbItem[]
  files: FileEntry[]
  /** 当前侧边栏导航区：项目 / 桌面 / 资料库 */
  activeNav: 'project' | 'desktop' | 'library'
  /** 系统桌面路径（桌面根目录），进入子文件夹后 currentDir 不再等于它，用于区分桌面根/子目录 */
  desktopPath: string
  /** 系统桌面壁纸（dataURL），桌面视图背景用 */
  wallpaper: string | null
  /** 桌面布局（分页/小组件/Dock 钉选），null 表示未加载 */
  desktopLayout: DesktopLayout | null
  /** 桌面是否处于编辑模式（图标抖动 + 减号） */
  desktopEditing: boolean
  view: ViewMode
  sortKey: SortKey
  sortDir: SortDir
  sidebarWidth: number
  todoWidth: number
  todos: TodoItem[]
  editingTodoId: string | null
  settings: ProjectSettings
  selectedFiles: string[]
  anchorName: string | null
  clipboard: { mode: 'copy' | 'cut'; paths: string[] } | null

  init: () => Promise<void>
  rescanProjects: () => Promise<void>
  selectProject: (id: string) => Promise<void>
  selectDesktop: () => Promise<void>
  selectLibrary: () => Promise<void>
  createProject: (parentDir: string, name: string) => Promise<void>
  reorderProjects: (orderedIds: string[]) => Promise<void>
  renameProject: (id: string, newName: string) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  enterFolder: (name: string) => Promise<void>
  goToPath: (path: string) => Promise<void>
  refreshFiles: () => Promise<void>
  refreshWallpaper: () => Promise<void>
  loadDesktopLayout: () => Promise<void>
  saveDesktopLayout: (layout: DesktopLayout) => Promise<void>
  setDesktopEditing: (editing: boolean) => void
  setView: (view: ViewMode) => void
  setSort: (key: SortKey) => void
  setSidebarWidth: (w: number) => void
  setTodoWidth: (w: number) => void
  createFolder: (name: string) => Promise<void>
  createFile: (name: string) => Promise<void>
  renameEntry: (name: string, newName: string) => Promise<void>
  removeEntry: (name: string) => Promise<void>
  removeEntries: (names: string[]) => Promise<void>
  renameLink: (targetPath: string, newName: string) => Promise<void>
  removeLink: (targetPath: string) => Promise<void>
  setLink: (name: string, targetPath: string) => Promise<void>
  uploadFiles: (sources: string[]) => Promise<void>
  togglePin: (path: string) => Promise<void>
  loadTodos: () => Promise<void>
  addTodo: (title: string) => Promise<TodoItem | undefined>
  toggleTodo: (id: string) => Promise<void>
  updateTodo: (id: string, title: string) => Promise<void>
  removeTodo: (id: string) => Promise<void>
  reorderTodos: (orderedIds: string[]) => Promise<void>
  setEditingTodo: (id: string | null) => void
  selectFile: (name: string, mode: 'single' | 'toggle' | 'range') => void
  clearSelection: () => void
  selectAll: () => void
  setSelectedFiles: (names: string[]) => void
  updateLinkSize: (targetPath: string, size: number) => void
  copyEntries: (paths: string[]) => void
  cutEntries: (paths: string[]) => void
  pasteTo: (destDir: string, conflict: 'replace' | 'skip') => Promise<void>
  loadSettings: () => Promise<void>
  saveSettings: (settings: ProjectSettings) => Promise<void>
}

export const useWorkbench = create<WorkbenchState>((set, get) => ({
  projects: [],
  currentProjectId: null,
  currentDir: '',
  breadcrumb: [],
  files: [],
  activeNav: 'project',
  desktopPath: '',
  wallpaper: null,
  desktopLayout: null,
  desktopEditing: false,
  view: 'grid',
  sortKey: 'name',
  sortDir: 'asc',
  sidebarWidth: 224,
  todoWidth: 296,
  todos: [],
  editingTodoId: null,
  settings: { externalLinks: [] },
  selectedFiles: [],
  anchorName: null,
  clipboard: null,

  init: async () => {
    const appSettings = await window.workbench.appSettings.get()
    // 扫描「项目文件夹」，同步磁盘状态（识别新增 + 移除已删除/改名）
    const projects = await window.workbench.projects.scan(appSettings.projectsFolder)
    const ui = await window.workbench.state.getUi()
    set({
      projects,
      view: ui.view === 'list' ? 'list' : 'grid',
      sortKey: (['name', 'size', 'type', 'mtime'].includes(ui.sortKey) ? ui.sortKey : 'name') as SortKey,
      sortDir: ui.sortDir === 'desc' ? 'desc' : 'asc',
      sidebarWidth: typeof ui.sidebarWidth === 'number' ? ui.sidebarWidth : 224,
      todoWidth: typeof ui.todoWidth === 'number' ? ui.todoWidth : 296
    })
    const target = projects.find((p) => p.id === ui.currentProjectId)
    // 恢复上次停留的导航项；首次启动（activeNav 未保存）且无上次项目 → 默认桌面
    if (ui.activeNav === 'desktop') {
      await get().selectDesktop()
    } else if (ui.activeNav === 'library') {
      await get().selectLibrary()
    } else if (target) {
      await get().selectProject(target.id)
    } else if (ui.activeNav === 'project') {
      // 显式停留在项目视图但上次项目已失效：有项目选第一个，无项目保持空项目视图
      if (projects.length > 0) await get().selectProject(projects[0].id)
    } else {
      // 首次启动 / 旧版本（未保存 activeNav）且无上次项目：默认桌面
      await get().selectDesktop()
    }
  },

  // 重新扫描「项目文件夹」，使清单始终反映磁盘状态（窗口聚焦时调用）
  rescanProjects: async () => {
    const appSettings = await window.workbench.appSettings.get()
    const projects = await window.workbench.projects.scan(appSettings.projectsFolder)
    const current = get().currentProjectId
    set({ projects })
    // 当前项目被磁盘删除/改名而失效时，切换到第一个项目或清空
    if (current && !projects.some((p) => p.id === current)) {
      if (projects.length > 0) {
        await get().selectProject(projects[0].id)
      } else {
        set({
          currentProjectId: null,
          currentDir: '',
          breadcrumb: [],
          files: [],
          todos: [],
          settings: { externalLinks: [] }
        })
      }
    }
  },

  selectProject: async (id) => {
    const p = get().projects.find((x) => x.id === id)
    // 点击的已是当前项目、且正位于其根目录：跳过重新列目录/算大小/加载，避免无意义的重复工作
    if (id === get().currentProjectId && get().currentDir === (p?.path ?? '')) return
    set({
      activeNav: 'project',
      currentProjectId: id,
      currentDir: p?.path ?? '',
      breadcrumb: p ? [{ name: p.name, path: p.path }] : [],
      editingTodoId: null,
      selectedFiles: [],
      anchorName: null
    })
    // 监听项目根目录，磁盘上文件变化自动刷新内容区
    if (p) window.workbench.fs.watchProject(p.path)
    persistUi()
    await get().refreshFiles()
    await get().loadTodos()
    await get().loadSettings()
  },

  // 切换到桌面视图：浏览系统桌面文件夹（格子排列 + 壁纸背景），无项目/待办
  selectDesktop: async () => {
    if (get().activeNav === 'desktop') return
    const desktopPath = await window.workbench.getDesktopPath()
    set({
      activeNav: 'desktop',
      desktopPath,
      currentProjectId: null,
      currentDir: desktopPath,
      breadcrumb: [{ name: '桌面', path: desktopPath }],
      selectedFiles: [],
      anchorName: null,
      todos: [],
      editingTodoId: null
    })
    // 不 watch 桌面目录：递归监听 Shell 桌面目录会扰动 explorer 桌面（图标重绘/排列重置），
    // 桌面文件变化改由窗口聚焦时刷新（见 App.tsx onFocus）
    await get().refreshWallpaper()
    await get().loadDesktopLayout()
    await get().refreshFiles()
    persistUi()
  },

  // 重新拉取系统壁纸（进入桌面、窗口重新聚焦时调用），换壁纸后即时更新
  refreshWallpaper: async () => {
    const wp = await window.workbench.getWallpaper()
    set({ wallpaper: wp })
  },

  // 加载桌面布局（分页/小组件/Dock）；无配置时用空布局，只显示程序，小组件由用户自行添加
  loadDesktopLayout: async () => {
    const layout = await window.workbench.desktop.getLayout()
    set({ desktopLayout: migrateLayout(layout) })
  },

  // 保存桌面布局（拖拽/增删/编辑后持久化）
  saveDesktopLayout: async (layout) => {
    set({ desktopLayout: layout })
    await window.workbench.desktop.saveLayout(layout)
  },

  // 切换桌面编辑模式（图标抖动 + 左上角减号）
  setDesktopEditing: (editing) => {
    set({ desktopEditing: editing })
  },

  // 资料库入口（占位）：功能后续完善，先清空内容区
  selectLibrary: async () => {
    if (get().activeNav === 'library') return
    set({
      activeNav: 'library',
      currentProjectId: null,
      currentDir: '',
      breadcrumb: [],
      files: [],
      selectedFiles: [],
      anchorName: null,
      todos: [],
      editingTodoId: null
    })
    persistUi()
  },

  createProject: async (parentDir, name) => {
    const meta = await window.workbench.projects.create(parentDir, name)
    set({ projects: [...get().projects, meta] })
    await get().selectProject(meta.id)
  },

  reorderProjects: async (orderedIds) => {
    const projects = get().projects
    const byId = new Map(projects.map((p) => [p.id, p]))
    const reordered = orderedIds
      .map((id) => byId.get(id))
      .filter((p): p is ProjectMeta => Boolean(p))
    // 同步更新本地顺序，让 dnd-kit 松手时立即平滑过渡到新位置（避免先回原位再跳）
    set({ projects: reordered })
    // 异步持久化到 workbench.json（不阻塞动画）
    await window.workbench.projects.reorder(orderedIds)
  },

  renameProject: async (id, newName) => {
    const updated = await window.workbench.projects.rename(id, newName)
    set({ projects: get().projects.map((p) => (p.id === id ? updated : p)) })
    if (get().currentProjectId === id) {
      set({ currentDir: updated.path, breadcrumb: [{ name: updated.name, path: updated.path }] })
      await get().refreshFiles()
    }
  },

  deleteProject: async (id) => {
    await window.workbench.projects.delete(id)
    const projects = get().projects.filter((p) => p.id !== id)
    set({ projects, editingTodoId: null })
    if (get().currentProjectId === id) {
      const next = projects[0]?.id ?? null
      if (next) {
        await get().selectProject(next)
      } else {
        set({
          currentProjectId: null,
          currentDir: '',
          breadcrumb: [],
          files: [],
          todos: [],
          settings: { externalLinks: [] }
        })
      }
    }
  },

  enterFolder: async (name) => {
    const entry = get().files.find((f) => f.name === name)
    // 外链路径丢失：不进入，交由上层重新指定路径
    if (entry?.linkBroken) return
    const target = entry?.link && entry.target ? entry.target : `${get().currentDir}/${name}`
    set({
      currentDir: target,
      breadcrumb: [...get().breadcrumb, { name, path: target }],
      selectedFiles: [],
      anchorName: null
    })
    await get().refreshFiles()
  },

  goToPath: async (path) => {
    const bc = get().breadcrumb
    const idx = bc.findIndex((b) => b.path === path)
    const newBc = idx >= 0 ? bc.slice(0, idx + 1) : bc
    set({ currentDir: path, breadcrumb: newBc, selectedFiles: [], anchorName: null })
    await get().refreshFiles()
  },

  refreshFiles: async () => {
    const dir = get().currentDir
    // 桌面根目录：列出真实桌面（用户桌面 + 公共桌面 + 虚拟图标）；进入子文件夹后按普通目录列
    if (get().activeNav === 'desktop' && dir === get().desktopPath) {
      const files = await window.workbench.fs.listDesktop()
      set({ files: sortFiles(files, get().sortKey, get().sortDir) })
      return
    }
    if (!dir) {
      set({ files: [] })
      return
    }
    const files = await window.workbench.fs.listDir(dir)
    set({ files: sortFiles(files, get().sortKey, get().sortDir) })
  },

  setView: (view) => {
    set({ view })
    persistUi()
  },

  setSort: (key) => {
    const { sortKey, sortDir, files } = get()
    const dir = sortKey === key ? (sortDir === 'asc' ? 'desc' : 'asc') : 'asc'
    set({ sortKey: key, sortDir: dir, files: sortFiles(files, key, dir) })
    persistUi()
  },

  setSidebarWidth: (w) => {
    set({ sidebarWidth: w })
    persistUi()
  },

  setTodoWidth: (w) => {
    set({ todoWidth: w })
    persistUi()
  },

  createFolder: async (name) => {
    await window.workbench.fs.mkdir(get().currentDir, name)
    await get().refreshFiles()
  },

  createFile: async (name) => {
    await window.workbench.fs.createFile(get().currentDir, name)
    await get().refreshFiles()
  },

  renameEntry: async (name, newName) => {
    await window.workbench.fs.rename(`${get().currentDir}/${name}`, newName)
    await get().refreshFiles()
  },

  removeEntry: async (name) => {
    await window.workbench.fs.remove(`${get().currentDir}/${name}`)
    await get().refreshFiles()
  },

  removeEntries: async (names) => {
    const dir = get().currentDir
    await window.workbench.fs.removeMany(names.map((n) => `${dir}/${n}`))
    await get().refreshFiles()
  },

  renameLink: async (targetPath, newName) => {
    const id = get().currentProjectId
    if (!id) return
    await window.workbench.projects.renameLink(id, targetPath, newName)
    await get().refreshFiles()
  },

  removeLink: async (targetPath) => {
    const id = get().currentProjectId
    if (!id) return
    await window.workbench.projects.removeLink(id, targetPath)
    await get().refreshFiles()
  },

  setLink: async (name, targetPath) => {
    const id = get().currentProjectId
    if (!id) return
    await window.workbench.projects.setLink(id, name, targetPath)
    await get().refreshFiles()
  },

  uploadFiles: async (sources) => {
    await window.workbench.fs.copy(sources, get().currentDir)
    await get().refreshFiles()
  },

  togglePin: async (path) => {
    await window.workbench.fs.togglePin(path)
    await get().refreshFiles()
  },

  loadTodos: async () => {
    const id = get().currentProjectId
    if (!id) {
      set({ todos: [] })
      return
    }
    set({ todos: await window.workbench.todos.list(id) })
  },

  addTodo: async (title) => {
    const id = get().currentProjectId
    if (!id) return undefined
    // 空标题不创建（避免生成空待办行）
    if (!title.trim()) return undefined
    const item = await window.workbench.todos.add(id, title)
    await get().loadTodos()
    return item
  },

  toggleTodo: async (todoId) => {
    const id = get().currentProjectId
    if (!id) return
    await window.workbench.todos.toggle(id, todoId)
    await get().loadTodos()
  },

  updateTodo: async (todoId, title) => {
    const id = get().currentProjectId
    if (!id) return
    await window.workbench.todos.update(id, todoId, title)
    await get().loadTodos()
  },

  removeTodo: async (todoId) => {
    const id = get().currentProjectId
    if (!id) return
    await window.workbench.todos.remove(id, todoId)
    await get().loadTodos()
  },

  reorderTodos: async (orderedIds) => {
    const id = get().currentProjectId
    if (!id) return
    const todos = get().todos
    const byId = new Map(todos.map((t) => [t.id, t]))
    const reordered = orderedIds
      .map((x) => byId.get(x))
      .filter((t): t is TodoItem => Boolean(t))
    for (const t of todos) {
      if (!reordered.includes(t)) reordered.push(t)
    }
    // 同步更新本地，让 dnd-kit 松手平滑过渡
    set({ todos: reordered })
    // 异步持久化
    await window.workbench.todos.reorder(id, orderedIds)
  },

  setEditingTodo: (id) => set({ editingTodoId: id }),

  selectFile: (name, mode) => {
    const { files, selectedFiles, anchorName } = get()
    if (mode === 'single') {
      set({ selectedFiles: [name], anchorName: name })
      return
    }
    if (mode === 'toggle') {
      const has = selectedFiles.includes(name)
      set({
        selectedFiles: has ? selectedFiles.filter((n) => n !== name) : [...selectedFiles, name],
        anchorName: name
      })
      return
    }
    // range：从锚点到当前项之间的连续范围
    const anchor = anchorName ?? name
    const idxA = files.findIndex((f) => f.name === anchor)
    const idxB = files.findIndex((f) => f.name === name)
    if (idxA === -1 || idxB === -1) {
      set({ selectedFiles: [name], anchorName: name })
      return
    }
    const start = Math.min(idxA, idxB)
    const end = Math.max(idxA, idxB)
    set({ selectedFiles: files.slice(start, end + 1).map((f) => f.name) })
  },

  clearSelection: () => set({ selectedFiles: [], anchorName: null }),

  selectAll: () => {
    const files = get().files
    set({
      selectedFiles: files.map((f) => f.name),
      anchorName: files.length > 0 ? files[0].name : null
    })
  },

  setSelectedFiles: (names) => {
    set({ selectedFiles: names, anchorName: names.length > 0 ? names[0] : null })
  },

  updateLinkSize: (targetPath, size) => {
    set({
      files: get().files.map((f) => (f.link && f.target === targetPath ? { ...f, size } : f))
    })
  },

  copyEntries: (paths) => set({ clipboard: { mode: 'copy', paths } }),

  cutEntries: (paths) => set({ clipboard: { mode: 'cut', paths } }),

  pasteTo: async (destDir, conflict) => {
    const cb = get().clipboard
    if (!cb || cb.paths.length === 0) return
    if (cb.mode === 'copy') {
      await window.workbench.fs.copyEntries(cb.paths, destDir, conflict)
    } else {
      await window.workbench.fs.moveEntries(cb.paths, destDir, conflict)
      set({ clipboard: null }) // 剪切粘贴后清空，防止重复粘贴
    }
    await get().refreshFiles()
  },

  loadSettings: async () => {
    const id = get().currentProjectId
    if (!id) return
    set({ settings: await window.workbench.projects.getSettings(id) })
  },

  saveSettings: async (settings) => {
    const id = get().currentProjectId
    if (!id) return
    await window.workbench.projects.saveSettings(id, settings)
    set({ settings })
  }
}))

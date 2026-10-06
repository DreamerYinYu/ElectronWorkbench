import { useEffect, useRef, useState } from 'react'
import { useWorkbench } from './stores/workbench'
import ProjectSidebar from './components/ProjectSidebar'
import FileBrowser from './components/FileBrowser'
import TodoPanel from './components/TodoPanel'
import DesktopView from './components/DesktopView'
import { PinIcon } from './components/icons'
import { Menu } from './components/Menu'
import type { MenuItem } from './components/Menu'
import {
  NewProjectModal,
  ConfirmModal,
  CompressModal,
  ConflictModal,
  PropertyModal,
  PromptModal
} from './components/modals'
import type { FileEntry, ProjectMeta, ConflictDetail } from './types'
import { applyAppearance } from './utils/appearance'
import { formatSize, formatMtime, typeLabel } from './utils/format'
import Titlebar from './components/Titlebar'

const ICON_EDIT = (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11.3 2.7l2 2L6 12H4v-2l7.3-7.3z" />
  </svg>
)
const ICON_ARCHIVE = (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.5 4.5h11l-.9 8h-9.2l-.9-8zM2 4.5l1.5-2h9l1.5 2M8 7v4" />
  </svg>
)
const ICON_TRASH = (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.6 9.5h6.8L12 4" />
  </svg>
)
const ICON_OPEN = (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 4.5h5l1.5 1.5H14v7.5H2V4.5z" />
  </svg>
)
const ICON_EXPLORE = (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 4.5h5l1.5 1.5H14v7.5H2V4.5z" />
    <circle cx="8" cy="9" r="1.8" />
    <path d="M13.4 13.4l-1.9-1.9" />
  </svg>
)
const ICON_LINK = (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6.5 9.5a3 3 0 004.2 0l2-2a3 3 0 00-4.2-4.2M9.5 6.5a3 3 0 00-4.2 0l-2 2a3 3 0 004.2 4.2" />
  </svg>
)
const ICON_COPY = (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
    <path d="M10.5 5.5V4A1.5 1.5 0 009 2.5H4A1.5 1.5 0 002.5 4v5A1.5 1.5 0 004 10.5h1.5" />
  </svg>
)
const ICON_CUT = (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="4" cy="4" r="2" />
    <circle cx="4" cy="12" r="2" />
    <path d="M5.5 5.5L13 12.5M5.5 10.5L13 3.5" />
  </svg>
)
const ICON_PASTE = (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="10" height="11" rx="1.5" />
    <path d="M6 3V2.5A1.5 1.5 0 017.5 1h1A1.5 1.5 0 0110 2.5V3" />
  </svg>
)
const ICON_PROPERTY = (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="8" r="5.8" />
    <path d="M8 7.5V11" />
    <circle cx="8" cy="5" r="0.9" fill="currentColor" stroke="none" />
  </svg>
)
/** 取路径最后一段（文件名/文件夹名），兼容 Windows 反斜杠（渲染进程无 node path） */
function basename(p: string): string {
  const i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'))
  return i < 0 ? p : p.slice(i + 1)
}

export default function App() {
  const init = useWorkbench((s) => s.init)
  const rescanProjects = useWorkbench((s) => s.rescanProjects)
  const projects = useWorkbench((s) => s.projects)
  const currentProjectId = useWorkbench((s) => s.currentProjectId)
  const currentDir = useWorkbench((s) => s.currentDir)
  const enterFolder = useWorkbench((s) => s.enterFolder)
  const renameProject = useWorkbench((s) => s.renameProject)
  const deleteProject = useWorkbench((s) => s.deleteProject)
  const togglePin = useWorkbench((s) => s.togglePin)
  const renameEntry = useWorkbench((s) => s.renameEntry)
  const removeEntry = useWorkbench((s) => s.removeEntry)
  const removeEntries = useWorkbench((s) => s.removeEntries)
  const renameLink = useWorkbench((s) => s.renameLink)
  const removeLink = useWorkbench((s) => s.removeLink)
  const setLink = useWorkbench((s) => s.setLink)
  const clearSelection = useWorkbench((s) => s.clearSelection)
  const refreshFiles = useWorkbench((s) => s.refreshFiles)
  const files = useWorkbench((s) => s.files)
  const selectedFiles = useWorkbench((s) => s.selectedFiles)
  const clipboard = useWorkbench((s) => s.clipboard)
  const updateLinkSize = useWorkbench((s) => s.updateLinkSize)
  const copyEntries = useWorkbench((s) => s.copyEntries)
  const cutEntries = useWorkbench((s) => s.cutEntries)
  const pasteTo = useWorkbench((s) => s.pasteTo)
  const sidebarWidth = useWorkbench((s) => s.sidebarWidth)
  const todoWidth = useWorkbench((s) => s.todoWidth)
  const setSidebarWidth = useWorkbench((s) => s.setSidebarWidth)
  const setTodoWidth = useWorkbench((s) => s.setTodoWidth)
  const breadcrumb = useWorkbench((s) => s.breadcrumb)
  const activeNav = useWorkbench((s) => s.activeNav)

  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [compressOpen, setCompressOpen] = useState(false)
  const [confirm, setConfirm] = useState<{ title: string; message: React.ReactNode; danger?: boolean; onConfirm: () => void } | null>(null)
  const [promptState, setPromptState] = useState<{ title: string; defaultValue: string; onSubmit: (v: string) => void } | null>(null)
  const [projectMenu, setProjectMenu] = useState<{ project: ProjectMeta; anchor: { x: number; y: number } } | null>(null)
  const [ctxMenu, setCtxMenu] = useState<{ entry: FileEntry; anchor: { x: number; y: number } } | null>(null)
  const [conflict, setConflict] = useState<{ details: ConflictDetail[]; destDir: string } | null>(null)
  const [property, setProperty] = useState<{ title: string; rows: { label: string; value: string }[] } | null>(null)

  const sidebarResizeRef = useRef<{ x: number; width: number } | null>(null)
  const todoResizeRef = useRef<{ x: number; width: number } | null>(null)

  const onSidebarResizeStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    sidebarResizeRef.current = { x: e.clientX, width: sidebarWidth }
  }

  const onSidebarResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!sidebarResizeRef.current || e.buttons !== 1) return
    // clientX 是缩放后视口坐标，除以 zoom 转布局像素，保证缩放字体后拖拽宽度变化与鼠标一致
    const zoom = parseFloat(document.documentElement.style.zoom || '') || 1
    const delta = (e.clientX - sidebarResizeRef.current.x) / zoom
    const width = Math.min(400, Math.max(160, sidebarResizeRef.current.width + delta))
    setSidebarWidth(width)
  }

  const onSidebarResizeEnd = () => {
    sidebarResizeRef.current = null
  }

  const onTodoResizeStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    todoResizeRef.current = { x: e.clientX, width: todoWidth }
  }

  const onTodoResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!todoResizeRef.current || e.buttons !== 1) return
    const zoom = parseFloat(document.documentElement.style.zoom || '') || 1
    const delta = (todoResizeRef.current.x - e.clientX) / zoom
    const width = Math.min(600, Math.max(220, todoResizeRef.current.width + delta))
    setTodoWidth(width)
  }

  const onTodoResizeEnd = () => {
    todoResizeRef.current = null
  }

  useEffect(() => {
    init()
    // 应用外观设置（主题/字号），并订阅设置变化实时同步（含文件隐藏项变化时刷新列表）
    window.workbench.appSettings.get().then(applyAppearance)
    const off = window.workbench.onAppearanceChanged((s) => {
      applyAppearance(s)
      refreshFiles()
    })
    return off
  }, [init, refreshFiles])

  // Ctrl+, 打开设置（全局快捷键，对应用户菜单里「设置」的提示）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault()
        void window.workbench.openSettings()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // 窗口重新获得焦点时：同步项目清单（新增/删除项目）；桌面视图额外刷新文件列表 + 壁纸
  // （桌面目录不 watch，避免递归监听扰动 explorer 桌面；聚焦时刷新补上文件/壁纸变化同步）
  useEffect(() => {
    const onFocus = () => {
      rescanProjects()
      if (useWorkbench.getState().activeNav === 'desktop') {
        void useWorkbench.getState().refreshFiles()
        void useWorkbench.getState().refreshWallpaper()
      }
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [rescanProjects])

  // 磁盘文件变化（新建/删除/改名任意格式）时，自动刷新当前文件列表
  useEffect(() => {
    window.workbench.onFilesChanged(() => refreshFiles())
  }, [refreshFiles])

  // 外链目录大小后台统计完成后，更新对应项大小（从「计算中」变真实值）
  useEffect(() => {
    window.workbench.onDirSizeDone((data) => updateLinkSize(data.path, data.size))
  }, [updateLinkSize])

  const openEntry = (entry: FileEntry) => {
    // 外链路径丢失：不导航，直接弹出目录选择重新指定
    if (entry.linkBroken) {
      onSetLink(entry)
      return
    }
    // 虚拟桌面图标（此电脑/回收站）：用 Shell 命名空间路径打开（::CLSID 非文件路径，走不校验路径的顶层 openPath）
    if (entry.virtual && entry.shellPath) {
      void window.workbench.openPath(entry.shellPath)
      return
    }
    const targetPath = entry.path || `${currentDir}/${entry.name}`
    // 桌面模式：模拟真实电脑桌面，文件/快捷方式/文件夹都直接用系统默认方式打开（文件夹新开资源管理器），不视图内导航、不展开面包屑
    if (activeNav === 'desktop') {
      void window.workbench.fs.openPath(targetPath)
      return
    }
    if (entry.type === 'folder') {
      enterFolder(entry.name)
      return
    }
    window.workbench.preview.open(targetPath)
  }

  const onRenameProject = (p: ProjectMeta) => {
    setPromptState({
      title: '重命名项目',
      defaultValue: p.name,
      onSubmit: (name) => {
        if (name !== p.name) renameProject(p.id, name)
      }
    })
  }

  const onDeleteProject = (p: ProjectMeta) => {
    setConfirm({
      title: '删除项目',
      message: (
        <>
          确定删除项目「<b>{p.name}</b>」吗？<br />
          将删除该项目的本地文件夹及全部文件，不可恢复。
        </>
      ),
      danger: true,
      onConfirm: () => deleteProject(p.id)
    })
  }

  const onRenameEntry = (entry: FileEntry) => {
    const isFile = entry.type === 'file'
    let base = entry.name
    let ext = ''
    if (isFile) {
      const i = entry.name.lastIndexOf('.')
      if (i > 0) {
        base = entry.name.slice(0, i)
        ext = entry.name.slice(i)
      }
    }

    setPromptState({
      title: entry.link ? '重命名链接' : '重命名',
      defaultValue: base,
      onSubmit: (name) => {
        if (name === base) return
        // 文件重命名：剥离用户输入的后缀，强制保留原扩展名，防止改文件类型
        const finalName = isFile ? `${name.replace(/\.[^.]+$/, '')}${ext}` : name
        if (entry.link && entry.target) renameLink(entry.target, name)
        else renameEntry(entry.name, finalName)
      }
    })
  }

  const onDeleteEntry = (entry: FileEntry) => {
    // 多选时（右键项在多选集合中），删除所有选中的项
    const isMulti = selectedFiles.length > 1 && selectedFiles.includes(entry.name)
    const targetNames = isMulti ? selectedFiles : [entry.name]
    const targets = targetNames
      .map((n) => files.find((f) => f.name === n))
      .filter((f): f is FileEntry => Boolean(f))

    if (isMulti) {
      const links = targets.filter((f) => f.link && f.target)
      const normalNames = targets.filter((f) => !f.link).map((f) => f.name)
      setConfirm({
        title: '删除',
        message: (
          <>
            确定删除选中的 <b>{targets.length}</b> 项吗？
            {links.length > 0 && <div>外部链接仅移除引用，不删除原文件夹</div>}
          </>
        ),
        danger: true,
        onConfirm: async () => {
          if (normalNames.length) await removeEntries(normalNames)
          for (const l of links) {
            if (l.target) await removeLink(l.target)
          }
          clearSelection()
        }
      })
      return
    }

    setConfirm({
      title: entry.link ? '移除链接' : '删除',
      message: entry.link ? (
        <>确定移除「{entry.name}」链接吗？不会删除原文件夹。</>
      ) : (
        <>确定删除「{entry.name}」吗？</>
      ),
      danger: !entry.link,
      onConfirm: () => {
        if (entry.link && entry.target) removeLink(entry.target)
        else removeEntry(entry.name)
        clearSelection()
      }
    })
  }

  // 键盘 Delete 删除：复用 onDeleteEntry，取选中集合第一项触发（多选时 onDeleteEntry 会删全部选中）
  const onDelete = () => {
    if (selectedFiles.length === 0) return
    const first = files.find((f) => f.name === selectedFiles[0])
    if (first) onDeleteEntry(first)
  }

  const onShowInFolder = (entry: FileEntry) => {
    const target = entry.link && entry.target ? entry.target : `${currentDir}/${entry.name}`
    window.workbench.fs.showInFolder(target)
  }

  const onShowProperty = async (entry: FileEntry) => {
    // 多选：显示选中项汇总（对齐 Windows 多选属性）
    if (selectedFiles.length > 1) {
      const selected = files.filter((f) => selectedFiles.includes(f.name))
      const totalSize = selected.reduce((sum, f) => sum + f.size, 0)
      const types = new Set(selected.map((f) => typeLabel(f)))
      const typeStr = types.size === 1 ? [...types][0] : '多种类型'
      setProperty({
        title: `${selected.length} 个项目属性`,
        rows: [
          { label: '类型', value: typeStr },
          { label: '位置', value: currentDir },
          { label: '大小', value: formatSize(totalSize) }
        ]
      })
      return
    }
    // 单选：显示完整属性
    const path = entry.link && entry.target ? entry.target : `${currentDir}/${entry.name}`
    try {
      const stat = await window.workbench.fs.stat(path)
      setProperty({
        title: '属性',
        rows: [
          { label: '名称', value: entry.name },
          { label: '类型', value: typeLabel(entry) },
          { label: '位置', value: path },
          { label: '大小', value: entry.link ? (entry.size < 0 ? '计算中' : formatSize(entry.size)) : formatSize(entry.size) },
          { label: '创建时间', value: formatMtime(stat.birthtime) },
          { label: '修改时间', value: formatMtime(entry.mtime) }
        ]
      })
    } catch {
      setProperty({
        title: '属性',
        rows: [
          { label: '名称', value: entry.name },
          { label: '类型', value: typeLabel(entry) },
          { label: '位置', value: path },
          { label: '大小', value: entry.link ? (entry.size < 0 ? '计算中' : formatSize(entry.size)) : formatSize(entry.size) },
          { label: '修改时间', value: formatMtime(entry.mtime) }
        ]
      })
    }
  }

  const onShowProjectInFolder = (p: ProjectMeta) => {
    window.workbench.fs.showInFolder(p.path)
  }

  // ===== 桌面视图专用操作（用绝对路径，兼容公共桌面文件；虚拟图标此电脑/回收站不可删除） =====
  const desktopAbsPath = (entry: FileEntry): string => entry.path || `${currentDir}/${entry.name}`

  // 桌面编辑模式「编辑」按钮：重命名快捷方式/文件（绝对路径，兼容公共桌面），不提供删除（避免误删真实桌面）
  const onRenameDesktopEntry = (entry: FileEntry) => {
    const target = desktopAbsPath(entry)
    if (!target) return
    const isFile = entry.type === 'file'
    let base = entry.name
    let ext = ''
    if (isFile) {
      const i = entry.name.lastIndexOf('.')
      if (i > 0) {
        base = entry.name.slice(0, i)
        ext = entry.name.slice(i)
      }
    }
    setPromptState({
      title: '重命名',
      defaultValue: base,
      onSubmit: (name) => {
        if (name === base) return
        const finalName = isFile ? `${name.replace(/\.[^.]+$/, '')}${ext}` : name
        void window.workbench.fs.rename(target, finalName).then(() => refreshFiles())
      }
    })
  }

  const onSetLink = async (entry: FileEntry) => {
    const dir = await window.workbench.selectDirectory()
    if (!dir) return
    await setLink(entry.name, dir)
  }

  // 复制/剪切：把当前选中项转成绝对路径存入剪贴板（外链占位项不参与）
  const onCopyOrCut = (mode: 'copy' | 'cut') => {
    const paths = selectedFiles
      .map((n) => files.find((f) => f.name === n))
      .filter((f): f is FileEntry => f !== undefined && !f.link)
      .map((f) => `${currentDir}/${f.name}`)
    if (paths.length === 0) return
    if (mode === 'copy') copyEntries(paths)
    else cutEntries(paths)
  }

  // 实际执行粘贴（冲突策略已确定），失败时提示
  const doPaste = async (destDir: string, mode: 'replace' | 'skip') => {
    try {
      await pasteTo(destDir, mode)
    } catch (err) {
      window.alert(`粘贴失败：${err instanceof Error ? err.message : String(err)}`)
    }
    clearSelection()
  }

  // 粘贴入口：检测目标目录同名冲突，有冲突弹窗选「替换/跳过/取消」，无冲突直接粘贴
  const onPaste = async (destDir: string) => {
    if (!clipboard || clipboard.paths.length === 0) return
    try {
      const existing = await window.workbench.fs.listDir(destDir)
      const existingByName = new Map(existing.map((e) => [e.name, e]))
      const conflictPaths = clipboard.paths.filter((p) => existingByName.has(basename(p)))
      if (conflictPaths.length > 0) {
        // 组装冲突详情：源 vs 目标的大小/修改时间，供弹窗对比判断
        const details = await Promise.all(
          conflictPaths.map(async (p) => {
            const name = basename(p)
            const target = existingByName.get(name)!
            let source = { size: 0, mtime: 0 }
            try {
              source = await window.workbench.fs.stat(p)
            } catch {
              // 源文件已不存在（如剪切后被外部移动），保留空信息
            }
            return { name, source, target }
          })
        )
        setConflict({ details, destDir })
        return
      }
      await doPaste(destDir, 'skip')
    } catch (err) {
      window.alert(`粘贴失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const fileMenuItems = (entry: FileEntry): MenuItem[] => {
    const items: MenuItem[] = [{ label: '打开', icon: ICON_OPEN, onClick: () => openEntry(entry) }]

    // 复制/剪切：外链占位项不提供（外链是引用，复制/剪切真实内容语义混乱）
    if (!entry.link) {
      items.push({ label: '复制', icon: ICON_COPY, onClick: () => onCopyOrCut('copy') })
      items.push({ label: '剪切', icon: ICON_CUT, onClick: () => onCopyOrCut('cut') })
    }

    // 粘贴：文件夹项提供（粘贴到该文件夹内部），剪贴板为空时置灰
    if (entry.type === 'folder') {
      const dest = entry.link && entry.target ? entry.target : `${currentDir}/${entry.name}`
      items.push({ label: '粘贴', icon: ICON_PASTE, disabled: !clipboard, onClick: () => void onPaste(dest) })
    }

    items.push({ label: '在资源管理器中显示', icon: ICON_EXPLORE, onClick: () => onShowInFolder(entry) })
    items.push({ label: entry.pinned ? '取消置顶' : '置顶', icon: <PinIcon size={14} />, onClick: () => togglePin(entry.link && entry.target ? entry.target : `${currentDir}/${entry.name}`) })

    // 仅项目根目录下的文件夹显示「引用外部文件夹」（不限数量，子文件夹不显示）
    if (breadcrumb.length === 1 && entry.type === 'folder') {
      items.push({ label: '引用外部文件夹', icon: ICON_LINK, onClick: () => onSetLink(entry) })
    }

    items.push({ label: '重命名', icon: ICON_EDIT, onClick: () => onRenameEntry(entry) })
    items.push({ label: '属性', icon: ICON_PROPERTY, onClick: () => void onShowProperty(entry) })
    items.push({
      label: entry.link ? '移除链接' : '删除',
      icon: ICON_TRASH,
      danger: !entry.link,
      onClick: () => onDeleteEntry(entry)
    })
    return items
  }

  const projectMenuItems = (p: ProjectMeta): MenuItem[] => [
    { label: '在资源管理器中显示', icon: ICON_EXPLORE, onClick: () => onShowProjectInFolder(p) },
    { label: '重命名', icon: ICON_EDIT, onClick: () => onRenameProject(p) },
    { label: '压缩项目', icon: ICON_ARCHIVE, onClick: () => setCompressOpen(true) },
    { label: '删除项目', icon: ICON_TRASH, danger: true, onClick: () => onDeleteProject(p) }
  ]

  return (
    <div className="app">
      <Titlebar title="Workbench" />
      <div className="layout">
        <ProjectSidebar
          width={sidebarWidth}
          onNewProject={() => setNewProjectOpen(true)}
          onProjectMenu={(p, anchor) => setProjectMenu({ project: p, anchor })}
          onOpenSettings={() => window.workbench.openSettings()}
          onRenameProject={onRenameProject}
          onDeleteProject={onDeleteProject}
        />
        {/* 侧边栏/内容区拖拽分割线：所有模式（项目/桌面/资料库）都渲染，hover 高亮、可拖拽调侧边栏宽度 */}
        <div
          className="resizer resizer-left"
          style={{ left: sidebarWidth }}
          onPointerDown={onSidebarResizeStart}
          onPointerMove={onSidebarResizeMove}
          onPointerUp={onSidebarResizeEnd}
          onPointerCancel={onSidebarResizeEnd}
        />
        {activeNav === 'project' ? (
          <>
            <FileBrowser
              onPreview={openEntry}
              onContextMenu={(entry, anchor) => setCtxMenu({ entry, anchor })}
              onRename={onRenameEntry}
              onCopy={() => onCopyOrCut('copy')}
              onCut={() => onCopyOrCut('cut')}
              onPaste={() => void onPaste(currentDir)}
              onDelete={onDelete}
              canPaste={Boolean(clipboard && clipboard.paths.length > 0)}
            />
            <TodoPanel width={todoWidth} />
            {/* 项目区/待办区拖拽分割线：仅项目模式（有待办区） */}
            <div
              className="resizer resizer-right"
              style={{ right: todoWidth }}
              onPointerDown={onTodoResizeStart}
              onPointerMove={onTodoResizeMove}
              onPointerUp={onTodoResizeEnd}
              onPointerCancel={onTodoResizeEnd}
            />
          </>
        ) : activeNav === 'desktop' ? (
          <DesktopView onOpen={openEntry} onEdit={onRenameDesktopEntry} />
        ) : (
          <div className="library-view">
            <div className="library-view-empty">资料库功能开发中，敬请期待</div>
          </div>
        )}
      </div>

      {ctxMenu && (
        <Menu
          anchor={ctxMenu.anchor}
          items={fileMenuItems(ctxMenu.entry)}
          onClose={() => {
            setCtxMenu(null)
            clearSelection()
          }}
          onSelect={() => setCtxMenu(null)}
        />
      )}
      {projectMenu && (
        <Menu
          anchor={projectMenu.anchor}
          items={projectMenuItems(projectMenu.project)}
          onClose={() => setProjectMenu(null)}
          onSelect={() => setProjectMenu(null)}
        />
      )}

      {newProjectOpen && <NewProjectModal onClose={() => setNewProjectOpen(false)} />}
      {compressOpen && <CompressModal onClose={() => setCompressOpen(false)} />}
      {promptState && (
        <PromptModal
          title={promptState.title}
          defaultValue={promptState.defaultValue}
          onClose={() => setPromptState(null)}
          onSubmit={(v) => {
            const cb = promptState.onSubmit
            setPromptState(null)
            cb(v)
          }}
        />
      )}
      {confirm && (
        <ConfirmModal
          title={confirm.title}
          message={confirm.message}
          danger={confirm.danger}
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null)
            confirm.onConfirm()
          }}
        />
      )}
      {conflict && (
        <ConflictModal
          details={conflict.details}
          onClose={() => setConflict(null)}
          onReplace={() => {
            const c = conflict
            setConflict(null)
            void doPaste(c.destDir, 'replace')
          }}
          onSkip={() => {
            const c = conflict
            setConflict(null)
            void doPaste(c.destDir, 'skip')
          }}
        />
      )}
      {property && (
        <PropertyModal
          title={property.title}
          rows={property.rows}
          onClose={() => setProperty(null)}
        />
      )}
    </div>
  )
}

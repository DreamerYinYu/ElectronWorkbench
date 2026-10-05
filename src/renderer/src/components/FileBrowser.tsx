import { useEffect, useMemo, useRef, useState } from 'react'
import { useWorkbench } from '../stores/workbench'
import { FileIcon, PinIcon } from './icons'
import Thumbnail from './Thumbnail'
import { PromptModal } from './modals'
import { Menu } from './Menu'
import type { MenuItem } from './Menu'
import { formatSize, formatMtime, typeLabel } from '../utils/format'
import type { FileEntry, SortKey } from '../types'

/** 把鼠标视觉坐标换算为布局坐标（抵消 CSS zoom 对 fixed 定位的影响） */
function layoutPoint(e: { clientX: number; clientY: number }): { x: number; y: number } {
  const zoom = parseFloat(document.documentElement.style.zoom || '') || 1
  return { x: e.clientX / zoom, y: e.clientY / zoom }
}

/** 计算一组文件路径的最长公共父目录（用于反推被拖入的顶层文件夹路径） */
function commonParent(paths: string[]): string {
  if (paths.length === 0) return ''
  const dirs = paths.map((p) => p.split(/[\\/]/).slice(0, -1))
  let common = dirs[0]
  for (const d of dirs.slice(1)) {
    let i = 0
    while (i < common.length && i < d.length && common[i] === d[i]) i++
    common = common.slice(0, i)
  }
  return common.join('\\')
}

const ICON_UPLOAD = (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 10V2.5M5 5l3-3 3 3M2.5 9v3A1.5 1.5 0 004 13.5h8A1.5 1.5 0 0013.5 12V9" />
  </svg>
)
const ICON_FOLDER = (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1.5 4.5A1.5 1.5 0 013 3h3l1.5 1.5H13a1.5 1.5 0 011.5 1.5v6A1.5 1.5 0 0113 13.5H3a1.5 1.5 0 01-1.5-1.5v-7.5z" />
    <path d="M1.5 6.5h13" />
  </svg>
)
const ICON_FILE = (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 2.5h5.5l2.5 2.5v8.5H4V2.5z" />
    <path d="M9.5 2.5v3h3" />
  </svg>
)
const ICON_REFRESH = (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13.5 8a5.5 5.5 0 11-1.6-3.9M13.5 2.5V5h-2.5" />
  </svg>
)
const ICON_PASTE = (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="10" height="11" rx="1.5" />
    <path d="M6 3V2.5A1.5 1.5 0 017.5 1h1A1.5 1.5 0 0110 2.5V3" />
  </svg>
)

/** 判断键盘事件目标是否为可编辑元素（输入框/文本域/可编辑内容），避免 F2/F5 误触发 */
function isEditableTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false
  return t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)
}

export default function FileBrowser({
  onPreview,
  onContextMenu,
  onRename,
  onCopy,
  onCut,
  onPaste,
  onDelete,
  canPaste
}: {
  onPreview: (entry: FileEntry) => void
  onContextMenu: (entry: FileEntry, anchor: { x: number; y: number }) => void
  onRename: (entry: FileEntry) => void
  onCopy: () => void
  onCut: () => void
  onPaste: () => void
  onDelete: () => void
  canPaste: boolean
}) {
  const currentProjectId = useWorkbench((s) => s.currentProjectId)
  const files = useWorkbench((s) => s.files)
  const view = useWorkbench((s) => s.view)
  const sortKey = useWorkbench((s) => s.sortKey)
  const sortDir = useWorkbench((s) => s.sortDir)
  const breadcrumb = useWorkbench((s) => s.breadcrumb)
  const setView = useWorkbench((s) => s.setView)
  const setSort = useWorkbench((s) => s.setSort)
  const enterFolder = useWorkbench((s) => s.enterFolder)
  const goToPath = useWorkbench((s) => s.goToPath)
  const createFolder = useWorkbench((s) => s.createFolder)
  const createFile = useWorkbench((s) => s.createFile)
  const uploadFiles = useWorkbench((s) => s.uploadFiles)
  const refreshFiles = useWorkbench((s) => s.refreshFiles)
  const selectedFiles = useWorkbench((s) => s.selectedFiles)
  const selectFile = useWorkbench((s) => s.selectFile)
  const clearSelection = useWorkbench((s) => s.clearSelection)
  const selectAll = useWorkbench((s) => s.selectAll)
  const setSelectedFiles = useWorkbench((s) => s.setSelectedFiles)
  const clipboard = useWorkbench((s) => s.clipboard)
  const currentDir = useWorkbench((s) => s.currentDir)

  // 处于「剪切待移动」状态的绝对路径集合（复制态无此效果）
  const cuttingSet = useMemo(() => {
    if (clipboard?.mode !== 'cut') return new Set<string>()
    return new Set(clipboard.paths)
  }, [clipboard])

  // 状态栏：选中项数量与选中大小（仅统计文件，文件夹不计入大小）
  const selectedCount = selectedFiles.length
  const selectedSize = useMemo(() => {
    return files.reduce((sum, f) => (selectedFiles.includes(f.name) && f.type === 'file' ? sum + f.size : sum), 0)
  }, [files, selectedFiles])
  const selectedFileCount = useMemo(() => {
    return files.filter((f) => selectedFiles.includes(f.name) && f.type === 'file').length
  }, [files, selectedFiles])

  const fileInputRef = useRef<HTMLInputElement>(null)
  const fileBodyRef = useRef<HTMLDivElement>(null)
  const headInnerRef = useRef<HTMLDivElement>(null)
  const selectionRef = useRef<{ active: boolean; moved: boolean; startX: number; startY: number; base: string[] } | null>(null)
  const dragCounterRef = useRef(0)
  const [rubberBand, setRubberBand] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [newFileOpen, setNewFileOpen] = useState(false)
  const [newFileExt, setNewFileExt] = useState<'txt' | 'md' | 'html'>('txt')
  const [blankMenu, setBlankMenu] = useState<{ x: number; y: number } | null>(null)
  const [hovering, setHovering] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [dragging, setDragging] = useState(false)

  // 带刷新态的刷新（F5 与右键「刷新」共用）：列表先隐藏再淡入
  const doRefresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    const start = Date.now()
    await refreshFiles()
    // 保证刷新态至少可见一小段时间，本地读取过快时也不会闪烁一下就没了
    const remain = Math.max(0, 150 - (Date.now() - start))
    if (remain > 0) await new Promise((r) => setTimeout(r, remain))
    setRefreshing(false)
  }

  // 从外部拖入文件/文件夹：拖文件/文件夹都复制（保留层级，源保留）
  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    if (Array.from(e.dataTransfer.types).includes('Files')) {
      dragCounterRef.current++
      setDragging(true)
    }
  }
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }
  const onDragLeave = (e: React.DragEvent) => {
    dragCounterRef.current--
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0
      setDragging(false)
    }
  }
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current = 0
    setDragging(false)
    void handleDrop(e.dataTransfer)
  }

  const handleDrop = async (dt: DataTransfer) => {
    const files = Array.from(dt.files)
    if (files.length === 0) return
    const hasFolder = Array.from(dt.items).some((item) => item.webkitGetAsEntry?.()?.isDirectory)
    try {
      if (hasFolder) {
        const paths = files.map((f) => window.workbench.fs.getPathForFile(f))
        if (paths.length === 0) return
        let folderPath = ''
        try {
          const st = await window.workbench.fs.statExternal(paths[0])
          folderPath = st.type === 'folder' ? paths[0] : commonParent(paths)
        } catch {
          folderPath = commonParent(paths)
        }
        if (folderPath) {
          await window.workbench.fs.copy([folderPath], currentDir)
          await refreshFiles()
        }
      } else {
        const paths = files.map((f) => window.workbench.fs.getPathForFile(f))
        if (paths.length) {
          await window.workbench.fs.copy(paths, currentDir)
          await refreshFiles()
        }
      }
    } catch (err) {
      window.alert(`复制失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // 单击文件：按 shift/ctrl 或单选处理选中
  const handleFileClick = (f: FileEntry, e: React.MouseEvent) => {
    if (e.shiftKey) selectFile(f.name, 'range')
    else if (e.ctrlKey || e.metaKey) selectFile(f.name, 'toggle')
    else selectFile(f.name, 'single')
  }

  // 框选（橡皮筋选择）：空白处按下拖动出矩形，实时选中框内文件（全局监听，支持拖出内容区）
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const sel = selectionRef.current
      if (!sel || !sel.active) return
      const dx = e.clientX - sel.startX
      const dy = e.clientY - sel.startY
      if (!sel.moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return
      sel.moved = true
      // 框选范围裁剪到 item 区域（file-body）内，不超出、不覆盖面包屑/表头/状态栏
      const body = fileBodyRef.current?.getBoundingClientRect()
      const rect = {
        left: Math.min(sel.startX, e.clientX),
        top: Math.min(sel.startY, e.clientY),
        right: Math.max(sel.startX, e.clientX),
        bottom: Math.max(sel.startY, e.clientY)
      }
      if (body) {
        rect.left = Math.max(rect.left, body.left)
        rect.top = Math.max(rect.top, body.top)
        rect.right = Math.min(rect.right, body.right)
        rect.bottom = Math.min(rect.bottom, body.bottom)
      }
      // 矩形框用 fixed 定位（布局坐标 = 视觉坐标 / zoom）
      const zoom = parseFloat(document.documentElement.style.zoom || '') || 1
      setRubberBand({
        x: rect.left / zoom,
        y: rect.top / zoom,
        w: (rect.right - rect.left) / zoom,
        h: (rect.bottom - rect.top) / zoom
      })
      // 命中判断：与矩形相交的文件项（getBoundingClientRect 已是视觉坐标）
      const names: string[] = []
      fileBodyRef.current?.querySelectorAll<HTMLElement>('[data-name]').forEach((el) => {
        const r = el.getBoundingClientRect()
        if (r.left < rect.right && r.right > rect.left && r.top < rect.bottom && r.bottom > rect.top) {
          const n = el.dataset.name
          if (n) names.push(n)
        }
      })
      const merged = Array.from(new Set([...sel.base, ...names]))
      // 仅当选中集实际变化时才写入，避免拖动过程中高频重渲染
      const current = useWorkbench.getState().selectedFiles
      if (merged.length !== current.length || merged.some((n) => !current.includes(n))) {
        useWorkbench.getState().setSelectedFiles(merged)
      }
    }
    const onUp = () => {
      const sel = selectionRef.current
      if (!sel || !sel.active) return
      sel.active = false
      setRubberBand(null)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  // F5 刷新（鼠标悬停内容区时）；F2 重命名（选中单个文件时）；Ctrl+C/X/V 复制/剪切/粘贴
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const editable = isEditableTarget(e.target)
      if (e.key === 'F5' && hovering) {
        e.preventDefault()
        void doRefresh()
      } else if (e.key === 'F2' && selectedFiles.length === 1 && !editable) {
        e.preventDefault()
        const entry = files.find((f) => f.name === selectedFiles[0])
        if (entry) onRename(entry)
      } else if (e.key === 'Delete' && selectedFiles.length > 0 && !editable) {
        e.preventDefault()
        onDelete()
      } else if ((e.ctrlKey || e.metaKey) && hovering && !editable) {
        const k = e.key.toLowerCase()
        if (k === 'a' && files.length > 0) {
          e.preventDefault()
          selectAll()
        } else if (k === 'c' && selectedFiles.length > 0) {
          e.preventDefault()
          onCopy()
        } else if (k === 'x' && selectedFiles.length > 0) {
          e.preventDefault()
          onCut()
        } else if (k === 'v' && canPaste) {
          e.preventDefault()
          onPaste()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // 横向滚动同步：表头在滚动容器外（竖向固定），横向滚动时让表头内容跟随文件列表平移，保持列对齐
  useEffect(() => {
    const body = fileBodyRef.current
    if (!body) return
    const onScroll = () => {
      const inner = headInnerRef.current
      if (inner) inner.style.transform = `translateX(-${body.scrollLeft}px)`
    }
    body.addEventListener('scroll', onScroll, { passive: true })
    return () => body.removeEventListener('scroll', onScroll)
  }, [])

  const onCreateFolder = () => setNewFolderOpen(true)

  const onCreateFile = (name: string) => {
    // 只允许创建文本文件：剥离用户输入的后缀，强制补选定格式后缀
    const base = name.replace(/\.[^.]+$/, '')
    createFile(`${base}.${newFileExt}`)
  }

  const onUpload = () => fileInputRef.current?.click()

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const paths = Array.from(e.target.files || []).map((f) => window.workbench.fs.getPathForFile(f))
    if (paths.length) uploadFiles(paths)
    e.target.value = ''
  }

  const blankMenuItems: MenuItem[] = [
    { label: '上传文件', icon: ICON_UPLOAD, onClick: onUpload },
    { label: '新建文件夹', icon: ICON_FOLDER, onClick: () => setNewFolderOpen(true) },
    { label: '粘贴', icon: ICON_PASTE, disabled: !canPaste, onClick: onPaste },
    { label: '刷新', icon: ICON_REFRESH, onClick: () => void doRefresh() }
  ]

  const sortArrows = (key: SortKey) => {
    const active = sortKey === key
    return (
      <span className={`sort-arrows ${active ? 'active' : ''}`}>
        <i className={`up ${active && sortDir === 'asc' ? 'on' : ''}`} />
        <i className={`down ${active && sortDir === 'desc' ? 'on' : ''}`} />
      </span>
    )
  }

  const openEntry = (f: FileEntry) => {
    if (f.type === 'folder') enterFolder(f.name)
    else onPreview(f)
  }

  return (
    <main className="main" onMouseEnter={() => setHovering(true)} onMouseLeave={() => setHovering(false)}>
      <div className="toolbar">
        <button className="btn primary" disabled={!currentProjectId} onClick={onUpload}>
          <svg viewBox="0 0 16 16" width="15" height="15">
            <path d="M8 10V2.5M5 5l3-3 3 3M2.5 9v3A1.5 1.5 0 004 13.5h8A1.5 1.5 0 0013.5 12V9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          上传文件
        </button>
        <button className="btn" disabled={!currentProjectId} onClick={onCreateFolder}>
          <svg viewBox="0 0 16 16" width="15" height="15">
            <path d="M1.5 4.5a1.5 1.5 0 011.5-1.5h3l1.5 1.5h5.5a1.5 1.5 0 011.5 1.5v6A1.5 1.5 0 0113 13.5H3a1.5 1.5 0 01-1.5-1.5v-7.5z" fill="none" stroke="currentColor" strokeWidth="1.3" />
            <path d="M1.5 6.5h13" stroke="currentColor" strokeWidth="1.3" />
          </svg>
          新建文件夹
        </button>
        <button className="btn" disabled={!currentProjectId} onClick={() => setNewFileOpen(true)}>
          <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 2.5h5.5l2.5 2.5v8.5H4V2.5z" />
            <path d="M9.5 2.5v3h3" />
          </svg>
          新建文件
        </button>
        <div className="spacer" />
        <span className="file-count">{files.length} 个对象</span>
        <div className="view-toggle">
          <button className={`vt-btn ${view === 'grid' ? 'active' : ''}`} title="图标视图" onClick={() => setView('grid')}>
            <svg viewBox="0 0 16 16" width="15" height="15">
              <rect x="2" y="2" width="5" height="5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.3" />
              <rect x="9" y="2" width="5" height="5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.3" />
              <rect x="2" y="9" width="5" height="5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.3" />
              <rect x="9" y="9" width="5" height="5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.3" />
            </svg>
          </button>
          <button className={`vt-btn ${view === 'list' ? 'active' : ''}`} title="列表视图" onClick={() => setView('list')}>
            <svg viewBox="0 0 16 16" width="15" height="15">
              <path d="M2.5 4h11M2.5 8h11M2.5 12h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <button className="refresh-btn" title="刷新" onClick={() => void doRefresh()}>
          {ICON_REFRESH}
        </button>
      </div>

      <div
        className={`file-area ${refreshing ? 'refreshing' : ''}`}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={(e) => {
          if (e.target instanceof Element && e.target.closest('.file-card, .file-row, .crumb-bar')) return
          // 框选拖动结束后触发的 click，不再清空选中
          if (selectionRef.current?.moved) return
          clearSelection()
        }}
        onContextMenu={(e) => {
          if (e.target instanceof Element && e.target.closest('.file-card, .file-row, .crumb-bar')) return
          e.preventDefault()
          clearSelection()
          setBlankMenu(layoutPoint(e))
        }}
      >
        <div className="crumb-bar">
          {breadcrumb.map((b, i) => (
            <span key={b.path}>
              {i > 0 && <span className="crumb-sep">/</span>}
              <span
                className={`crumb ${i === breadcrumb.length - 1 ? 'current' : ''}`}
                onClick={() => goToPath(b.path)}
              >
                {b.name}
              </span>
            </span>
          ))}
        </div>
        {view === 'list' && files.length > 0 && (
          <div className="file-list-head">
            <div className="file-list-head-inner" ref={headInnerRef}>
              <span className="col-name">
                <span className="sortable" onClick={() => setSort('name')}>
                  文件
                  {sortArrows('name')}
                </span>
                <span className="load-hint">已全部加载，共{files.length}个</span>
              </span>
              <span className="col-size">
                <span className="sortable" onClick={() => setSort('size')}>
                  大小{sortArrows('size')}
                </span>
              </span>
              <span className="col-type">
                <span className="sortable" onClick={() => setSort('type')}>
                  类型{sortArrows('type')}
                </span>
              </span>
              <span className="col-time">
                <span className="sortable" onClick={() => setSort('mtime')}>
                  修改时间{sortArrows('mtime')}
                </span>
              </span>
            </div>
          </div>
        )}
        <div
          className="file-body"
          ref={fileBodyRef}
          onMouseDown={(e) => {
            // 框选只在 item 区域内有效：空白处按下拖动出矩形（Ctrl 按下则保留现有选中作为框选基底）
            if (e.button !== 0) return
            if (e.target instanceof Element && e.target.closest('.file-card, .file-row')) return
            const ctrl = e.ctrlKey || e.metaKey
            const base = ctrl ? useWorkbench.getState().selectedFiles : []
            if (!ctrl) useWorkbench.getState().clearSelection()
            selectionRef.current = { active: true, moved: false, startX: e.clientX, startY: e.clientY, base }
          }}
        >
        {files.length === 0 ? (
          <div className="file-empty">
            <div className="big">📂</div>
            此文件夹为空
          </div>
        ) : view === 'grid' ? (
          <div className="file-grid">
            {files.map((f) => (
              <div
                key={f.name}
                data-name={f.name}
                className={`file-card ${selectedFiles.includes(f.name) ? 'selected' : ''} ${cuttingSet.has(`${currentDir}/${f.name}`) ? 'cutting' : ''}`}
                onClick={(e) => handleFileClick(f, e)}
                onDoubleClick={() => openEntry(f)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  if (!selectedFiles.includes(f.name)) {
                    selectFile(f.name, e.ctrlKey || e.metaKey ? 'toggle' : 'single')
                  }
                  onContextMenu(f, layoutPoint(e))
                }}
              >
                {f.pinned && (
                  <div className="pin-badge">
                    <PinIcon />
                  </div>
                )}
                <div className="file-icon">
                  <Thumbnail entry={f} size={52} />
                </div>
                <div className={`file-name ${f.linkBroken ? 'link-broken' : ''}`}>
                  {f.name}
                  {f.linkBroken && <span className="link-broken-suffix">（路径丢失）</span>}
                </div>
                {f.link && <span className="link-tag">外部</span>}
              </div>
            ))}
          </div>
        ) : (
          <div className="file-list">
            {files.map((f) => (
              <div
                key={f.name}
                data-name={f.name}
                className={`file-row ${selectedFiles.includes(f.name) ? 'selected' : ''} ${cuttingSet.has(`${currentDir}/${f.name}`) ? 'cutting' : ''}`}
                onClick={(e) => handleFileClick(f, e)}
                onDoubleClick={() => openEntry(f)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  if (!selectedFiles.includes(f.name)) {
                    selectFile(f.name, e.ctrlKey || e.metaKey ? 'toggle' : 'single')
                  }
                  onContextMenu(f, layoutPoint(e))
                }}
              >
                <span className="col-name">
                  <span className="row-icon">
                    <FileIcon type={f.type} ext={f.ext} link={f.link} size={26} />
                  </span>
                  <span className={`row-label ${f.linkBroken ? 'link-broken' : ''}`}>
                    {f.name}
                    {f.linkBroken && <span className="link-broken-suffix">（路径丢失）</span>}
                  </span>
                  {f.link && <span className="link-tag">外部</span>}
                  {f.pinned && (
                    <span className="pin-inline">
                      <PinIcon size={14} />
                    </span>
                  )}
                </span>
                <span className="col-size">{formatSize(f.size)}</span>
                <span className="col-type">{typeLabel(f)}</span>
                <span className="col-time">{formatMtime(f.mtime)}</span>
              </div>
            ))}
          </div>
        )}
        </div>
        <div className="status-bar">
          <span>{files.length} 个项目</span>
          {selectedCount > 0 && <span className="status-sep">|</span>}
          {selectedCount > 0 && (
            <span>
              选中 {selectedCount} 个项目{selectedFileCount > 0 ? `　${formatSize(selectedSize)}` : ''}
            </span>
          )}
        </div>
        {rubberBand && (
          <div
            className="marquee"
            style={{ left: rubberBand.x, top: rubberBand.y, width: rubberBand.w, height: rubberBand.h }}
          />
        )}
        {dragging && <div className="drop-overlay">释放以导入文件</div>}
      </div>

      <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={onFileChange} />

      {blankMenu && (
        <Menu
          anchor={blankMenu}
          items={blankMenuItems}
          onClose={() => setBlankMenu(null)}
          onSelect={() => setBlankMenu(null)}
        />
      )}

      {newFolderOpen && (
        <PromptModal
          title="新建文件夹"
          defaultValue="新建文件夹"
          onClose={() => setNewFolderOpen(false)}
          onSubmit={(name) => {
            setNewFolderOpen(false)
            createFolder(name)
          }}
        />
      )}

      {newFileOpen && (
        <PromptModal
          title="新建文件"
          defaultValue="新建文件"
          placeholder="文件名，如 说明"
          extra={
            <div className="file-type-pick">
              <span className="file-type-label">类型</span>
              {(['txt', 'md', 'html'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`ft-btn ${newFileExt === f ? 'on' : ''}`}
                  onClick={() => setNewFileExt(f)}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
          }
          onClose={() => setNewFileOpen(false)}
          onSubmit={(name) => {
            setNewFileOpen(false)
            onCreateFile(name)
          }}
        />
      )}
    </main>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useWorkbench } from '../stores/workbench'
import DesktopIcon from './DesktopIcon'
import { desktopDisplayName } from '../utils/format'
import type { FileEntry } from '../types'

function isEditableTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false
  return t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)
}

/**
 * 桌面视图：模拟真实电脑桌面——壁纸背景 + 大图标网格，单击选中、双击打开、
 * 鼠标按下框选、Delete 删除、F5 刷新、Ctrl+A 全选（无右键菜单）。
 */
export default function DesktopView({
  onOpen,
  onDelete
}: {
  onOpen: (entry: FileEntry) => void
  onDelete: () => void
}) {
  const files = useWorkbench((s) => s.files)
  const wallpaper = useWorkbench((s) => s.wallpaper)
  const selectedFiles = useWorkbench((s) => s.selectedFiles)
  const selectFile = useWorkbench((s) => s.selectFile)
  const clearSelection = useWorkbench((s) => s.clearSelection)
  const selectAll = useWorkbench((s) => s.selectAll)
  const refreshFiles = useWorkbench((s) => s.refreshFiles)
  const [hovering, setHovering] = useState(false)
  const gridRef = useRef<HTMLDivElement>(null)
  const selectionRef = useRef<{ active: boolean; moved: boolean; startX: number; startY: number; base: string[] } | null>(null)
  const [rubberBand, setRubberBand] = useState<{ x: number; y: number; w: number; h: number } | null>(null)

  const handleClick = (f: FileEntry, e: React.MouseEvent) => {
    if (e.shiftKey) selectFile(f.name, 'range')
    else if (e.ctrlKey || e.metaKey) selectFile(f.name, 'toggle')
    else selectFile(f.name, 'single')
  }

  // 框选（橡皮筋选择）：空白处按下拖动出矩形，实时选中框内图标
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const sel = selectionRef.current
      if (!sel || !sel.active) return
      const dx = e.clientX - sel.startX
      const dy = e.clientY - sel.startY
      if (!sel.moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return
      sel.moved = true
      const rect = {
        left: Math.min(sel.startX, e.clientX),
        top: Math.min(sel.startY, e.clientY),
        right: Math.max(sel.startX, e.clientX),
        bottom: Math.max(sel.startY, e.clientY)
      }
      const body = gridRef.current?.getBoundingClientRect()
      if (body) {
        rect.left = Math.max(rect.left, body.left)
        rect.top = Math.max(rect.top, body.top)
        rect.right = Math.min(rect.right, body.right)
        rect.bottom = Math.min(rect.bottom, body.bottom)
      }
      const zoom = parseFloat(document.documentElement.style.zoom || '') || 1
      setRubberBand({
        x: rect.left / zoom,
        y: rect.top / zoom,
        w: (rect.right - rect.left) / zoom,
        h: (rect.bottom - rect.top) / zoom
      })
      const names: string[] = []
      gridRef.current?.querySelectorAll<HTMLElement>('[data-name]').forEach((el) => {
        const r = el.getBoundingClientRect()
        if (r.left < rect.right && r.right > rect.left && r.top < rect.bottom && r.bottom > rect.top) {
          const n = el.dataset.name
          if (n) names.push(n)
        }
      })
      const merged = Array.from(new Set([...sel.base, ...names]))
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

  // 键盘：Delete 删除选中、F5 刷新、Ctrl+A 全选（鼠标悬停桌面时，避开输入框）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!hovering || isEditableTarget(e.target)) return
      if (e.key === 'Delete' && selectedFiles.length > 0) {
        e.preventDefault()
        onDelete()
      } else if (e.key === 'F5') {
        e.preventDefault()
        void refreshFiles()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && files.length > 0) {
        e.preventDefault()
        selectAll()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hovering, selectedFiles.length, onDelete, refreshFiles, selectAll, files.length])

  return (
    <div
      className="desktop-view"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onContextMenu={(e) => e.preventDefault()}
      style={
        wallpaper
          ? { backgroundImage: `url(${wallpaper})`, backgroundSize: 'cover', backgroundPosition: 'center' }
          : undefined
      }
      onClick={(e) => {
        if (e.target instanceof Element && e.target.closest('.desktop-icon')) return
        // 框选拖动结束后触发的 click，不清空刚框选的结果
        if (selectionRef.current?.moved) return
        clearSelection()
      }}
    >
      <div
        className="desktop-grid"
        ref={gridRef}
        onMouseDown={(e) => {
          // 框选只在空白处按下有效（非图标项）
          if (e.button !== 0) return
          if (e.target instanceof Element && e.target.closest('.desktop-icon')) return
          const ctrl = e.ctrlKey || e.metaKey
          const base = ctrl ? useWorkbench.getState().selectedFiles : []
          if (!ctrl) useWorkbench.getState().clearSelection()
          selectionRef.current = { active: true, moved: false, startX: e.clientX, startY: e.clientY, base }
        }}
      >
        {files.map((f) => (
          <div
            key={f.name}
            data-name={f.name}
            className={`desktop-icon ${selectedFiles.includes(f.name) ? 'selected' : ''}`}
            onClick={(e) => handleClick(f, e)}
            onDoubleClick={() => onOpen(f)}
          >
            <div className="desktop-icon-img">
              <DesktopIcon entry={f} />
            </div>
            <div className="desktop-icon-label">{desktopDisplayName(f.name)}</div>
          </div>
        ))}
      </div>
      {rubberBand && (
        <div
          className="marquee"
          style={{ left: rubberBand.x, top: rubberBand.y, width: rubberBand.w, height: rubberBand.h }}
        />
      )}
    </div>
  )
}

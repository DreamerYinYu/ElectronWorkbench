import { useEffect, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay
} from '@dnd-kit/core'
import type { DragStartEvent, DragEndEvent, DragOverEvent } from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useWorkbench } from '../stores/workbench'
import { zoomCollisionDetection, zoomModifier, zoomMeasuring, zoomTransform } from '../utils/dnd'
import UserMenu from './UserMenu'
import type { ProjectMeta } from '../types'

/** 把鼠标视觉坐标换算为布局坐标（抵消 CSS zoom 对 fixed 定位的影响） */
function layoutPoint(e: { clientX: number; clientY: number }): { x: number; y: number } {
  const zoom = parseFloat(document.documentElement.style.zoom || '') || 1
  return { x: e.clientX / zoom, y: e.clientY / zoom }
}

const ICON_DESKTOP = (
  <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2.5" width="12" height="8.5" rx="1.5" />
    <path d="M6 14h4M8 11v3" />
  </svg>
)

const ICON_LIBRARY = (
  <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 4.3C7.2 3.4 6 3 4.6 3H2.5v9.5h2.4c1.3 0 2.4.3 3.1 1.2.7-.9 1.8-1.2 3.1-1.2h2.4V3h-2.1C10 3 8.8 3.4 8 4.3z" />
    <path d="M8 4.5v9" />
  </svg>
)

const ICON_FOLDER = (
  <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 4.2c0-.7.6-1.2 1.2-1.2h2.6l1.4 1.6h5.6c.7 0 1.2.5 1.2 1.2v6c0 .7-.6 1.2-1.2 1.2H3.2c-.7 0-1.2-.5-1.2-1.2V4.2z" />
  </svg>
)

function ProjectItem({
  p,
  active,
  onSelect,
  onContextMenu,
  onMoreMenu
}: {
  p: ProjectMeta
  active: boolean
  onSelect: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onMoreMenu: (anchor: { x: number; y: number }) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: p.id })
  const style = {
    transform: CSS.Transform.toString(zoomTransform(transform)),
    transition,
    opacity: isDragging ? 0 : 1
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`project-item ${active ? 'active' : ''}`}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      {...attributes}
      {...listeners}
    >
      <span className="project-icon">{ICON_FOLDER}</span>
      <div className="project-meta">
        <div className="project-name">{p.name}</div>
      </div>
      <button
        className="project-more"
        title="更多操作"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          const rect = e.currentTarget.getBoundingClientRect()
          // 视觉坐标除以 zoom 转布局坐标，避免字号放大时菜单被往下/往右推
          const zoom = parseFloat(document.documentElement.style.zoom || '') || 1
          onMoreMenu({ x: (rect.left - 120) / zoom, y: (rect.bottom + 4) / zoom })
        }}
      >
        <svg viewBox="0 0 16 16" width="15" height="15">
          <circle cx="3" cy="8" r="1.4" fill="currentColor" />
          <circle cx="8" cy="8" r="1.4" fill="currentColor" />
          <circle cx="13" cy="8" r="1.4" fill="currentColor" />
        </svg>
      </button>
    </div>
  )
}

export default function ProjectSidebar({
  width,
  onNewProject,
  onProjectMenu,
  onOpenSettings,
  onRenameProject,
  onDeleteProject
}: {
  width?: number
  onNewProject: () => void
  onProjectMenu: (project: ProjectMeta, anchor: { x: number; y: number }) => void
  onOpenSettings: () => void
  onRenameProject: (p: ProjectMeta) => void
  onDeleteProject: (p: ProjectMeta) => void
}) {
  const projects = useWorkbench((s) => s.projects)
  const currentProjectId = useWorkbench((s) => s.currentProjectId)
  const selectProject = useWorkbench((s) => s.selectProject)
  const reorderProjects = useWorkbench((s) => s.reorderProjects)
  const selectedFiles = useWorkbench((s) => s.selectedFiles)
  const activeNav = useWorkbench((s) => s.activeNav)
  const selectDesktop = useWorkbench((s) => s.selectDesktop)
  const selectLibrary = useWorkbench((s) => s.selectLibrary)

  // 本地排序列表：拖拽时实时重排（挤进去的动画），松手后持久化
  const [items, setItems] = useState<ProjectMeta[]>(projects)

  // 外部 projects 变化（新建/删除/重扫）时同步到本地
  useEffect(() => {
    setItems(projects)
  }, [projects])

  // F2 重命名 / Delete 删除：作用于当前选中的项目（未选中文件时，避免与文件快捷键冲突）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement) {
        if (e.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return
      }
      if (selectedFiles.length > 0) return
      const project = items.find((p) => p.id === currentProjectId)
      if (!project) return
      if (e.key === 'F2') {
        e.preventDefault()
        onRenameProject(project)
      } else if (e.key === 'Delete') {
        e.preventDefault()
        onDeleteProject(project)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const activeProject = items.find((p) => p.id === activeId) ?? null

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id))
    document.body.classList.add('is-dragging')
  }

  // 拖拽经过其他项时实时重排，让位动画由 dnd-kit 基于 items 实时计算
  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e
    if (over && active.id !== over.id) {
      setItems((prev) => {
        const oldIndex = prev.findIndex((p) => p.id === active.id)
        const newIndex = prev.findIndex((p) => p.id === over.id)
        if (oldIndex < 0 || newIndex < 0) return prev
        return arrayMove(prev, oldIndex, newIndex)
      })
    }
  }

  // 松手时 items 已是最终顺序，只持久化，不再重排（避免其他项被二次扰动）
  const onDragEnd = () => {
    setActiveId(null)
    document.body.classList.remove('is-dragging')
    reorderProjects(items.map((p) => p.id))
  }

  const onDragCancel = () => {
    setActiveId(null)
    document.body.classList.remove('is-dragging')
  }

  return (
    <aside className="sidebar" style={{ width }}>
      <div className="nav-section">
        <button
          className={`side-nav-item ${activeNav === 'desktop' ? 'active' : ''}`}
          onClick={() => void selectDesktop()}
        >
          <span className="side-nav-icon">{ICON_DESKTOP}</span>
          <span>桌面</span>
        </button>
        <button
          className={`side-nav-item ${activeNav === 'library' ? 'active' : ''}`}
          onClick={() => void selectLibrary()}
        >
          <span className="side-nav-icon">{ICON_LIBRARY}</span>
          <span>资料库</span>
        </button>
      </div>
      <div className="sidebar-divider" />

      <div className="sidebar-head">
        <span className="sidebar-head-title">项目</span>
        <button className="btn-add" title="新建项目" onClick={onNewProject}>
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1.5 4.5A1.5 1.5 0 013 3h2.5l1.5 1.5H13a1.5 1.5 0 011.5 1.5v6A1.5 1.5 0 0113 13.5H3a1.5 1.5 0 01-1.5-1.5v-7.5z" />
            <circle cx="11.8" cy="3.6" r="2.3" fill="currentColor" stroke="none" />
            <path d="M11.8 2.7v1.8M10.9 3.6h1.8" stroke="var(--panel)" strokeWidth="1.1" />
          </svg>
        </button>
      </div>

      <DndContext
        sensors={sensors}
        measuring={zoomMeasuring}
        collisionDetection={zoomCollisionDetection}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <SortableContext items={items.map((p) => p.id)} strategy={verticalListSortingStrategy}>
          <div className="project-list">
            {items.length === 0 && <div className="sidebar-empty">暂无项目，点击上方 + 新建</div>}
            {items.map((p) => (
              <ProjectItem
                key={p.id}
                p={p}
                active={p.id === currentProjectId}
                onSelect={() => selectProject(p.id)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  onProjectMenu(p, layoutPoint(e))
                }}
                onMoreMenu={(anchor) => onProjectMenu(p, anchor)}
              />
            ))}
          </div>
        </SortableContext>
        <DragOverlay modifiers={[zoomModifier]}>
          {activeProject ? (
            <div className="project-item dragging-overlay">
              <span className="project-icon">{ICON_FOLDER}</span>
              <div className="project-meta">
                <div className="project-name">{activeProject.name}</div>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <UserMenu onOpenSettings={onOpenSettings} />
    </aside>
  )
}

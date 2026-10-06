import { useEffect, useMemo, useRef, useState } from 'react'
import { useWorkbench } from '../stores/workbench'
import DesktopIcon from './DesktopIcon'
import WidgetCard from './WidgetCard'
import { Menu } from './Menu'
import type { MenuItem } from './Menu'
import { desktopDisplayName } from '../utils/format'
import type { FileEntry, DesktopLayout, DesktopWidget, DesktopIconPos } from '../types'

/** 图标单元最小尺寸（列宽自适应容器，此值为最小列宽） */
const CELL = 96
/** 图标显示尺寸（固定，不随列宽缩放） */
const ICON_SIZE = 60
/** 编辑模式无操作自动退出的时长（毫秒） */
const JIGGLE_TIMEOUT = 30000
/** 网格间距 */
const GAP = 14
/** 桌面内容区边距 */
const PADDING = 20
/** 按下移动超过该像素判定为拖拽 */
const DRAG_THRESHOLD = 5

const WIDGET_SIZE: Record<DesktopWidget['type'], { w: number; h: number }> = {
  clock: { w: 2, h: 2 },
  todos: { w: 4, h: 2 },
  projects: { w: 4, h: 2 },
  system: { w: 2, h: 2 }
}

const WIDGET_LABELS: Record<DesktopWidget['type'], string> = {
  clock: '时钟',
  todos: '待办',
  projects: '最近项目',
  system: '系统状态'
}

function itemKey(entry: FileEntry): string {
  return entry.path || entry.shellPath || entry.name
}

/** 解析桌面图标：layout.icons 里已有的用其网格坐标，新文件追加默认位置 */
function resolveIcons(files: FileEntry[], layout: DesktopLayout | null): { key: string; entry: FileEntry; col: number; row: number }[] {
  const byKey = new Map<string, FileEntry>()
  for (const f of files) byKey.set(itemKey(f), f)
  const dockSet = new Set(layout?.dock ?? [])

  const result: { key: string; entry: FileEntry; col: number; row: number }[] = []
  const placed = new Set<string>()

  for (const p of layout?.icons ?? []) {
    if (dockSet.has(p.key)) continue
    const f = byKey.get(p.key)
    if (f) {
      result.push({ key: p.key, entry: f, col: p.col, row: p.row })
      placed.add(p.key)
    }
  }

  // 新文件默认按 A-Z 名称排序填充（与「自动排列」同一基准，避免首次切自定义时顺序跳变）
  const newFiles = [...files].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  let n = result.length
  for (const f of newFiles) {
    const k = itemKey(f)
    if (placed.has(k) || dockSet.has(k)) continue
    const COLS = 8
    result.push({ key: k, entry: f, col: n % COLS, row: Math.floor(n / COLS) })
    placed.add(k)
    n++
  }

  return result
}

/** 判断目标网格区域是否已被其他图标/小组件占用（排除 selfKey 与 dock，网格坐标） */
function isSlotOccupied(
  layout: DesktopLayout,
  selfKey: string,
  col: number,
  row: number,
  w: number,
  h: number
): boolean {
  const dockSet = new Set(layout.dock ?? [])
  for (const p of layout.icons) {
    if (p.key === selfKey) continue
    if (dockSet.has(p.key)) continue
    if (p.col >= col && p.col < col + w && p.row >= row && p.row < row + h) return true
  }
  for (const wd of layout.widgets) {
    if (wd.id === selfKey) continue
    if (col < wd.col + wd.w && col + w > wd.col && row < wd.row + wd.h && row + h > wd.row) return true
  }
  return false
}

interface DragState {
  kind: 'icon' | 'widget'
  key: string
  entry?: FileEntry
  widget?: DesktopWidget
  /** 拖拽来源：grid（网格图标/小组件）或 dock（Dock 图标） */
  from: 'grid' | 'dock'
  /** ghost 左上角（canvas 布局坐标，= 原图标左上角 + 鼠标位移） */
  origX: number
  origY: number
  /** 按下时鼠标的视口坐标（用于算位移） */
  startX: number
  startY: number
  moved: boolean
  x: number
  y: number
}

/** 桌面视图：菜单栏 + 网格对齐图标/小组件（列宽自适应容器）+ 底部 Dock */
export default function DesktopView({
  onOpen,
  onEdit
}: {
  onOpen: (entry: FileEntry) => void
  onEdit: (entry: FileEntry) => void
}) {
  const files = useWorkbench((s) => s.files)
  const wallpaper = useWorkbench((s) => s.wallpaper)
  const layout = useWorkbench((s) => s.desktopLayout)
  const editing = useWorkbench((s) => s.desktopEditing)
  const setEditing = useWorkbench((s) => s.setDesktopEditing)
  const saveLayout = useWorkbench((s) => s.saveDesktopLayout)

  const [time, setTime] = useState(() => new Date())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [viewportW, setViewportW] = useState(1200)
  /** 内容区可视高度（滚动容器 .desktop-pages 的高度，作 canvas 最小高度，保证空白区域可框选） */
  const [viewportH, setViewportH] = useState(600)
  const [rubberBand, setRubberBand] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [editMenu, setEditMenu] = useState<{ x: number; y: number } | null>(null)
  /** 「查看」菜单的下拉菜单锚点（null = 关闭） */
  const [viewMenu, setViewMenu] = useState<{ x: number; y: number } | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const pagesRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const selectState = useRef<{ startX: number; startY: number; baseKeys: string[] } | null>(null)
  const anchorRef = useRef<string | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const suppressClickRef = useRef(false)

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!editing) return
    const t = setTimeout(() => setEditing(false), JIGGLE_TIMEOUT)
    return () => clearTimeout(t)
  }, [editing, setEditing])

  // 新文件同步 + 死图标清理（icons 始终只含有效文件；增删双向同步）
  useEffect(() => {
    if (!layout) return
    const fileKeys = new Set<string>()
    for (const f of files) fileKeys.add(itemKey(f))
    const dockSet = new Set(layout.dock ?? [])
    const icons = layout.icons.filter((p) => fileKeys.has(p.key))
    let changed = icons.length !== layout.icons.length
    const existing = new Set(icons.map((p) => p.key))
    // 新文件默认按 A-Z 名称排序填充（与「自动排列」同一基准），避免首次切自定义时顺序跳变
    const sortedFiles = [...files].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    let n = icons.length
    for (const f of sortedFiles) {
      const k = itemKey(f)
      if (!existing.has(k) && !dockSet.has(k)) {
        const COLS = 8
        icons.push({ key: k, col: n % COLS, row: Math.floor(n / COLS) })
        existing.add(k)
        n++
        changed = true
      }
    }
    if (changed) void saveLayout({ ...layout, icons })
  }, [files, layout, saveLayout])

  // 测量容器宽度 + 内容区可视高度，列数/列宽/canvas 最小高度随之自适应
  useEffect(() => {
    const el = pagesRef.current
    if (!el) return
    const update = (): void => {
      setViewportW(el.clientWidth)
      // 可视高度取滚动容器（.desktop-pages，flex:1 由布局决定）而非 canvas 自身，
      // 避免 canvasHeight 依赖自身高度形成循环——一旦撑大就永远缩不回去（空白 + 滚动条常驻）
      const pages = gridRef.current
      if (pages) setViewportH(pages.clientHeight)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 列数/列宽自适应容器：列数按最小单元算，列宽均分铺满（左右对称）
  const usableW = Math.max(0, viewportW - PADDING * 2)
  const cols = Math.max(1, Math.floor((usableW + GAP) / (CELL + GAP)))
  const colW = (usableW - (cols - 1) * GAP) / cols

  const icons = useMemo(() => resolveIcons(files, layout), [files, layout])
  const widgets = layout?.widgets ?? []
  const autoArrange = layout?.autoArrange ?? true

  // 最终摆放位置：自动排列 = A-Z 按名称排序 + 按当前列数流式排；自定义 = 用户拖拽的 col/row
  const placed = useMemo(() => {
    const list = autoArrange
      ? [...icons].sort((a, b) => a.entry.name.localeCompare(b.entry.name, 'zh-CN'))
      : icons
    return list.map((item, i) => ({
      ...item,
      col: autoArrange ? i % cols : item.col,
      row: autoArrange ? Math.floor(i / cols) : item.row
    }))
  }, [icons, autoArrange, cols])

  const cellX = (col: number): number => PADDING + col * (colW + GAP)
  const cellY = (row: number): number => PADDING + row * (CELL + GAP)

  const canvasHeight = useMemo(() => {
    let maxBottom = 0
    for (const i of placed) maxBottom = Math.max(maxBottom, i.row * (CELL + GAP) + CELL)
    for (const w of widgets) maxBottom = Math.max(maxBottom, w.row * (CELL + GAP) + w.h * CELL + (w.h - 1) * GAP)
    // 最小高度 = 内容区可视高度（图标少时撑满可视区，可框选/右键）；内容更多时按实际内容高度（可滚动）
    return Math.max(viewportH, maxBottom + PADDING)
  }, [placed, widgets, viewportH])

  const dockEntries = useMemo(() => {
    const byKey = new Map(files.map((f) => [itemKey(f), f]))
    const keys = layout?.dock ?? []
    return keys.map((k) => byKey.get(k)).filter((f): f is FileEntry => Boolean(f))
  }, [layout, files])

  // ===== 拖拽移动（网格吸附） =====
  const onGridMouseDown = (e: React.MouseEvent): void => {
    if (e.button !== 0) return
    const t = e.target instanceof Element ? e.target : null
    if (t && t.closest('.desktop-dock, .desktop-remove-btn')) return

    const itemEl = t?.closest<HTMLElement>('.desktop-item')
    if (itemEl) {
      // 图标按下：进入拖拽（自动排列下只能拖到 Dock，网格内不换位；自定义排列下可自由换位）
      e.preventDefault()
      const key = itemEl.getAttribute('data-key')
      const widgetId = itemEl.getAttribute('data-widget-id')
      let st: DragState | null = null
      if (widgetId) {
        const w = (layout?.widgets ?? []).find((x) => x.id === widgetId)
        if (w) {
          st = {
            kind: 'widget',
            key: widgetId,
            widget: w,
            from: 'grid',
            origX: cellX(w.col),
            origY: cellY(w.row),
            startX: e.clientX,
            startY: e.clientY,
            moved: false,
            x: cellX(w.col),
            y: cellY(w.row)
          }
        }
      } else if (key) {
        const entry = files.find((f) => itemKey(f) === key)
        // 拖拽起点用「实际显示位置」（placed 的 col/row），自动排列下是 A-Z 流式排、自定义排列下是用户摆放坐标，
        // 不能用 layout.icons 的坐标（自动排列时两者不一致，会导致 ghost 起点偏移）
        const placedItem = placed.find((p) => p.key === key)
        const oc = placedItem?.col ?? 0
        const or = placedItem?.row ?? 0
        st = {
          kind: 'icon',
          key,
          entry,
          from: 'grid',
          origX: cellX(oc),
          origY: cellY(or),
          startX: e.clientX,
          startY: e.clientY,
          moved: false,
          x: cellX(oc),
          y: cellY(or)
        }
      }
      if (!st) return
      suppressClickRef.current = false
      setDrag(st)
      dragRef.current = st
      return
    }

    // 空白按下：编辑模式下点击空白 = 退出编辑；否则进入框选
    if (editing) {
      setEditing(false)
      return
    }
    const ctrl = e.ctrlKey || e.metaKey
    selectState.current = { startX: e.clientX, startY: e.clientY, baseKeys: ctrl ? [...selected] : [] }
    if (!ctrl) setSelected(new Set())
  }

  // Dock 图标按下：开始拖拽（可拖回网格），松手在网格区域则移回 grid（移动语义）
  const onDockMouseDown = (entry: FileEntry, e: React.MouseEvent): void => {
    if (e.button !== 0) return
    if (editing) return
    e.preventDefault()
    const key = itemKey(entry)
    // ghost 初始位置对齐「dock 图标中心」（而非鼠标点），保证不管按在 dock 图标哪个位置，ghost 图标都和 dock 图标重合
    const zoom = parseFloat(document.documentElement.style.zoom || '') || 1
    const dockRect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const cRect = canvasRef.current?.getBoundingClientRect()
    const dockCx = cRect
      ? (dockRect.left + dockRect.width / 2 - cRect.left) / zoom
      : dockRect.left + dockRect.width / 2
    const dockCy = cRect
      ? (dockRect.top + dockRect.height / 2 - cRect.top) / zoom
      : dockRect.top + dockRect.height / 2
    const st: DragState = {
      kind: 'icon',
      key,
      entry,
      from: 'dock',
      origX: dockCx - colW / 2,
      // ghost 图标中心到 ghost 顶部 = 6px padding + 图标半高（ICON_SIZE/2）
      origY: dockCy - (ICON_SIZE / 2 + 6),
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      x: dockCx - colW / 2,
      y: dockCy - (ICON_SIZE / 2 + 6)
    }
    suppressClickRef.current = false
    setDrag(st)
    dragRef.current = st
  }

  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      const d = dragRef.current
      if (d) {
        const zoom = parseFloat(document.documentElement.style.zoom || '') || 1
        const dx = (e.clientX - d.startX) / zoom
        const dy = (e.clientY - d.startY) / zoom
        if (!d.moved) {
          if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
            d.moved = true
            suppressClickRef.current = true
          }
        }
        if (d.moved) {
          const next = { ...d, x: d.origX + dx, y: d.origY + dy }
          dragRef.current = next
          setDrag(next)
        }
        return
      }

      const s = selectState.current
      if (!s) return
      const rect = {
        left: Math.min(s.startX, e.clientX),
        top: Math.min(s.startY, e.clientY),
        right: Math.max(s.startX, e.clientX),
        bottom: Math.max(s.startY, e.clientY)
      }
      const zoom = parseFloat(document.documentElement.style.zoom || '') || 1
      setRubberBand({
        x: rect.left / zoom,
        y: rect.top / zoom,
        w: (rect.right - rect.left) / zoom,
        h: (rect.bottom - rect.top) / zoom
      })
      const names: string[] = []
      gridRef.current?.querySelectorAll<HTMLElement>('[data-key]').forEach((el) => {
        const r = el.getBoundingClientRect()
        if (r.left < rect.right && r.right > rect.left && r.top < rect.bottom && r.bottom > rect.top) {
          const k = el.dataset.key
          if (k) names.push(k)
        }
      })
      setSelected(new Set([...s.baseKeys, ...names]))
    }

    const onUp = (e: MouseEvent): void => {
      const d = dragRef.current
      if (d) {
        if (d.moved) {
          const el = document.elementFromPoint(e.clientX, e.clientY)
          const dockEl = el?.closest('.desktop-dock')
          const l = layout ?? { icons: [], widgets: [], dock: [] }
          // 落位直接按 ghost 左上角（d.x/d.y 即原图标左上角 + 位移，canvas 布局坐标）吸附网格，
          // 与 ghost 视觉位置严格一致，不会偏半格
          const col = Math.max(0, Math.round((d.x - PADDING) / (colW + GAP)))
          const row = Math.max(0, Math.round((d.y - PADDING) / (CELL + GAP)))

          if (d.kind === 'icon') {
            if (d.from === 'grid' && dockEl) {
              // 网格 → Dock（移动）
              const icons = l.icons.filter((p) => p.key !== d.key)
              const dock = l.dock.includes(d.key) ? l.dock : [...l.dock, d.key]
              void saveLayout({ ...l, icons, dock })
            } else if (d.from === 'dock' && !dockEl) {
              // Dock → 网格（移动回），目标格被占则不动
              if (!isSlotOccupied(l, d.key, col, row, 1, 1)) {
                const dock = l.dock.filter((k) => k !== d.key)
                const icons = l.icons.some((p) => p.key === d.key)
                  ? l.icons.map((p) => (p.key === d.key ? { ...p, col, row } : p))
                  : [...l.icons, { key: d.key, col, row }]
                void saveLayout({ ...l, icons, dock })
              }
            } else if (d.from === 'grid' && !dockEl) {
              // 网格 → 网格：仅自定义排列下才吸附换位；自动排列下网格位置由 A-Z 固定，拖拽不改变位置
              if (!(layout?.autoArrange ?? true) && !isSlotOccupied(l, d.key, col, row, 1, 1)) {
                const icons = l.icons.some((p) => p.key === d.key)
                  ? l.icons.map((p) => (p.key === d.key ? { ...p, col, row } : p))
                  : [...l.icons, { key: d.key, col, row }]
                void saveLayout({ ...l, icons })
              }
            }
            // from='dock' 且松手仍在 Dock：留在 Dock，不移动
          } else {
            // 小组件（仅网格）：吸附
            const w = d.widget?.w ?? 1
            const h = d.widget?.h ?? 1
            if (!isSlotOccupied(l, d.key, col, row, w, h)) {
              const widgets = l.widgets.map((x) => (x.id === d.key ? { ...x, col, row } : x))
              void saveLayout({ ...l, widgets })
            }
          }
        }
        dragRef.current = null
        setDrag(null)
        return
      }

      selectState.current = null
      setRubberBand(null)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, files, colW])

  const onClickIcon = (entry: FileEntry, e: React.MouseEvent): void => {
    if (editing) return
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    const key = itemKey(entry)

    if (e.shiftKey && anchorRef.current) {
      const keys = placed.map((c) => c.key)
      const a = keys.indexOf(anchorRef.current)
      const b = keys.indexOf(key)
      if (a >= 0 && b >= 0) {
        const lo = Math.min(a, b)
        const hi = Math.max(a, b)
        setSelected(new Set(keys.slice(lo, hi + 1)))
      }
      return
    }

    if (e.ctrlKey || e.metaKey) {
      const next = new Set(selected)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      setSelected(next)
      anchorRef.current = key
      return
    }
    if (selected.size === 1 && selected.has(key)) return
    setSelected(new Set([key]))
    anchorRef.current = key
  }

  const removeWidget = (w: DesktopWidget): void => {
    const l: DesktopLayout = layout ?? { icons: [], widgets: [], dock: [] }
    void saveLayout({ ...l, widgets: l.widgets.filter((x) => x.id !== w.id) })
  }

  const addWidget = (type: DesktopWidget['type']): void => {
    const l: DesktopLayout = layout ?? { icons: [], widgets: [], dock: [] }
    const size = WIDGET_SIZE[type]
    const widget: DesktopWidget = {
      id: `${type}-${Date.now()}`,
      type,
      w: size.w,
      h: size.h,
      col: (l.widgets.length % 4) * 2,
      row: Math.floor(l.widgets.length / 4) * 2 + 3
    }
    void saveLayout({ ...l, widgets: [...l.widgets, widget] })
  }

  const removeFromDock = (entry: FileEntry): void => {
    const l: DesktopLayout = layout ?? { icons: [], widgets: [], dock: [] }
    const key = itemKey(entry)
    void saveLayout({ ...l, dock: (l.dock ?? []).filter((k) => k !== key) })
  }

  const openEditMenu = (e: React.MouseEvent): void => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const zoom = parseFloat(document.documentElement.style.zoom || '') || 1
    setEditMenu({ x: rect.left / zoom, y: rect.bottom / zoom })
  }

  const editMenuItems: MenuItem[] = [
    { label: '编辑页面', onClick: () => setEditing(true) },
    {
      label: '添加小组件',
      children: (Object.keys(WIDGET_LABELS) as DesktopWidget['type'][]).map((t) => ({
        label: WIDGET_LABELS[t],
        onClick: () => addWidget(t)
      }))
    }
  ]

  // 「查看」菜单：自动排列 / 自定义排列（互斥勾选，对齐 Windows 桌面）
  const openViewMenu = (e: React.MouseEvent): void => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const zoom = parseFloat(document.documentElement.style.zoom || '') || 1
    setViewMenu({ x: rect.left / zoom, y: rect.bottom / zoom })
  }

  const setAutoArrange = (v: boolean): void => {
    const l = layout ?? { icons: [], widgets: [], dock: [] }
    // 只切换模式标志，不覆盖 icons 坐标：icons 始终保存用户的自定义排列（拖拽时更新），
    // 自动排列时忽略 icons 坐标（运行时 A-Z 计算），切回自定义即恢复用户上次的排列；
    // 默认坐标填充本身已是 A-Z，所以首次切自定义与自动排列顺序一致
    void saveLayout({ ...l, autoArrange: v })
  }

  const viewMenuItems: MenuItem[] = [
    { label: '自动排列图标', checked: autoArrange, onClick: () => setAutoArrange(true) },
    { label: '自定义排列', checked: !autoArrange, onClick: () => setAutoArrange(false) }
  ]

  const pad = (n: number): string => String(n).padStart(2, '0')
  const week = ['日', '一', '二', '三', '四', '五', '六'][time.getDay()]

  // 界面缩放比例（字体大小设置）：clientX/clientY 是缩放后的视口坐标，fixed 定位需换算回布局坐标
  const zoom = parseFloat(document.documentElement.style.zoom || '') || 1

  const dragPos = drag?.moved
    ? { kind: drag.kind, key: drag.key, x: drag.x, y: drag.y, entry: drag.entry, widget: drag.widget }
    : null

  // ghost 用 fixed 定位（覆盖 Dock），需把 canvas 布局坐标（d.x/d.y = 原图标左上角 + 位移）换算成视口布局坐标
  const canvasRect = canvasRef.current?.getBoundingClientRect()
  const dragViewX = dragPos ? dragPos.x + (canvasRect ? canvasRect.left / zoom : 0) : 0
  const dragViewY = dragPos ? dragPos.y + (canvasRect ? canvasRect.top / zoom : 0) : 0

  return (
    <div
      ref={pagesRef}
      className="desktop-view"
      style={
        wallpaper
          ? { backgroundImage: `url(${wallpaper})`, backgroundSize: 'cover', backgroundPosition: 'center' }
          : undefined
      }
    >
      {/* 顶部菜单栏 */}
      <div className="desktop-menubar">
        <span className="desktop-menubar-menu">访达</span>
        <span className="desktop-menubar-menu">文件</span>
        <span className="desktop-menubar-menu desktop-menubar-menu-action" onClick={openEditMenu}>
          编辑
        </span>
        <span className="desktop-menubar-menu desktop-menubar-menu-action" onClick={openViewMenu}>
          查看
        </span>
        <span className="desktop-menubar-menu">前往</span>
        <span className="desktop-menubar-menu">窗口</span>
        <span className="desktop-menubar-menu">帮助</span>
        <div className="desktop-menubar-spacer" />
        <span className="desktop-menubar-time">
          {time.getMonth() + 1}月{time.getDate()}日 周{week} {pad(time.getHours())}:{pad(time.getMinutes())}
        </span>
      </div>

      {/* 内容区（竖向滚动，列宽自适应容器） */}
      <div className="desktop-pages" ref={gridRef} onMouseDown={onGridMouseDown}>
        <div className="desktop-canvas" ref={canvasRef} style={{ height: canvasHeight }}>
          {placed.map(({ key, entry, col, row }) => {
            const isVirtual = !!entry.virtual
            const x = cellX(col)
            const y = cellY(row)
            return (
              <div
                key={key}
                data-key={key}
                className={`desktop-item ${selected.has(key) ? 'selected' : ''} ${editing ? 'jiggling' : ''}`}
                style={{ left: x, top: y, width: colW }}
                onClick={(e) => onClickIcon(entry, e)}
                onDoubleClick={() => {
                  if (!editing) onOpen(entry)
                }}
              >
                <div className="desktop-icon-holder">
                  <div className="desktop-item-icon" style={{ width: ICON_SIZE, height: ICON_SIZE }}>
                    <DesktopIcon entry={entry} size={ICON_SIZE} />
                  </div>
                  {editing && !isVirtual && (
                    <button className="desktop-remove-btn" title="编辑" onClick={() => onEdit(entry)}>
                      <svg
                        viewBox="0 0 16 16"
                        width="11"
                        height="11"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M11.3 2.7l2 2L6 12H4v-2l7.3-7.3z" />
                      </svg>
                    </button>
                  )}
                </div>
                <div className="desktop-item-label" style={{ maxWidth: colW - 12 }}>
                  {desktopDisplayName(entry.name)}
                </div>
              </div>
            )
          })}
          {widgets.map((w) => {
            const x = cellX(w.col)
            const y = cellY(w.row)
            return (
              <div
                key={w.id}
                data-widget-id={w.id}
                className={`desktop-widget-item ${editing ? 'jiggling' : ''}`}
                style={{ left: x, top: y, width: w.w * colW + (w.w - 1) * GAP, height: w.h * CELL + (w.h - 1) * GAP }}
              >
                <div className="desktop-widget-holder">
                  <WidgetCard widget={w} />
                  {editing && (
                    <button className="desktop-remove-btn" onClick={() => removeWidget(w)}>
                      −
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 底部 Dock */}
      <div className="desktop-dock">
        <div className="desktop-dock-inner">
          {dockEntries.map((entry) => (
            <div
              key={itemKey(entry)}
              className={`desktop-dock-icon ${editing ? 'jiggling' : ''}`}
              onMouseDown={(e) => onDockMouseDown(entry, e)}
              onDoubleClick={() => {
                if (!editing) onOpen(entry)
              }}
            >
              <div className="desktop-dock-icon-inner">
                <DesktopIcon entry={entry} size={ICON_SIZE} />
              </div>
              {editing && (
                <button className="desktop-remove-btn" onClick={() => removeFromDock(entry)}>
                  −
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 拖拽跟手预览：暗色 ghost（fixed 定位，覆盖在 Dock 之上） */}
      {dragPos?.kind === 'icon' && dragPos.entry && (
        <div
          className="desktop-drag-ghost"
          style={{
            left: dragViewX,
            top: dragViewY,
            width: colW,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-start',
            gap: 6,
            padding: '6px 2px'
          }}
        >
          <div className="desktop-icon-holder">
            <div className="desktop-item-icon" style={{ width: ICON_SIZE, height: ICON_SIZE }}>
              <DesktopIcon entry={dragPos.entry} size={ICON_SIZE} />
            </div>
          </div>
          <div className="desktop-item-label" style={{ maxWidth: colW - 12 }}>
            {desktopDisplayName(dragPos.entry.name)}
          </div>
        </div>
      )}
      {dragPos?.kind === 'widget' && dragPos.widget && (
        <div
          className="desktop-drag-ghost"
          style={{
            left: dragViewX,
            top: dragViewY,
            width: dragPos.widget.w * colW + (dragPos.widget.w - 1) * GAP,
            height: dragPos.widget.h * CELL + (dragPos.widget.h - 1) * GAP
          }}
        >
          <WidgetCard widget={dragPos.widget} />
        </div>
      )}

      {/* 左上角「编辑」下拉菜单 */}
      {editMenu && (
        <Menu
          anchor={editMenu}
          items={editMenuItems}
          onClose={() => setEditMenu(null)}
          onSelect={() => setEditMenu(null)}
        />
      )}

      {/* 「查看」下拉菜单（自动排列/自定义排列） */}
      {viewMenu && (
        <Menu
          anchor={viewMenu}
          items={viewMenuItems}
          onClose={() => setViewMenu(null)}
          onSelect={() => setViewMenu(null)}
        />
      )}

      {/* 框选矩形 */}
      {rubberBand && (
        <div className="marquee" style={{ left: rubberBand.x, top: rubberBand.y, width: rubberBand.w, height: rubberBand.h }} />
      )}
    </div>
  )
}

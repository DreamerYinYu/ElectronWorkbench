import { useEffect, useMemo, useRef, useState } from 'react'
import { useWorkbench } from '../stores/workbench'
import DesktopIcon from './DesktopIcon'
import { Menu } from './Menu'
import type { MenuItem } from './Menu'
import { desktopDisplayName } from '../utils/format'
import type { FileEntry, DesktopLayout, DesktopIconPos } from '../types'

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

function itemKey(entry: FileEntry): string {
  return entry.path || entry.shellPath || entry.name
}

/** 解析桌面图标：layout.icons 里已有的用其网格坐标，新文件从空位起依次追加（不与已有坐标/小组件重叠） */
function resolveIcons(
  files: FileEntry[],
  layout: DesktopLayout | null,
  cols: number
): { key: string; entry: FileEntry; col: number; row: number }[] {
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

  // 新文件默认按 A-Z 名称排序，从第一个空位起依次排（不与已有图标重叠）
  const newFiles = [...files].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  const occupied = collectOccupiedSlots(result)
  for (const f of newFiles) {
    const k = itemKey(f)
    if (placed.has(k) || dockSet.has(k)) continue
    const slot = findFreeSlot(occupied, cols)
    result.push({ key: k, entry: f, col: slot.col, row: slot.row })
    placed.add(k)
  }

  return result
}

/** 判断目标网格区域是否已被其他图标占用（排除 selfKey 与 dock，网格坐标） */
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
  return false
}

/** 拆开重叠：保持数组顺序，同一格（col/row）的图标依次往后找空位（横向 ++col，行尾换行），返回无重叠的 icons */
function dedupeIconPositions(icons: DesktopIconPos[], cols: number): DesktopIconPos[] {
  const occupied = new Set<string>()
  return icons.map((p) => {
    let col = p.col
    let row = p.row
    while (occupied.has(`${col},${row}`)) {
      col++
      if (col >= cols) {
        col = 0
        row++
      }
    }
    occupied.add(`${col},${row}`)
    return col === p.col && row === p.row ? p : { ...p, col, row }
  })
}

/** 收集已占格子（icons 的每个格子），key 为 "col,row" */
function collectOccupiedSlots(icons: DesktopIconPos[]): Set<string> {
  const occupied = new Set<string>()
  for (const p of icons) occupied.add(`${p.col},${p.row}`)
  return occupied
}

/** 从 (0,0) 起按行优先找第一个空位，返回坐标并把该格标记为已占 */
function findFreeSlot(occupied: Set<string>, cols: number): { col: number; row: number } {
  let col = 0
  let row = 0
  while (occupied.has(`${col},${row}`)) {
    col++
    if (col >= cols) {
      col = 0
      row++
    }
  }
  occupied.add(`${col},${row}`)
  return { col, row }
}

interface DragState {
  kind: 'icon'
  key: string
  entry?: FileEntry
  /** 拖拽来源：grid（网格图标）或 dock（Dock 图标） */
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
  const dockInnerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!editing) return
    const t = setTimeout(() => setEditing(false), JIGGLE_TIMEOUT)
    return () => clearTimeout(t)
  }, [editing, setEditing])

  // 列数/列宽自适应容器：列数按最小单元算，列宽均分铺满（左右对称）。
  // 注意：必须定义在「新文件同步」useEffect 之前——其依赖数组 render 时同步求值，cols 后置会触发 TDZ 错误
  const usableW = Math.max(0, viewportW - PADDING * 2)
  const cols = Math.max(1, Math.floor((usableW + GAP) / (CELL + GAP)))
  const colW = (usableW - (cols - 1) * GAP) / cols

  // 新文件同步 + 死图标清理（icons 始终只含有效文件；增删双向同步）
  useEffect(() => {
    if (!layout) return
    // 文件列表为空（加载中 / listDesktop 失败）时跳过同步，避免把 icons 误清空导致桌面空白、布局丢失
    if (files.length === 0) return
    const fileKeys = new Set<string>()
    for (const f of files) fileKeys.add(itemKey(f))
    const dockSet = new Set(layout.dock ?? [])
    const icons = layout.icons.filter((p) => fileKeys.has(p.key))
    let changed = icons.length !== layout.icons.length
    const existing = new Set(icons.map((p) => p.key))
    // 新文件按 A-Z 名称排序，从第一个空位起依次追加（不与已有图标坐标撞车）
    const sortedFiles = [...files].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    const occupied = collectOccupiedSlots(icons.filter((p) => !dockSet.has(p.key)))
    for (const f of sortedFiles) {
      const k = itemKey(f)
      if (!existing.has(k) && !dockSet.has(k)) {
        const slot = findFreeSlot(occupied, cols)
        icons.push({ key: k, col: slot.col, row: slot.row })
        existing.add(k)
        changed = true
      }
    }
    if (changed) void saveLayout({ ...layout, icons })
  }, [files, layout, saveLayout, cols])

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

  const icons = useMemo(() => resolveIcons(files, layout, cols), [files, layout, cols])
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
    // 最小高度 = 内容区可视高度（图标少时撑满可视区，可框选/右键）；内容更多时按实际内容高度（可滚动）
    return Math.max(viewportH, maxBottom + PADDING)
  }, [placed, viewportH])

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
      let st: DragState | null = null
      if (key) {
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
    // ghost 初始位置对齐「dock 图标中心」（而非鼠标点），保证不管按在 dock 图标哪个位置，ghost 图标都和 dock 图标重合。
    // dock 图标 hover 时处于放大态（底边锚定往上长、中心上移），dockRect 是放大后的边界，
    // 故 dockCy 用「放大后中心」（top + height/2），让 ghost 对齐用户看到的放大图标位置。
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
          let x = d.origX + dx
          let y = d.origY + dy
          // clamp：预图标（ghost）不离开可视区、不越过 Dock 底边（canvas 布局坐标）
          const canvasEl = canvasRef.current
          if (canvasEl) {
            const cRect = canvasEl.getBoundingClientRect()
            const cw = cRect.width / zoom
            x = Math.max(0, Math.min(x, cw - colW))
            y = Math.max(0, y)
            const dockEl = document.querySelector<HTMLElement>('.desktop-dock')
            if (dockEl) {
              const dockBottom = (dockEl.getBoundingClientRect().bottom - cRect.top) / zoom
              // 底部约束用「ghost 图标底边」（6 padding-top + 图标，固定值）而非实测整体高度（含文字），避免首帧兜底高度≠实测高度造成抖动
              y = Math.min(y, dockBottom - (6 + ICON_SIZE))
            }
          }
          const next = { ...d, x, y }
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
          const l = layout ?? { icons: [], widgets: [], dock: [] }
          const dockRoot = document.querySelector<HTMLElement>('.desktop-dock')
          // 「是否落在 Dock」用鼠标 clientY 是否越过 Dock 顶边判定，而非 elementFromPoint 像素命中
          // （拖到 Dock 下方/窗外时命中不稳定，导致有时去 Dock、有时不去）
          const inDock = dockRoot ? e.clientY >= dockRoot.getBoundingClientRect().top : false
          // 落位直接按 ghost 左上角（d.x/d.y 即原图标左上角 + 位移，canvas 布局坐标）吸附网格，
          // 与 ghost 视觉位置严格一致，不会偏半格。
          // 注意：这里不再按「Dock 顶边」压行号——画布可滚动，下方行是合法位置；
          // ghost 的视觉边界已由拖拽时的 clamp（底边不越 Dock 底边）保证
          const col = Math.max(0, Math.round((d.x - PADDING) / (colW + GAP)))
          const row = Math.max(0, Math.round((d.y - PADDING) / (CELL + GAP)))

          if (d.kind === 'icon') {
            if (d.from === 'grid' && inDock) {
              // 网格 → Dock（移动）
              const icons = l.icons.filter((p) => p.key !== d.key)
              const dock = l.dock.includes(d.key) ? l.dock : [...l.dock, d.key]
              void saveLayout({ ...l, icons, dock })
            } else if (d.from === 'dock' && !inDock) {
              // Dock → 网格（移动回）。自动排列下位置由 A-Z 排序重排（placed），无需占位检查；
              // 自定义排列下才需检查目标格是否被占
              const auto = layout?.autoArrange ?? true
              if (auto || !isSlotOccupied(l, d.key, col, row, 1, 1)) {
                const dock = l.dock.filter((k) => k !== d.key)
                // 自动排列下 col/row 取第一个空位（不与已有图标坐标撞车，避免切自定义时重叠）
                const slot = auto ? findFreeSlot(collectOccupiedSlots(l.icons), cols) : { col, row }
                const icons = l.icons.some((p) => p.key === d.key)
                  ? l.icons.map((p) => (p.key === d.key ? { ...p, col: slot.col, row: slot.row } : p))
                  : [...l.icons, { key: d.key, col: slot.col, row: slot.row }]
                void saveLayout({ ...l, icons, dock })
              }
            } else if (d.from === 'grid' && !inDock) {
              // 网格 → 网格：仅自定义排列下才吸附换位；自动排列下网格位置由 A-Z 固定，拖拽不改变位置
              if (!(layout?.autoArrange ?? true) && !isSlotOccupied(l, d.key, col, row, 1, 1)) {
                const icons = l.icons.some((p) => p.key === d.key)
                  ? l.icons.map((p) => (p.key === d.key ? { ...p, col, row } : p))
                  : [...l.icons, { key: d.key, col, row }]
                void saveLayout({ ...l, icons })
              }
            }
            // from='dock' 且松手仍在 Dock：留在 Dock，不移动
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

  const editMenuItems: MenuItem[] = [{ label: '编辑页面', onClick: () => setEditing(true) }]

  // 「查看」菜单：自动排列 / 自定义排列（互斥勾选，对齐 Windows 桌面）
  const openViewMenu = (e: React.MouseEvent): void => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const zoom = parseFloat(document.documentElement.style.zoom || '') || 1
    setViewMenu({ x: rect.left / zoom, y: rect.bottom / zoom })
  }

  const setAutoArrange = (v: boolean): void => {
    const l = layout ?? { icons: [], widgets: [], dock: [] }
    if (!v) {
      // 存储坐标若超出当前网格（写入时窗口更宽，之后缩小了），视为过期坐标——
      // 此时以「当前自动排列的显示布局」（A-Z × 当前列数）重建，避免出现「自动 7 列、切手动 17 列」；
      // 坐标未过期则保留用户上次摆放，仅拆开重叠
      const stale = l.icons.some((p) => p.col >= cols)
      const dockSet = new Set(l.dock ?? [])
      const icons = stale
        ? placed.filter((p) => !dockSet.has(p.key)).map((p) => ({ key: p.key, col: p.col, row: p.row }))
        : dedupeIconPositions(l.icons, cols)
      void saveLayout({ ...l, icons, autoArrange: false })
    } else {
      // 切到自动：仅切标志，坐标不动（自动排列忽略坐标，运行时 A-Z 计算）
      void saveLayout({ ...l, autoArrange: true })
    }
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
    ? { kind: drag.kind, key: drag.key, x: drag.x, y: drag.y, entry: drag.entry }
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
        <span
          className={`desktop-menubar-menu desktop-menubar-menu-action${editMenu ? ' desktop-menubar-menu-open' : ''}`}
          onClick={openEditMenu}
        >
          编辑
        </span>
        <span
          className={`desktop-menubar-menu desktop-menubar-menu-action${viewMenu ? ' desktop-menubar-menu-open' : ''}`}
          onClick={openViewMenu}
        >
          查看
        </span>
        <span className="desktop-menubar-menu">前往</span>
        <span className="desktop-menubar-menu">窗口</span>
        <span className="desktop-menubar-menu">帮助</span>
        <div className="desktop-menubar-spacer" />
        <span className="desktop-menubar-time">
          {time.getFullYear()}年{time.getMonth() + 1}月{time.getDate()}日 周{week} {pad(time.getHours())}:{pad(time.getMinutes())}
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
        </div>
      </div>

      {/* 底部 Dock（图标盛不下时左右滚动：滚轮横滚 + 按住空白处拖动；裁剪层固定在背景条内 18px 的
          圆角竖切线处，图标滚出在此被裁，绝不露出背景条外；图标本身仍可拖出/拖入） */}
      <div className="desktop-dock">
        <div
          className="desktop-dock-bar"
          onWheel={(e) => {
            const el = dockInnerRef.current
            if (el && el.scrollWidth > el.clientWidth) {
              el.scrollLeft += e.deltaY + e.deltaX
            }
          }}
          onMouseDown={(e) => {
            if (e.button !== 0) return
            const t = e.target instanceof Element ? e.target : null
            if (t && t.closest('.desktop-dock-icon')) return // 图标：交给图标拖拽
            // 空白处：按住左右拖动滚动 Dock
            const el = dockInnerRef.current
            if (!el) return
            const startX = e.clientX
            const startScroll = el.scrollLeft
            e.preventDefault()
            const onMove = (ev: MouseEvent): void => {
              el.scrollLeft = startScroll - (ev.clientX - startX)
            }
            const onUp = (): void => {
              window.removeEventListener('mousemove', onMove)
              window.removeEventListener('mouseup', onUp)
            }
            window.addEventListener('mousemove', onMove)
            window.addEventListener('mouseup', onUp)
          }}
        >
          <div className="desktop-dock-clip">
            <div className="desktop-dock-inner" ref={dockInnerRef}>
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

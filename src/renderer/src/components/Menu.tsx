import { useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

export interface MenuItem {
  label: string
  icon?: ReactNode
  danger?: boolean
  disabled?: boolean
  /** 子菜单（有此项即渲染为可展开的二级菜单，不再响应点击） */
  children?: MenuItem[]
  onClick?: () => void
}

export function Menu({
  anchor,
  items,
  onClose,
  onSelect
}: {
  anchor: { x: number; y: number }
  items: MenuItem[]
  onClose: () => void
  onSelect?: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  const subRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState(anchor)
  const [sub, setSub] = useState<{ index: number; x: number; y: number; anchorLeft: number } | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 测量菜单实际渲染位置，越界时自动向上/向左翻转，避免超出窗口被裁剪
  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return
    const zoom = parseFloat(document.documentElement.style.zoom || '') || 1
    const rect = el.getBoundingClientRect()
    const rootRect = document.documentElement.getBoundingClientRect()
    const margin = 8
    let top = rect.top
    let left = rect.left
    if (rect.bottom > rootRect.bottom - margin) {
      top = rootRect.bottom - margin - rect.height
    }
    if (rect.right > rootRect.right - margin) {
      left = rootRect.right - margin - rect.width
    }
    if (top < margin) top = margin
    if (left < margin) left = margin
    setPos({ x: left / zoom, y: top / zoom })
  }, [anchor, items])

  // 子菜单定位：默认在父项右侧展开，右侧越界时向左翻转、底部越界时上移
  useLayoutEffect(() => {
    if (!sub || !subRef.current) return
    const el = subRef.current
    const zoom = parseFloat(document.documentElement.style.zoom || '') || 1
    const rect = el.getBoundingClientRect()
    const rootRect = document.documentElement.getBoundingClientRect()
    const margin = 8
    let x = rect.left
    let y = rect.top
    if (rect.right > rootRect.right - margin) {
      x = sub.anchorLeft - rect.width
    }
    if (rect.bottom > rootRect.bottom - margin) {
      y = rootRect.bottom - margin - rect.height
    }
    if (x < margin) x = margin
    if (y < margin) y = margin
    if (x !== rect.left || y !== rect.top) {
      setSub({ ...sub, x: x / zoom, y: y / zoom })
    }
  }, [sub])

  const openSub = (i: number, parentEl: HTMLElement) => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    const zoom = parseFloat(document.documentElement.style.zoom || '') || 1
    const r = parentEl.getBoundingClientRect()
    setSub({ index: i, x: r.right / zoom, y: r.top / zoom, anchorLeft: r.left })
  }
  const scheduleCloseSub = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setSub(null), 120)
  }

  const runItem = (it: MenuItem) => {
    // 只关闭菜单（onSelect），不清选中——由操作逻辑自行处理选中态
    onSelect?.()
    it.onClick?.()
  }

  return (
    <>
      <div
        className="mask"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault()
          onClose()
        }}
      />
      <div
        className="ctx-menu show"
        ref={menuRef}
        style={{ left: pos.x, top: pos.y }}
        onClick={(e) => e.stopPropagation()}
      >
        {items.map((it, i) =>
          it.children ? (
            <div
              key={i}
              className="ctx-item"
              onMouseEnter={(e) => openSub(i, e.currentTarget)}
              onMouseLeave={scheduleCloseSub}
            >
              {it.icon && <span className="ctx-icon">{it.icon}</span>}
              <span className="ctx-label">{it.label}</span>
              <span className="ctx-arrow">›</span>
            </div>
          ) : (
            <div
              key={i}
              className={`ctx-item ${it.danger ? 'danger' : ''} ${it.disabled ? 'disabled' : ''}`}
              onClick={() => {
                if (it.disabled) return
                runItem(it)
              }}
            >
              {it.icon && <span className="ctx-icon">{it.icon}</span>}
              <span className="ctx-label">{it.label}</span>
            </div>
          )
        )}
      </div>

      {sub && items[sub.index]?.children && (
        <div
          className="ctx-menu ctx-submenu show"
          ref={subRef}
          style={{ left: sub.x, top: sub.y }}
          onMouseEnter={() => {
            if (closeTimer.current) clearTimeout(closeTimer.current)
          }}
          onMouseLeave={scheduleCloseSub}
          onClick={(e) => e.stopPropagation()}
        >
          {items[sub.index].children!.map((c, j) => (
            <div
              key={j}
              className={`ctx-item ${c.danger ? 'danger' : ''} ${c.disabled ? 'disabled' : ''}`}
              onClick={() => {
                if (c.disabled) return
                runItem(c)
              }}
            >
              {c.icon && <span className="ctx-icon">{c.icon}</span>}
              <span className="ctx-label">{c.label}</span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

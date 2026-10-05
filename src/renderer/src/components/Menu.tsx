import { useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

export interface MenuItem {
  label: string
  icon?: ReactNode
  danger?: boolean
  disabled?: boolean
  onClick: () => void
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
  const [pos, setPos] = useState(anchor)

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
        {items.map((it, i) => (
          <div
            key={i}
            className={`ctx-item ${it.danger ? 'danger' : ''} ${it.disabled ? 'disabled' : ''}`}
            onClick={() => {
              // 禁用项不响应点击
              if (it.disabled) return
              // 点菜单项：只关闭菜单（不清选中），由操作逻辑自行处理选中态
              onSelect?.()
              it.onClick()
            }}
          >
            {it.icon && <span className="ctx-icon">{it.icon}</span>}
            <span>{it.label}</span>
          </div>
        ))}
      </div>
    </>
  )
}

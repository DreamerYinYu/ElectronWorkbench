import { useEffect, useRef, useState } from 'react'
import { applyAppearance } from './utils/appearance'

interface ToastItem {
  id: number
  title: string
  body: string
}

let toastId = 0

/**
 * 通知小窗（屏幕右缘独立置顶窗）：多条纵向堆叠、不自动关闭、点一条关一条。
 * 窗口高度固定铺满主屏工作区、整体鼠标穿透（主进程 setIgnoreMouseEvents + forward），
 * 卡片区域由 CSS pointer-events:auto 恢复可点击——内容贴底堆叠、永不裁剪、窗口不动故无抖动。
 */
export default function ToastApp() {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [closing, setClosing] = useState<Set<number>>(new Set())
  const [icon, setIcon] = useState('')
  const stackRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
    applyAppearance(window.workbench.initialAppearance)
    window.workbench.getAppIcon().then(setIcon)
    window.workbench.onToastData((d) => {
      setToasts((prev) => [...prev, { id: ++toastId, title: d.title, body: d.body }])
    })
  }, [])

  // 新通知到达时若窗口在底部堆满（超出工作区），让最旧的滚出视野：scroll 到底部保持最新可见
  useEffect(() => {
    const el = stackRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [toasts])

  // 动态切换鼠标穿透：forward:true 只转发 mouse move 不转发 click，
  // 需在 mousemove 里判断鼠标是否落在卡片上，命中则取消穿透（可点关闭）、离开则恢复穿透
  useEffect(() => {
    let last: boolean | null = null
    const onMove = (e: MouseEvent) => {
      const target = e.target as Element | null
      const over = !!target?.closest?.('.toast-card')
      if (over !== last) {
        last = over
        void window.workbench.toastInteractive(over)
      }
    }
    window.addEventListener('mousemove', onMove)
    return () => {
      window.removeEventListener('mousemove', onMove)
      if (last) void window.workbench.toastInteractive(false)
    }
  }, [])

  const close = (id: number) => {
    // 先标记为关闭中（触发塌缩动画），动画结束后再真正移除并补位
    setClosing((prev) => new Set(prev).add(id))
    window.setTimeout(() => {
      setToasts((prev) => {
        const next = prev.filter((t) => t.id !== id)
        if (next.length === 0) window.workbench.toastClose()
        return next
      })
      setClosing((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }, 220)
  }

  if (toasts.length === 0) return null

  return (
    <div className="toast-wrap">
      <div className="toast-stack" ref={stackRef}>
        {toasts.map((t) => (
          <div key={t.id} className={`toast-card${closing.has(t.id) ? ' closing' : ''}`}>
            <div className="toast-head">
              {icon && <img className="toast-head-icon" src={icon} alt="" />}
              <span className="toast-head-name">Workbench</span>
              <button className="toast-head-close" onClick={() => close(t.id)} aria-label="关闭">
                ×
              </button>
            </div>
            <div className="toast-title">{t.title}</div>
            {t.body && <div className="toast-body">{t.body}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}

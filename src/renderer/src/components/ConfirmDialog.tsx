import type { ReactNode } from 'react'

export interface DialogButton {
  label: string
  variant?: 'primary' | 'danger'
  onClick: () => void
}

/**
 * 通用确认对话框（可复用）
 * - 复用全局 .overlay / .modal-box / .modal-foot / .btn 样式，无需额外 CSS
 * - 支持任意数量按钮，按钮带 variant（primary / danger）
 * - onClose：点击遮罩关闭时的回调（可选）
 */
export default function ConfirmDialog({
  title,
  message,
  buttons,
  onClose
}: {
  title: string
  message?: ReactNode
  buttons: DialogButton[]
  onClose?: () => void
}) {
  return (
    <div
      className="overlay show"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <div className="modal-box">
        <div className="modal-head">{title}</div>
        {message != null && (
          <div className="modal-body">
            <div className="modal-text">{message}</div>
          </div>
        )}
        <div className="modal-foot">
          {buttons.map((b, i) => (
            <button key={i} className={`btn ${b.variant ?? ''}`} onClick={b.onClick}>
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

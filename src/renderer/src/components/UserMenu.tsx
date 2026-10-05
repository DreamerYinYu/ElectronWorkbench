import { useState } from 'react'

export default function UserMenu({ onOpenSettings }: { onOpenSettings: () => void }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="sidebar-foot">
      <button className="btn-user" onClick={() => setOpen((v) => !v)}>
        <div className="user-avatar">默</div>
        <span className="uname">默认用户</span>
      </button>
      {open && (
        <>
          <div className="mask" onClick={() => setOpen(false)} />
          <div className="user-panel">
            <div className="user-panel-head">
              <div className="user-panel-name">默认用户</div>
            </div>
            <div
              className="up-item"
              onClick={() => {
                setOpen(false)
                onOpenSettings()
              }}
            >
              <svg viewBox="0 0 16 16" width="15" height="15" fill="none">
                <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" />
                <circle cx="8" cy="8" r="4.4" stroke="currentColor" strokeWidth="1.3" />
                <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              设置 <span className="up-shortcut">Ctrl+,</span>
            </div>
            <div
              className="up-item"
              onClick={() => {
                setOpen(false)
                window.workbench.openSettings('appearance')
              }}
            >
              <svg viewBox="0 0 16 16" width="15" height="15">
                <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
                <circle cx="6" cy="6.5" r="0.9" fill="currentColor" />
                <circle cx="10" cy="6.5" r="0.9" fill="currentColor" />
                <path d="M6 10.5c1.5 1 3.5 1 5-1" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              外观
            </div>
            <div className="up-item">
              <svg viewBox="0 0 16 16" width="15" height="15">
                <path d="M13 8a5 5 0 11-1.5-3.5M13 2.5V5h-2.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              检查更新
            </div>
            <div className="up-item">
              <svg viewBox="0 0 16 16" width="15" height="15">
                <circle cx="8" cy="8" r="5.8" fill="none" stroke="currentColor" strokeWidth="1.3" />
                <path d="M6.3 6.2c.2-1 1-1.5 1.8-1.5.9 0 1.7.6 1.7 1.5 0 1.2-1.6 1.3-1.6 2.4" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                <circle cx="8.1" cy="11" r="0.8" fill="currentColor" />
              </svg>
              帮助与反馈
            </div>
            <div className="up-divider" />
            <div className="up-item danger">
              <svg viewBox="0 0 16 16" width="15" height="15">
                <path d="M6.5 2.5H4A1.5 1.5 0 002.5 4v8A1.5 1.5 0 004 13.5h2.5M9.5 11l3-3-3-3M12.5 8H6" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              退出登录
            </div>
          </div>
        </>
      )}
    </div>
  )
}

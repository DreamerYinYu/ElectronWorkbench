import { useEffect, useState } from 'react'

export default function Titlebar({ title, tag }: { title: string; tag?: string }) {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    window.workbench.onMaximizeChange(setMaximized)
  }, [])

  return (
    <header className="titlebar">
      <div className="titlebar-left">
        <div className="logo">W</div>
        <span className="titlebar-name">{title}</span>
        {tag && <span className="titlebar-tag">{tag}</span>}
      </div>
      <div className="window-controls">
        <button title="最小化" onClick={() => window.workbench.minimize()}>
          <svg viewBox="0 0 12 12">
            <rect x="1" y="5.5" width="10" height="1" fill="currentColor" />
          </svg>
        </button>
        <button title="最大化" onClick={() => window.workbench.toggleMaximize()}>
          {maximized ? (
            <svg viewBox="0 0 12 12">
              <path d="M3.5 3.5 V1 H11 V8.5 H8.5" fill="none" stroke="currentColor" strokeWidth="1" />
              <rect x="1" y="3.5" width="6.5" height="6.5" fill="none" stroke="currentColor" strokeWidth="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 12 12">
              <rect x="1.5" y="1.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          )}
        </button>
        <button className="close" title="关闭" onClick={() => window.workbench.close()}>
          <svg viewBox="0 0 12 12">
            <path d="M1.5 1.5 L10.5 10.5 M10.5 1.5 L1.5 10.5" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
      </div>
    </header>
  )
}

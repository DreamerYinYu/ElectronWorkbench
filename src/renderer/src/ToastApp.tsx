import { useEffect, useState } from 'react'
import { applyAppearance } from './utils/appearance'

interface ToastData {
  title: string
  body: string
}

/** 通知小窗（屏幕右下角独立置顶窗）：图标 + 程序名 + 文案，5 秒后自动关闭 */
export default function ToastApp() {
  const [data, setData] = useState<ToastData | null>(null)
  const [icon, setIcon] = useState('')

  // 透明背景：整窗只有卡片可见
  useEffect(() => {
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
    applyAppearance(window.workbench.initialAppearance)
    window.workbench.getAppIcon().then(setIcon)
    window.workbench.onToastData((d) => setData(d))
  }, [])

  useEffect(() => {
    if (!data) return
    const t = setTimeout(() => window.close(), 5000)
    return () => clearTimeout(t)
  }, [data])

  if (!data) return null

  return (
    <div className="toast-wrap">
      <div className="toast-card">
        <div className="toast-head">
          {icon && <img className="toast-head-icon" src={icon} alt="" />}
          <span className="toast-head-name">Workbench</span>
          <button className="toast-head-close" onClick={() => window.close()} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="toast-title">{data.title}</div>
        {data.body && <div className="toast-body">{data.body}</div>}
      </div>
    </div>
  )
}

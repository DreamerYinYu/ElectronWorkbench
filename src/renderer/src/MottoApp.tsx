import { useEffect, useState } from 'react'

interface MottoData {
  text: string
  fontSize: number
  color: string
  bold: boolean
  italic: boolean
  underline: boolean
}

/** 桌面座右铭透明小窗：纯文字 + 透明背景（主进程已设事件穿透、仅主屏） */
export default function MottoApp() {
  const [motto, setMotto] = useState<MottoData | null>(null)

  useEffect(() => {
    // 透明窗口：body/html 背景必须透明（不能用主题背景色）
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
    window.workbench.onMottoUpdate((m) => setMotto(m as MottoData))
  }, [])

  if (!motto || !motto.text) return null

  return (
    <div className="motto-wrap">
      <div
        className="motto-text"
        style={{
          fontSize: `${motto.fontSize}px`,
          color: motto.color,
          fontWeight: motto.bold ? 700 : 400,
          fontStyle: motto.italic ? 'italic' : 'normal',
          textDecoration: motto.underline ? 'underline' : 'none',
          textShadow: '0 1px 4px rgba(0, 0, 0, 0.55)'
        }}
      >
        {motto.text}
      </div>
    </div>
  )
}

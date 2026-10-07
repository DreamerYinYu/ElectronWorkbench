import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import SettingsApp from './SettingsApp'
import PreviewApp from './PreviewApp'
import ToastApp from './ToastApp'
import MottoApp from './MottoApp'
import { applyAppearance } from './utils/appearance'
import './styles/index.css'

// 全局错误可视化：任何渲染异常/未处理 reject 直接显示在页面上，避免白屏无从排查
function showFatal(msg: string): void {
  let el = document.getElementById('wb-fatal')
  if (!el) {
    el = document.createElement('pre')
    el.id = 'wb-fatal'
    el.style.cssText =
      'position:fixed;inset:0;z-index:2147483647;margin:0;background:#14161c;color:#ff6b6b;padding:20px;white-space:pre-wrap;word-break:break-all;font:13px/1.6 Consolas,monospace;overflow:auto'
    document.body.appendChild(el)
  }
  el.textContent += msg + '\n\n'
}
window.addEventListener('error', (e) => showFatal(`[error] ${e.message}\n${e.error?.stack || ''}`))
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason
  showFatal(`[unhandledrejection] ${r?.stack || r?.message || String(r)}`)
})

// React 渲染前同步应用外观（主进程创建窗口时注入的启动设置），
// 避免窗口先以默认字号渲染、再异步跳到当前字号（闪变）
applyAppearance(window.workbench.initialAppearance)

const hash = window.location.hash.replace('#', '')
// hash 形如 'settings' 或 'settings/appearance'（后者用于打开设置并定位到指定标签页）、'toast'（右下角通知小窗）
const [route, sub] = hash.split('/')
const isSettings = route === 'settings'
const isPreview = route === 'preview'
const isToast = route === 'toast'
const isMotto = route === 'motto'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  isSettings ? (
    <SettingsApp initialTab={sub} />
  ) : isPreview ? (
    <PreviewApp />
  ) : isToast ? (
    <ToastApp />
  ) : isMotto ? (
    <MottoApp />
  ) : (
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
)

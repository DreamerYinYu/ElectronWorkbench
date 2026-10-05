import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import SettingsApp from './SettingsApp'
import PreviewApp from './PreviewApp'
import { applyAppearance } from './utils/appearance'
import './styles/index.css'

// React 渲染前同步应用外观（主进程创建窗口时注入的启动设置），
// 避免窗口先以默认字号渲染、再异步跳到当前字号（闪变）
applyAppearance(window.workbench.initialAppearance)

const hash = window.location.hash.replace('#', '')
// hash 形如 'settings' 或 'settings/appearance'（后者用于打开设置并定位到指定标签页）
const [route, sub] = hash.split('/')
const isSettings = route === 'settings'
const isPreview = route === 'preview'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  isSettings ? (
    <SettingsApp initialTab={sub} />
  ) : isPreview ? (
    <PreviewApp />
  ) : (
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
)

import { useState } from 'react'
import CodePreview from './CodePreview'

/**
 * 本地文件 URL（保留 / 和 :，使 html 内相对资源能正确解析到同目录）
 * 与缩略图的 encodeURIComponent 不同：这里必须保留目录结构，否则 iframe 里 <link href="x.css"> 会解析失败
 */
function fileUrl(path: string): string {
  return `workbench://local/${encodeURI(path.replace(/\\/g, '/'))}`
}

/** HTML 文件预览：默认 iframe 浏览器渲染（还原样式），可切换「编辑源码」 */
export default function HtmlPreview({
  path,
  onDirtyChange,
  registerSave
}: {
  path: string
  onDirtyChange: (dirty: boolean) => void
  registerSave: (fn: () => Promise<void>) => void
}) {
  const [mode, setMode] = useState<'preview' | 'source'>('preview')
  const [reloadKey, setReloadKey] = useState(0)

  return (
    <div className="preview-html">
      <div className="preview-editor-toolbar">
        <button
          className={mode === 'preview' ? 'on' : ''}
          onClick={() => {
            setMode('preview')
            // 从源码切回预览时强制刷新，展示最新内容
            setReloadKey((k) => k + 1)
          }}
        >
          预览
        </button>
        <button className={mode === 'source' ? 'on' : ''} onClick={() => setMode('source')}>
          编辑源码
        </button>
      </div>

      {mode === 'preview' ? (
        <iframe key={reloadKey} className="html-frame" src={fileUrl(path)} title="预览" />
      ) : (
        <CodePreview path={path} ext="html" onDirtyChange={onDirtyChange} registerSave={registerSave} />
      )}
    </div>
  )
}

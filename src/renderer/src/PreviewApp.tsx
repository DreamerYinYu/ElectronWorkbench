import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { fileType } from './utils/format'
import { applyAppearance } from './utils/appearance'
import CodePreview from './components/CodePreview'
import RichTextEditor from './components/RichTextEditor'
import HtmlPreview from './components/HtmlPreview'
import Titlebar from './components/Titlebar'
import ConfirmDialog from './components/ConfirmDialog'

const PLAIN_TEXT_EXTS = new Set(['txt', 'rtf'])
const RICH_TEXT_EXTS = new Set(['md'])

const FONT_SIZES = [13, 16, 18, 20, 22, 24, 26, 28, 32, 36, 40]

const FONT_FAMILIES: { name: string; value: string }[] = [
  { name: '宋体', value: "SimSun, '宋体', serif" },
  { name: '微软雅黑', value: "'Microsoft YaHei', '微软雅黑', sans-serif" },
  { name: '黑体', value: "'SimHei', '黑体', sans-serif" },
  { name: '等线', value: "'DengXian', '等线', sans-serif" },
  { name: '楷体', value: "'KaiTi', '楷体', serif" }
]

type RegisterSave = (fn: () => Promise<void>) => void

function fileUrl(path: string): string {
  return `workbench://local/${encodeURIComponent(path)}`
}

function basename(path: string): string {
  return path.split(/[\\/]/).pop() || path
}

function TextPreview({
  path,
  onDirtyChange,
  registerSave
}: {
  path: string
  onDirtyChange: (dirty: boolean) => void
  registerSave: RegisterSave
}) {
  const [content, setContent] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const focusedRef = useRef(false)
  const [cursor, setCursor] = useState({ line: 1, col: 1 })

  // 全局显示样式（记事本式：作用于整个编辑区，不写入 txt 文件）
  const [fontSize, setFontSize] = useState(13)
  const [fontFamily, setFontFamily] = useState('')
  const [bold, setBold] = useState(false)
  const [italic, setItalic] = useState(false)
  const [underline, setUnderline] = useState(false)

  // 挂载时读取持久化的显示样式（记事本式，全局共享，下次打开仍生效）
  const styleLoadedRef = useRef(false)
  useEffect(() => {
    window.workbench.appSettings.get().then((s) => {
      const tp = s.textPreview
      if (tp) {
        setFontSize(typeof tp.fontSize === 'number' ? tp.fontSize : 13)
        setFontFamily(typeof tp.fontFamily === 'string' ? tp.fontFamily : '')
        setBold(Boolean(tp.bold))
        setItalic(Boolean(tp.italic))
        setUnderline(Boolean(tp.underline))
      }
      styleLoadedRef.current = true
    })
  }, [])

  // 样式变化时持久化（跳过初始加载触发的写回）
  useEffect(() => {
    if (!styleLoadedRef.current) return
    window.workbench.appSettings.get().then((s) => {
      window.workbench.appSettings.save({
        ...s,
        textPreview: { fontSize, fontFamily, bold, italic, underline }
      })
    })
  }, [fontSize, fontFamily, bold, italic, underline])

  useEffect(() => {
    setContent(null)
    focusedRef.current = false
    onDirtyChange(false)
    window.workbench.fs
      .readText(path)
      .then((text) => setContent(text))
      .catch(() => setContent(''))
  }, [path])

  // 只在首次加载完成后聚焦一次，光标定位到开头；之后输入不再动光标
  useEffect(() => {
    if (content !== null && !focusedRef.current && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.setSelectionRange(0, 0)
      focusedRef.current = true
    }
  }, [content])

  const doSave = async () => {
    if (content === null) return
    await window.workbench.fs.writeText(path, content)
    onDirtyChange(false)
  }

  // 每次渲染注册最新保存函数（关闭确认「保存」时调用）
  useEffect(() => {
    registerSave(doSave)
  })

  const updateCursor = () => {
    const el = textareaRef.current
    if (!el) return
    const lines = el.value.slice(0, el.selectionStart).split('\n')
    setCursor({ line: lines.length, col: lines[lines.length - 1].length + 1 })
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      doSave()
    }
  }

  if (content === null) return <div className="preview-info">加载中…</div>

  const editorStyle: CSSProperties = {
    fontSize: `${fontSize}px`,
    fontWeight: bold ? 'bold' : 'normal',
    fontStyle: italic ? 'italic' : 'normal',
    textDecoration: underline ? 'underline' : 'none'
  }
  if (fontFamily) editorStyle.fontFamily = fontFamily

  return (
    <div className="preview-editor">
      <div className="preview-editor-toolbar">
        <select
          className="rt-select"
          title="字号"
          value={fontSize}
          onChange={(e) => setFontSize(parseInt(e.target.value, 10))}
        >
          {FONT_SIZES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <select
          className="rt-select font-select"
          title="字体"
          value={fontFamily}
          onChange={(e) => setFontFamily(e.target.value)}
        >
          <option value="">默认字体</option>
          {FONT_FAMILIES.map((f) => (
            <option key={f.name} value={f.value}>
              {f.name}
            </option>
          ))}
        </select>
        <button className={bold ? 'on' : ''} title="加粗" onClick={() => setBold(!bold)}>
          <span className="rt-letter rt-bold">B</span>
        </button>
        <button className={italic ? 'on' : ''} title="斜体" onClick={() => setItalic(!italic)}>
          <span className="rt-letter rt-italic">I</span>
        </button>
        <button className={underline ? 'on' : ''} title="下划线" onClick={() => setUnderline(!underline)}>
          <span className="rt-letter rt-underline">U</span>
        </button>
      </div>
      <textarea
        ref={textareaRef}
        className="preview-textarea"
        style={editorStyle}
        value={content}
        onChange={(e) => {
          setContent(e.target.value)
          onDirtyChange(true)
        }}
        onKeyDown={onKeyDown}
        onKeyUp={updateCursor}
        onClick={updateCursor}
        spellCheck={false}
      />
      <div className="preview-statusbar">
        <span>行 {cursor.line}，列 {cursor.col}</span>
        <span>{content.length} 个字符</span>
      </div>
    </div>
  )
}

function FallbackPreview({ path, name }: { path: string; name: string }) {
  return (
    <div className="preview-info">
      <div className="big">📄</div>
      <div>{name}</div>
      <div className="dim">该格式预览暂未支持</div>
      <button className="btn" onClick={() => window.workbench.fs.openPath(path)}>
        用系统应用打开
      </button>
    </div>
  )
}

export default function PreviewApp() {
  const [path, setPath] = useState('')
  const [dirty, setDirty] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const saveRef = useRef<(() => Promise<void>) | null>(null)

  useEffect(() => {
    window.workbench.preview.getFile().then((p) => {
      if (p) setPath(p)
    })
    window.workbench.preview.onFileChanged((p) => setPath(p))
  }, [])

  // 应用外观设置（主题/字号），与主窗口一致
  useEffect(() => {
    window.workbench.appSettings.get().then(applyAppearance)
    const off = window.workbench.onAppearanceChanged(applyAppearance)
    return off
  }, [])

  // 未保存状态同步给主进程（关闭拦截用）
  useEffect(() => {
    window.workbench.preview.setDirty(dirty)
  }, [dirty])

  // 主进程拦截关闭时，弹出自研确认对话框
  useEffect(() => {
    window.workbench.preview.onConfirmClose(() => setConfirmOpen(true))
  }, [])

  const onSaveAndClose = async () => {
    setConfirmOpen(false)
    await saveRef.current?.()
    window.workbench.preview.forceClose()
  }

  const onDiscardAndClose = () => {
    setConfirmOpen(false)
    window.workbench.preview.forceClose()
  }

  const name = basename(path)
  const ext = path.includes('.') ? path.split('.').pop()!.toLowerCase() : ''
  const t = fileType(ext)
  const isHtml = ext === 'html'
  const isRichText = RICH_TEXT_EXTS.has(ext)
  const isCode = t === 'code' && !isHtml
  const isPlainText = PLAIN_TEXT_EXTS.has(ext)
  const isImage = t === 'image'
  const isVideo = t === 'video'
  const registerSave: RegisterSave = (fn) => {
    saveRef.current = fn
  }

  // 文件有未保存修改时，标题栏/任务栏标题加 * 提示（如 工作备忘录.txt*）
  useEffect(() => {
    document.title = dirty ? `${name}*` : name
  }, [dirty, name])

  return (
    <div className="preview-app">
      <Titlebar title={dirty ? `${name}*` : name} />

      <div className="preview-content">
        {isImage && <img className="preview-media" src={fileUrl(path)} alt={name} />}
        {isVideo && <video className="preview-media" src={fileUrl(path)} controls autoPlay />}
        {isHtml && <HtmlPreview path={path} onDirtyChange={setDirty} registerSave={registerSave} />}
        {isRichText && (
          <RichTextEditor path={path} ext={ext as 'md' | 'html'} onDirtyChange={setDirty} registerSave={registerSave} />
        )}
        {isCode && <CodePreview path={path} ext={ext} onDirtyChange={setDirty} registerSave={registerSave} />}
        {isPlainText && <TextPreview path={path} onDirtyChange={setDirty} registerSave={registerSave} />}
        {!isImage && !isVideo && !isHtml && !isRichText && !isCode && !isPlainText && (
          <FallbackPreview path={path} name={name} />
        )}
      </div>

      {confirmOpen && (
        <ConfirmDialog
          title="未保存的修改"
          message="文件已修改，是否保存更改？"
          onClose={() => setConfirmOpen(false)}
          buttons={[
            { label: '保存', variant: 'primary', onClick: onSaveAndClose },
            { label: '不保存', onClick: onDiscardAndClose },
            { label: '取消', onClick: () => setConfirmOpen(false) }
          ]}
        />
      )}
    </div>
  )
}

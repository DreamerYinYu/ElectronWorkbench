import { useEffect, useRef, useState } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { python } from '@codemirror/lang-python'
import { cpp } from '@codemirror/lang-cpp'
import { StreamLanguage } from '@codemirror/language'
import { csharp } from '@codemirror/legacy-modes/mode/clike'

function langExtension(ext: string, onDirtyChange: (d: boolean) => void, setChars: (n: number) => void) {
  const listener = EditorView.updateListener.of((u) => {
    if (u.docChanged) {
      onDirtyChange(true)
      setChars(u.state.doc.length)
    }
  })
  switch (ext) {
    case 'js':
    case 'jsx':
    case 'ts':
    case 'tsx':
      return [javascript(), listener]
    case 'json':
      return [json(), listener]
    case 'html':
    case 'htm':
      return [html(), listener]
    case 'css':
      return [css(), listener]
    case 'py':
      return [python(), listener]
    case 'c':
    case 'cpp':
    case 'h':
    case 'hpp':
    case 'cc':
      return [cpp(), listener]
    case 'cs':
      return [StreamLanguage.define(csharp), listener]
    default:
      return [listener]
  }
}

export default function CodePreview({
  path,
  ext,
  onDirtyChange,
  registerSave
}: {
  path: string
  ext: string
  onDirtyChange: (dirty: boolean) => void
  registerSave: (fn: () => Promise<void>) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const [chars, setChars] = useState(0)

  useEffect(() => {
    let cancelled = false
    onDirtyChange(false)
    window.workbench.fs.readText(path).then((content) => {
      if (cancelled || !containerRef.current) return
      const view = new EditorView({
        parent: containerRef.current,
        state: EditorState.create({
          doc: content,
          extensions: [basicSetup, ...langExtension(ext, onDirtyChange, setChars)]
        })
      })
      viewRef.current = view
      setChars(view.state.doc.length)
    })
    return () => {
      cancelled = true
      viewRef.current?.destroy()
      viewRef.current = null
    }
  }, [path, ext])

  const doSave = async () => {
    if (!viewRef.current) return
    await window.workbench.fs.writeText(path, viewRef.current.state.doc.toString())
    onDirtyChange(false)
  }

  // 每次渲染注册最新保存函数（关闭确认「保存」时调用）
  useEffect(() => {
    registerSave(doSave)
  })

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        doSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [path])

  return (
    <div className="preview-code">
      <div className="preview-code-wrap" ref={containerRef} />
      <div className="preview-statusbar">
        <span>{chars} 个字符</span>
      </div>
    </div>
  )
}

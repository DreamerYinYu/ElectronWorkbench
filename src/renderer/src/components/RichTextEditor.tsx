import { useEffect, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { Markdown } from 'tiptap-markdown'
import type { MarkdownStorage } from 'tiptap-markdown'
import { PromptModal } from './modals'

const HEADING_LABELS: Record<number, string> = {
  1: '标题 1',
  2: '标题 2',
  3: '标题 3'
}

/** 富文本编辑器：md 存回 markdown，html 存回 HTML */
export default function RichTextEditor({
  path,
  ext,
  onDirtyChange,
  registerSave
}: {
  path: string
  ext: 'md' | 'html'
  onDirtyChange: (dirty: boolean) => void
  registerSave: (fn: () => Promise<void>) => void
}) {
  const [chars, setChars] = useState(0)
  const [, setTick] = useState(0)
  const [linkPromptOpen, setLinkPromptOpen] = useState(false)

  const editor = useEditor(
    {
      extensions: [
        StarterKit,
        Link.configure({ openOnClick: false }),
        ...(ext === 'md' ? [Markdown] : [])
      ],
      onUpdate: ({ editor }) => {
        onDirtyChange(true)
        setChars(editor.getText().length)
        // 强制重渲染，刷新工具栏按钮 active 态
        setTick((t) => t + 1)
      }
    },
    [ext]
  )

  // 加载文件内容
  useEffect(() => {
    if (!editor) return
    onDirtyChange(false)
    window.workbench.fs
      .readText(path)
      .then((content) => {
        editor.commands.setContent(content, { emitUpdate: false })
        setChars(editor.getText().length)
        setTick((t) => t + 1)
      })
      .catch(() => undefined)
  }, [path, editor])

  const doSave = async () => {
    if (!editor) return
    const output =
      ext === 'md'
        ? (editor.storage as unknown as { markdown: MarkdownStorage }).markdown.getMarkdown()
        : editor.getHTML()
    await window.workbench.fs.writeText(path, output)
    onDirtyChange(false)
  }

  // 注册保存函数（关闭确认「保存」时调用）
  useEffect(() => {
    if (editor) registerSave(doSave)
  })

  // Ctrl+S 保存
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        doSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [editor, ext, path])

  if (!editor) return <div className="preview-info">加载中…</div>

  const headingLevel = (): number => {
    for (const lv of [1, 2, 3]) {
      if (editor.isActive('heading', { level: lv })) return lv
    }
    return 0
  }

  const applyLink = (url: string) => {
    setLinkPromptOpen(false)
    const trimmed = url.trim()
    if (!trimmed) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: trimmed }).run()
  }

  return (
    <>
      <div className="preview-rich">
      <div className="preview-editor-toolbar">
        <select
          className="rt-heading"
          value={headingLevel()}
          onChange={(e) => {
            const lv = parseInt(e.target.value, 10)
            if (lv === 0) editor.chain().focus().setParagraph().run()
            else editor.chain().focus().toggleHeading({ level: lv as 1 | 2 | 3 }).run()
          }}
        >
          <option value="0">正文</option>
          <option value="1">{HEADING_LABELS[1]}</option>
          <option value="2">{HEADING_LABELS[2]}</option>
          <option value="3">{HEADING_LABELS[3]}</option>
        </select>
        <button className={editor.isActive('bold') ? 'on' : ''} title="加粗" onClick={() => editor.chain().focus().toggleBold().run()}>
          <span className="rt-letter rt-bold">B</span>
        </button>
        <button className={editor.isActive('italic') ? 'on' : ''} title="斜体" onClick={() => editor.chain().focus().toggleItalic().run()}>
          <span className="rt-letter rt-italic">I</span>
        </button>
        <button className={editor.isActive('strike') ? 'on' : ''} title="删除线" onClick={() => editor.chain().focus().toggleStrike().run()}>
          <span className="rt-letter rt-strike">S</span>
        </button>
        <button className={editor.isActive('bulletList') ? 'on' : ''} title="无序列表" onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <svg viewBox="0 0 16 16" width="14" height="14">
            <circle cx="3" cy="4" r="1" fill="currentColor" />
            <circle cx="3" cy="8" r="1" fill="currentColor" />
            <circle cx="3" cy="12" r="1" fill="currentColor" />
            <path d="M6 4h8M6 8h8M6 12h8" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
        <button className={editor.isActive('orderedList') ? 'on' : ''} title="有序列表" onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <svg viewBox="0 0 16 16" width="14" height="14">
            <path d="M2 4h0M2 8h0M2 12h0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <path d="M6 4h8M6 8h8M6 12h8" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
        <button className={editor.isActive('blockquote') ? 'on' : ''} title="引用" onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <svg viewBox="0 0 16 16" width="14" height="14">
            <path d="M3 4v5h3v3H3V9M9 4v5h3v3H9V9" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          </svg>
        </button>
        <button className={editor.isActive('codeBlock') ? 'on' : ''} title="代码块" onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
          <svg viewBox="0 0 16 16" width="14" height="14">
            <path d="M5 5L2 8l3 3M11 5l3 3-3 3M9.5 3l-3 10" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button className={editor.isActive('link') ? 'on' : ''} title="链接" onClick={() => setLinkPromptOpen(true)}>
          <svg viewBox="0 0 16 16" width="14" height="14">
            <path d="M6.5 9.5a3 3 0 004.2 0l2-2a3 3 0 00-4.2-4.2M9.5 6.5a3 3 0 00-4.2 0l-2 2a3 3 0 004.2 4.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
          </svg>
        </button>
        <button title="撤销" onClick={() => editor.chain().focus().undo().run()}>
          <svg viewBox="0 0 16 16" width="14" height="14">
            <path d="M6 4L2 8l4 4M2 8h9a3 3 0 010 6h-2" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button title="重做" onClick={() => editor.chain().focus().redo().run()}>
          <svg viewBox="0 0 16 16" width="14" height="14">
            <path d="M10 4l4 4-4 4M14 8H5a3 3 0 000 6h2" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <EditorContent editor={editor} className="rt-content" />

      <div className="preview-statusbar">
        <span>{chars} 个字符</span>
      </div>
      </div>

      {linkPromptOpen && (
        <PromptModal
          title="插入链接"
          defaultValue={(editor.getAttributes('link').href as string | undefined) || 'https://'}
          placeholder="链接地址，如 https://example.com"
          onClose={() => setLinkPromptOpen(false)}
          onSubmit={applyLink}
        />
      )}
    </>
  )
}

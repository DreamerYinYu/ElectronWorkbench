import { useEffect, useState, useRef } from 'react'
import { useWorkbench } from '../stores/workbench'
import { formatSize, formatMtime } from '../utils/format'
import type { ConflictDetail, Motto } from '../types'

/** 取路径的父目录（Windows/Unix 通用，渲染进程无 node path） */
function dirname(p: string): string {
  const i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'))
  return i <= 0 ? p : p.slice(0, i)
}

function Modal({
  title,
  onClose,
  children,
  footer,
  overlayClassName
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
  /** 附加到 .overlay 的类名（如 overlay-desktop = 相对桌面容器居中，而非整个主窗体） */
  overlayClassName?: string
}) {
  return (
    <div
      className={`overlay show${overlayClassName ? ` ${overlayClassName}` : ''}`}
      onMouseDown={(e) => {
        // 仅当按下发生在遮罩本身（而非弹窗内部）时关闭；文字选择拖拽不会误关
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal-box">
        <div className="modal-head">{title}</div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function NewProjectModal({ onClose }: { onClose: () => void }) {
  const createProject = useWorkbench((s) => s.createProject)
  const [name, setName] = useState('')
  const [parentDir, setParentDir] = useState('')

  useEffect(() => {
    window.workbench.getDefaultProjectsDir().then(setParentDir)
  }, [])

  const confirm = async () => {
    if (!name.trim()) return
    await createProject(parentDir, name.trim())
    onClose()
  }

  return (
    <Modal
      title="新建项目"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn primary" onClick={confirm}>
            创建
          </button>
        </>
      }
    >
      <div className="modal-field">
        <label>项目名称</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：我的项目" autoFocus />
      </div>
    </Modal>
  )
}

export function PromptModal({
  title,
  defaultValue = '',
  placeholder,
  extra,
  onClose,
  onSubmit
}: {
  title: string
  defaultValue?: string
  placeholder?: string
  extra?: React.ReactNode
  onClose: () => void
  onSubmit: (value: string) => void
}) {
  const [value, setValue] = useState(defaultValue)

  const confirm = () => {
    const v = value.trim()
    if (v) onSubmit(v)
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn primary" onClick={confirm}>
            确定
          </button>
        </>
      }
    >
      <div className="modal-field">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          autoFocus
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') confirm()
          }}
        />
        {extra}
      </div>
    </Modal>
  )
}

export function ConfirmModal({
  title,
  message,
  danger,
  onClose,
  onConfirm
}: {
  title: string
  message: React.ReactNode
  danger?: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <button className={danger ? 'btn danger' : 'btn primary'} onClick={onConfirm}>
            确定
          </button>
        </>
      }
    >
      <div className="modal-text">{message}</div>
    </Modal>
  )
}

export function ConflictModal({
  details,
  onClose,
  onReplace,
  onSkip
}: {
  details: ConflictDetail[]
  onClose: () => void
  onReplace: () => void
  onSkip: () => void
}) {
  return (
    <Modal
      title="替换或跳过文件"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn" onClick={onSkip}>
            跳过此文件
          </button>
          <button className="btn primary" onClick={onReplace}>
            替换目标中的文件
          </button>
        </>
      }
    >
      <div className="modal-text">
        目标位置已包含 <b>{details.length}</b> 个同名项目：
      </div>
      <div className="conflict-list">
        {details.map((d) => (
          <div key={d.name} className="conflict-item">
            <div className="conflict-name">{d.name}</div>
            <div className="conflict-meta">
              <span className="conflict-side">
                现有 · {formatSize(d.target.size)} · {formatMtime(d.target.mtime)}
              </span>
              <span className="conflict-side">
                复制 · {formatSize(d.source.size)} · {formatMtime(d.source.mtime)}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="modal-hint">
        「替换目标中的文件」将覆盖同名项（文件夹会合并内容）；「跳过此文件」保留原有项，只粘贴其余内容。
      </div>
    </Modal>
  )
}

export function PropertyModal({
  title,
  rows,
  onClose
}: {
  title: string
  rows: { label: string; value: string }[]
  onClose: () => void
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <button className="btn" onClick={onClose}>
          确定
        </button>
      }
    >
      <div className="prop-table">
        {rows.map((r) => (
          <div key={r.label} className="prop-row">
            <span className="prop-label">{r.label}</span>
            <span className="prop-value">{r.value}</span>
          </div>
        ))}
      </div>
    </Modal>
  )
}

export function CompressModal({ onClose }: { onClose: () => void }) {
  const projects = useWorkbench((s) => s.projects)
  const currentProjectId = useWorkbench((s) => s.currentProjectId)
  const project = projects.find((p) => p.id === currentProjectId)
  const [destDir, setDestDir] = useState(project ? dirname(project.path) : '')
  const [busy, setBusy] = useState(false)

  // 读取记住的上次保存目录（没有则用项目父目录）
  useEffect(() => {
    let mounted = true
    window.workbench.appSettings.get().then((s) => {
      if (mounted && s.compressOutputDir) setDestDir(s.compressOutputDir)
    })
    return () => {
      mounted = false
    }
  }, [])

  // 记住保存目录到 workbench.json
  const rememberDir = async (dir: string) => {
    const s = await window.workbench.appSettings.get()
    s.compressOutputDir = dir
    await window.workbench.appSettings.save(s)
  }

  const pickDir = async () => {
    const dir = await window.workbench.selectDirectory()
    if (dir) {
      setDestDir(dir)
      void rememberDir(dir)
    }
  }

  const confirm = async () => {
    if (!currentProjectId || busy) return
    setBusy(true)
    try {
      await rememberDir(destDir)
      await window.workbench.projects.compress(currentProjectId, destDir)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="压缩项目"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn primary" onClick={confirm} disabled={busy}>
            {busy ? '压缩中…' : '开始压缩'}
          </button>
        </>
      }
    >
      <div className="modal-field">
        <label>保存位置</label>
        <div className="dir-pick">
          <input value={destDir} onChange={(e) => setDestDir(e.target.value)} />
          <button type="button" className="btn" onClick={pickDir}>
            浏览
          </button>
        </div>
        <div className="modal-hint">默认保存到项目所在目录，与项目文件夹并列；解压到另一台电脑的工作台可自动识别</div>
      </div>
    </Modal>
  )
}

/** 座右铭字号候选：8 的倍数大字号序列（32~160，默认 32） */
const MOTTO_FONT_SIZES = [32, 40, 48, 56, 64, 72, 80, 96, 120, 144, 160]

/** 座右铭文字颜色：标准色块（白/黑/红橙黄绿蓝紫粉青灰） */
const MOTTO_COLORS = ['#ffffff', '#000000', '#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#d81b60', '#00acc1', '#9e9e9e']

/** 设置桌面座右铭：文字/字号/颜色/加粗，实时预览，取消恢复、保存才落盘 */
export function MottoModal({ onClose }: { onClose: () => void }) {
  const [draft, setDraft] = useState<Motto | null>(null)
  const originalRef = useRef<Motto | null>(null)

  useEffect(() => {
    window.workbench.appSettings.get().then((s) => {
      setDraft(s.motto)
      originalRef.current = s.motto
    })
  }, [])

  if (!draft) return null

  // 实时预览：改任何字段立即同步到真实桌面窗口（不落盘）
  const update = (next: Motto) => {
    setDraft(next)
    void window.workbench.mottoPreview(next)
  }

  const confirm = async () => {
    const s = await window.workbench.appSettings.get()
    await window.workbench.appSettings.save({ ...s, motto: draft })
    onClose()
  }

  // 取消：恢复成打开前的配置（座右铭窗口回到原值），再关闭
  const cancel = () => {
    if (originalRef.current) void window.workbench.mottoPreview(originalRef.current)
    onClose()
  }

  return (
    <Modal
      title="设置座右铭"
      onClose={cancel}
      overlayClassName="overlay-desktop"
      footer={
        <>
          <button className="btn" onClick={cancel}>
            取消
          </button>
          <button className="btn primary" onClick={confirm}>
            保存
          </button>
        </>
      }
    >
      <div className="modal-field">
        <label>座右铭文字</label>
        <textarea
          className="motto-textarea"
          rows={2}
          placeholder="例如：Stay hungry, stay foolish"
          value={draft.text}
          onChange={(e) => update({ ...draft, text: e.target.value })}
          autoFocus
        />
      </div>
      <div className="modal-field">
        <label>字体样式</label>
        <div className="motto-toolbar">
          <select
            className="motto-font-select"
            value={draft.fontSize}
            onChange={(e) => update({ ...draft, fontSize: parseInt(e.target.value, 10) })}
          >
            {MOTTO_FONT_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}px
              </option>
            ))}
          </select>
          <button
            type="button"
            className={`motto-style-btn${draft.bold ? ' active' : ''}`}
            onClick={() => update({ ...draft, bold: !draft.bold })}
            aria-pressed={draft.bold}
            title="加粗"
            style={{ fontWeight: 700 }}
          >
            B
          </button>
          <button
            type="button"
            className={`motto-style-btn${draft.italic ? ' active' : ''}`}
            onClick={() => update({ ...draft, italic: !draft.italic })}
            aria-pressed={draft.italic}
            title="倾斜"
            style={{ fontStyle: 'italic' }}
          >
            I
          </button>
          <button
            type="button"
            className={`motto-style-btn${draft.underline ? ' active' : ''}`}
            onClick={() => update({ ...draft, underline: !draft.underline })}
            aria-pressed={draft.underline}
            title="下划线"
            style={{ textDecoration: 'underline' }}
          >
            U
          </button>
        </div>
      </div>
      <div className="modal-field">
        <label>文字颜色</label>
        <div className="motto-colors">
          {MOTTO_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`motto-swatch${draft.color === c ? ' active' : ''}`}
              style={{ background: c }}
              onClick={() => update({ ...draft, color: c })}
              aria-label={c}
            />
          ))}
        </div>
      </div>
    </Modal>
  )
}

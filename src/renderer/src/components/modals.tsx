import { useEffect, useState } from 'react'
import { useWorkbench } from '../stores/workbench'
import { formatSize, formatMtime } from '../utils/format'
import type { ConflictDetail } from '../types'

/** 取路径的父目录（Windows/Unix 通用，渲染进程无 node path） */
function dirname(p: string): string {
  const i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'))
  return i <= 0 ? p : p.slice(0, i)
}

function Modal({
  title,
  onClose,
  children,
  footer
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <div
      className="overlay show"
      onMouseDown={(e) => {
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

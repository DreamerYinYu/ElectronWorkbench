export interface ProjectMeta {
  id: string
  name: string
  path: string
  createdAt: string
}

export interface FileEntry {
  name: string
  type: 'file' | 'folder'
  link?: boolean
  target?: string
  linkBroken?: boolean
  pinned?: boolean
  size: number
  mtime: number
  ext: string
}

export interface TodoItem {
  id: string
  title: string
  completed: boolean
  createdAt: string
  completedAt: string | null
}

export interface ExternalLink {
  name: string
  targetPath: string
}

export interface ProjectSettings {
  externalLinks: ExternalLink[]
}

/** 复制/移动冲突项的详情：同名文件在源与目标两边的信息，用于冲突弹窗展示对比 */
export interface ConflictDetail {
  name: string
  source: { size: number; mtime: number }
  target: { size: number; mtime: number }
}

export type SortKey = 'name' | 'size' | 'type' | 'mtime'
export type SortDir = 'asc' | 'desc'
export type ViewMode = 'grid' | 'list'

export interface AppSettings {
  autoStart: boolean
  projectsFolder: string
  theme: 'light' | 'dark' | 'system'
  /** 界面整体缩放比例，1 表示默认大小 */
  fontSize: number
  /** 全局隐藏项标识列表 */
  hiddenItems: string[]
  /** 上次压缩项目时使用的保存目录（空则回退项目父目录） */
  compressOutputDir: string
}

export interface ProjectMeta {
  id: string
  name: string
  path: string
  createdAt: string
}

export interface FileEntry {
  name: string
  type: 'file' | 'folder'
  /** 文件绝对路径（桌面合并列表用；普通 listDir 不填，由渲染层按 currentDir 拼接） */
  path?: string
  link?: boolean
  target?: string
  linkBroken?: boolean
  pinned?: boolean
  size: number
  mtime: number
  ext: string
  /** .lnk 快捷方式指向的类型（桌面图标用：文件夹快捷方式应显示文件夹图标） */
  linkTargetType?: 'file' | 'folder'
  /** 虚拟桌面图标（此电脑/回收站等命名空间对象，非真实文件） */
  virtual?: boolean
  /** 虚拟项的 Shell 命名空间路径（::{CLSID}），双击打开用 */
  shellPath?: string
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

export type ThemeId = 'light' | 'dark' | 'wind' | 'peer' | 'ripple'

/** 文本预览（txt）的显示样式偏好：记事本式，全局生效，不写入文件内容 */
export interface TextPreviewStyle {
  fontSize: number
  fontFamily: string
  bold: boolean
  italic: boolean
  underline: boolean
}

export interface AppSettings {
  autoStart: boolean
  projectsFolder: string
  theme: ThemeId
  /** 界面整体缩放比例，1 表示默认大小 */
  fontSize: number
  /** 全局隐藏项标识列表 */
  hiddenItems: string[]
  /** 上次压缩项目时使用的保存目录（空则回退项目父目录） */
  compressOutputDir: string
  /** 文本预览显示样式偏好（全局共享） */
  textPreview: TextPreviewStyle
}

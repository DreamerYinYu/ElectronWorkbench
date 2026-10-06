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

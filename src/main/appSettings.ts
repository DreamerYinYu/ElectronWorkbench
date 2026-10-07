import { join } from 'path'
import { mkdirSync } from 'fs'
import { app } from 'electron'
import { loadSection, saveSection } from './store'

/** 主题标识（完整配色预设）：浅色/深色/有风(绿)/同行(暖橙)/涟漪(蓝) */
export type ThemeId = 'light' | 'dark' | 'wind' | 'peer' | 'ripple'

/** 文本预览（txt）的显示样式偏好：记事本式，全局生效，不写入文件内容 */
export interface TextPreviewStyle {
  fontSize: number
  fontFamily: string
  bold: boolean
  italic: boolean
  underline: boolean
}

/** 工作时长提醒：从电脑本次开机起计时，满 hours 小时后右下角弹通知 */
export interface WorkReminder {
  enabled: boolean
  hours: number
  message: string
}

/** 桌面座右铭：钉在真实桌面壁纸上、只显示文字（透明+事件穿透） */
export interface Motto {
  text: string
  fontSize: number
  color: string
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
  /** 全局隐藏项标识列表（如 ['unity_meta', 'node_modules']） */
  hiddenItems: string[]
  /** 上次压缩项目时使用的保存目录（空则回退项目父目录） */
  compressOutputDir: string
  /** 文本预览显示样式偏好（全局共享） */
  textPreview: TextPreviewStyle
  /** 工作时长提醒配置 */
  workReminder: WorkReminder
  /** 桌面座右铭配置 */
  motto: Motto
}

export function defaultAppSettings(): AppSettings {
  return {
    autoStart: false,
    projectsFolder: '',
    theme: 'light',
    fontSize: 1,
    hiddenItems: [],
    compressOutputDir: '',
    textPreview: { fontSize: 13, fontFamily: '', bold: false, italic: false, underline: false },
    workReminder: { enabled: true, hours: 8, message: '工作满 8 小时，注意休息' },
    motto: { text: '', fontSize: 32, color: '#ffffff', bold: false, italic: false, underline: false }
  }
}

export function loadAppSettings(): AppSettings {
  const raw = loadSection('settings') as (Partial<AppSettings> & { defaultProjectsDir?: string }) | null
  if (!raw) return defaultAppSettings()
  const def = defaultAppSettings()
  // 兼容旧字段名 defaultProjectsDir → projectsFolder
  const projectsFolder = raw.projectsFolder ?? raw.defaultProjectsDir ?? def.projectsFolder
  const merged: AppSettings = { ...def, ...raw, projectsFolder }
  // textPreview 为嵌套对象，浅合并会整体覆盖，需单独深合并以保留缺省字段
  merged.textPreview = { ...def.textPreview, ...(raw.textPreview ?? {}) }
  // workReminder 同为嵌套对象，单独深合并
  merged.workReminder = { ...def.workReminder, ...(raw.workReminder ?? {}) }
  // motto 嵌套对象深合并
  merged.motto = { ...def.motto, ...(raw.motto ?? {}) }
  // 兼容旧版字符串档位（small/medium/large），迁移为数值缩放比例
  const rawFontSize = raw.fontSize
  if (typeof rawFontSize === 'string') {
    merged.fontSize = rawFontSize === 'small' ? 0.9 : rawFontSize === 'large' ? 1.1 : 1
  } else if (typeof rawFontSize !== 'number') {
    merged.fontSize = def.fontSize
  }
  return merged
}

export function saveAppSettings(settings: AppSettings): void {
  saveSection('settings', settings)
}

export function resolveDefaultProjectsDir(): string {
  const dir = join(app.getPath('documents'), 'Workbench Projects')
  // 确保默认项目目录存在：设置面板「打开目录」、项目扫描、新建项目都依赖它；
  // 之前从未创建，导致「打开目录」对不存在的目录静默失败（shell.openPath 无反应）
  mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * 生成传给 preload 的 additionalArguments，让渲染层在 React 渲染前同步应用主题/字号，
 * 避免窗口先以默认字号渲染、再跳到当前字号（闪变）。
 */
export function appearanceArgs(): string[] {
  const s = loadAppSettings()
  return [`--wb-font-size=${s.fontSize}`, `--wb-theme=${s.theme}`]
}

import { join } from 'path'
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
}

export function defaultAppSettings(): AppSettings {
  return {
    autoStart: false,
    projectsFolder: '',
    theme: 'light',
    fontSize: 1,
    hiddenItems: [],
    compressOutputDir: '',
    textPreview: { fontSize: 13, fontFamily: '', bold: false, italic: false, underline: false }
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
  return join(app.getPath('documents'), 'Workbench Projects')
}

/**
 * 生成传给 preload 的 additionalArguments，让渲染层在 React 渲染前同步应用主题/字号，
 * 避免窗口先以默认字号渲染、再跳到当前字号（闪变）。
 */
export function appearanceArgs(): string[] {
  const s = loadAppSettings()
  return [`--wb-font-size=${s.fontSize}`, `--wb-theme=${s.theme}`]
}

import { app } from 'electron'
import { join } from 'path'

/** 应用图标（PNG）路径：开发时为项目根 resources/icon.png，打包后 resources 目录随 files 打进 asar，同样以 app 根拼接 */
export function appIconPath(): string {
  return join(app.getAppPath(), 'resources/icon.png')
}

/** 应用图标（ICO，多尺寸）路径：Windows 托盘/快捷方式用，DPI 自适应 */
export function iconIcoPath(): string {
  return join(app.getAppPath(), 'resources/icon.ico')
}

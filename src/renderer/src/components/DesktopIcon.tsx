import { useEffect, useState } from 'react'
import { useWorkbench } from '../stores/workbench'
import Thumbnail from './Thumbnail'
import { FileIcon, ComputerIcon, RecycleBinIcon } from './icons'
import { fileType } from '../utils/format'
import type { FileEntry } from '../types'

/** 真实图标缓存：完整路径 -> dataURL（空串表示取不到，同样缓存避免重复请求） */
const iconCache = new Map<string, string>()

/**
 * 桌面视图图标：
 * - 虚拟图标（此电脑/回收站）用内置 SVG
 * - .lnk 指向文件夹用文件夹图标（带快捷方式箭头）
 * - 文件夹/图片/视频复用缩略图
 * - 其余（.lnk/.exe 等程序）提取真实系统图标，取不到回退内置通用图标
 */
export default function DesktopIcon({ entry, size = 64 }: { entry: FileEntry; size?: number }) {
  const currentDir = useWorkbench((s) => s.currentDir)
  const [icon, setIcon] = useState<string | null>(null)
  const t = entry.type === 'file' ? fileType(entry.ext) : ''
  const isVirtual = !!entry.virtual
  const isFolderLink = entry.linkTargetType === 'folder'
  const hasThumb = !isVirtual && !isFolderLink && (entry.type === 'folder' || t === 'image' || t === 'video')

  useEffect(() => {
    if (hasThumb || isVirtual || isFolderLink) return
    const path = entry.path || `${currentDir}/${entry.name}`
    const cached = iconCache.get(path)
    if (cached !== undefined) {
      setIcon(cached || null)
      return
    }
    let cancelled = false
    void window.workbench.fs
      .getIcon(path)
      .then((url) => {
        iconCache.set(path, url)
        if (!cancelled) setIcon(url || null)
      })
      .catch(() => {
        iconCache.set(path, '')
        if (!cancelled) setIcon(null)
      })
    return () => {
      cancelled = true
    }
  }, [currentDir, entry.name, entry.path, hasThumb, isVirtual, isFolderLink])

  if (isVirtual) {
    const isBin = entry.shellPath?.includes('645FF040')
    return isBin ? <RecycleBinIcon size={size} /> : <ComputerIcon size={size} />
  }
  if (isFolderLink) return <FileIcon type="folder" ext="" link size={size} />
  if (hasThumb) return <Thumbnail entry={entry} size={size} />
  if (icon) return <img className="desktop-real-icon" src={icon} alt="" draggable={false} />
  return <FileIcon type="file" ext={entry.ext} size={size} />
}

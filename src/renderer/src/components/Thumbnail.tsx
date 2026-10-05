import { useEffect, useState } from 'react'
import { useWorkbench } from '../stores/workbench'
import { FileIcon } from './icons'
import { fileType } from '../utils/format'
import type { FileEntry } from '../types'

function thumbUrl(path: string): string {
  return `workbench://local/${encodeURIComponent(path)}`
}

function VideoThumb({ path, size }: { path: string; size: number }) {
  const [poster, setPoster] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const video = document.createElement('video')
    video.muted = true
    video.preload = 'auto'
    video.crossOrigin = 'anonymous'
    video.src = thumbUrl(path)

    const capture = () => {
      if (cancelled) return
      try {
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          const canvas = document.createElement('canvas')
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
          const ctx = canvas.getContext('2d')
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
            setPoster(canvas.toDataURL('image/jpeg', 0.7))
          }
        }
      } catch {
        // 解码或跨域失败，保持图标
      }
    }

    video.addEventListener('loadeddata', () => {
      video.currentTime = 0.1
    })
    video.addEventListener('seeked', capture)
    video.addEventListener('error', capture)

    return () => {
      cancelled = true
      video.removeAttribute('src')
      video.load()
    }
  }, [path])

  return poster ? (
    <span className="thumb-wrap">
      <img className="thumb-img" src={poster} alt="" />
      <span className="thumb-play" />
    </span>
  ) : (
    <FileIcon type="file" ext="video" size={size} />
  )
}

export default function Thumbnail({ entry, size = 52 }: { entry: FileEntry; size?: number }) {
  const currentDir = useWorkbench((s) => s.currentDir)
  const t = fileType(entry.ext)

  if (entry.type === 'file' && t === 'image') {
    const path = `${currentDir}/${entry.name}`
    return <img className="thumb-img" src={thumbUrl(path)} alt={entry.name} loading="lazy" />
  }
  if (entry.type === 'file' && t === 'video') {
    const path = `${currentDir}/${entry.name}`
    return <VideoThumb path={path} size={size} />
  }
  return <FileIcon type={entry.type} ext={entry.ext} link={entry.link} size={size} />
}

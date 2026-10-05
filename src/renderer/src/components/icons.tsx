import { fileType } from '../utils/format'

type IconProps = { size?: number }

function FolderIcon({ size = 24 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" fill="#f6c945" />
      <path d="M3 9h18v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" fill="#fbd95c" />
    </svg>
  )
}

function LinkFolderIcon({ size = 24 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" fill="#f6c945" />
      <path d="M3 9h18v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" fill="#fbd95c" />
      <path d="M14.5 12.5h3.5m-1.5-1.5l1.5 1.5-1.5 1.5" fill="none" stroke="#7a6a20" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ImageIcon({ size = 24 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" fill="#4fc3a1" />
      <circle cx="9" cy="10" r="1.8" fill="#fff" opacity="0.9" />
      <path d="M5 18l5.5-5.5 3 3 3.5-3.5 2 2" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
    </svg>
  )
}

function DocIcon({ size = 24 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <path d="M6 3h8l4 4v13a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 014.5 20V4.5A1.5 1.5 0 016 3z" fill="#6b8afd" />
      <path d="M14 3v4h4" fill="#8ea5ff" />
      <path d="M8 12h8M8 15h8M8 18h5" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" opacity="0.9" />
    </svg>
  )
}

function PdfIcon({ size = 24 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <path d="M6 3h8l4 4v13a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 014.5 20V4.5A1.5 1.5 0 016 3z" fill="#f16a6a" />
      <path d="M14 3v4h4" fill="#ff8f8f" />
      <path d="M8 14c1.5-2 4-1 5.5 1" fill="none" stroke="#fff" strokeWidth="1.2" opacity="0.9" />
    </svg>
  )
}

function SheetIcon({ size = 24 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <rect x="4" y="3" width="16" height="18" rx="2" fill="#2fb56b" />
      <path d="M4 8h16M4 13h16M4 18h16M9.5 3v18M15.5 3v18" stroke="#fff" strokeWidth="1.1" opacity="0.85" />
    </svg>
  )
}

function VideoIcon({ size = 24 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <rect x="3" y="5" width="18" height="14" rx="3" fill="#9a6bf0" />
      <path d="M10 9l5 3-5 3V9z" fill="#fff" />
    </svg>
  )
}

function AudioIcon({ size = 24 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <rect x="3" y="5" width="18" height="14" rx="3" fill="#f7796a" />
      <path d="M9 15V9l6-2v8" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="7.5" cy="15" r="1.8" fill="#fff" />
      <circle cx="13.5" cy="15" r="1.8" fill="#fff" />
    </svg>
  )
}

function CodeIcon({ size = 24 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" fill="#5f6368" />
      <path d="M8.5 10l-2.5 2 2.5 2M15.5 10l2.5 2-2.5 2M13 9l-2 6" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function GenericIcon({ size = 24 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <path d="M6 3h8l4 4v13a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 014.5 20V4.5A1.5 1.5 0 016 3z" fill="#b0b6be" />
      <path d="M14 3v4h4" fill="#c6ccd4" />
    </svg>
  )
}

export function FileIcon({
  type,
  ext,
  link,
  size = 24
}: {
  type: 'file' | 'folder'
  ext: string
  link?: boolean
  size?: number
}) {
  if (type === 'folder') return link ? <LinkFolderIcon size={size} /> : <FolderIcon size={size} />
  const t = fileType(ext)
  switch (t) {
    case 'image':
      return <ImageIcon size={size} />
    case 'doc':
      return <DocIcon size={size} />
    case 'pdf':
      return <PdfIcon size={size} />
    case 'sheet':
      return <SheetIcon size={size} />
    case 'video':
      return <VideoIcon size={size} />
    case 'audio':
      return <AudioIcon size={size} />
    case 'code':
      return <CodeIcon size={size} />
    default:
      return <GenericIcon size={size} />
  }
}

export function PinIcon({ size = 15 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <path
        d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z"
        fill="currentColor"
      />
    </svg>
  )
}

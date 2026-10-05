export function formatSize(bytes: number): string {
  if (bytes <= 0) return '0 KB'
  if (bytes < 1024) return '1 KB'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export function formatMtime(ms: number): string {
  if (!ms) return '--'
  const d = new Date(ms)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const EXT_MAP: Record<string, string[]> = {
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'],
  doc: ['doc', 'docx', 'txt', 'md', 'rtf'],
  pdf: ['pdf'],
  sheet: ['xls', 'xlsx', 'csv'],
  video: ['mp4', 'mov', 'avi', 'mkv'],
  code: ['js', 'ts', 'tsx', 'jsx', 'html', 'css', 'json', 'py', 'java', 'cs', 'cpp', 'c', 'go', 'rs'],
  audio: ['mp3', 'wav', 'flac', 'aac']
}

export function fileType(ext: string): string {
  const e = ext.toLowerCase()
  for (const [t, list] of Object.entries(EXT_MAP)) {
    if (list.includes(e)) return t
  }
  return 'generic'
}

const TYPE_LABELS: Record<string, string> = {
  folder: '文件夹',
  image: '图片',
  doc: '文档',
  pdf: 'PDF',
  sheet: '表格',
  video: '视频',
  audio: '音频',
  code: '代码',
  generic: '文件'
}

export function typeLabel(entry: { type: string; ext: string }): string {
  if (entry.type === 'folder') return '文件夹'
  return TYPE_LABELS[fileType(entry.ext)] || '文件'
}

export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

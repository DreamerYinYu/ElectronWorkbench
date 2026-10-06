import { useEffect, useState } from 'react'
import { useWorkbench } from '../stores/workbench'
import type { DesktopWidget } from '../types'

const WIDGET_TITLES: Record<DesktopWidget['type'], string> = {
  clock: '时钟',
  todos: '待办',
  projects: '最近项目',
  system: '系统状态'
}

/** 时钟小组件：实时时间 + 日期星期 */
function ClockWidget(): JSX.Element {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  const pad = (n: number): string => String(n).padStart(2, '0')
  const week = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()]
  return (
    <div className="desktop-widget-body desktop-widget-clock">
      <div className="desktop-widget-clock-time">
        {pad(now.getHours())}:{pad(now.getMinutes())}
      </div>
      <div className="desktop-widget-sub">
        {now.getMonth() + 1}月{now.getDate()}日 周{week}
      </div>
    </div>
  )
}

/** 待办小组件：所有项目未完成待办（按项目名标注） */
function TodosWidget(): JSX.Element {
  const [items, setItems] = useState<{ project: string; title: string }[]>([])
  useEffect(() => {
    void window.workbench.desktop.getTodos().then(setItems)
  }, [])
  if (items.length === 0) return <div className="desktop-widget-empty">暂无待办</div>
  return (
    <div className="desktop-widget-list">
      {items.map((it, i) => (
        <div key={i} className="desktop-widget-todo">
          <span className="desktop-widget-todo-title">{it.title}</span>
          <span className="desktop-widget-todo-project">{it.project}</span>
        </div>
      ))}
    </div>
  )
}

/** 最近项目小组件：点击进入项目 */
function ProjectsWidget(): JSX.Element {
  const projects = useWorkbench((s) => s.projects)
  const selectProject = useWorkbench((s) => s.selectProject)
  if (projects.length === 0) return <div className="desktop-widget-empty">暂无项目</div>
  return (
    <div className="desktop-widget-list">
      {projects.slice(0, 4).map((p) => (
        <div key={p.id} className="desktop-widget-project" onClick={() => void selectProject(p.id)}>
          {p.name}
        </div>
      ))}
    </div>
  )
}

/** 系统状态小组件：内存 + 磁盘占用 */
function SystemWidget(): JSX.Element {
  const [info, setInfo] = useState<{ mem: { used: number; total: number }; disk: { total: number; free: number } } | null>(
    null
  )
  useEffect(() => {
    void window.workbench.desktop.getSystemInfo().then(setInfo)
  }, [])
  if (!info) return <div className="desktop-widget-empty">加载中…</div>
  const memPct = info.mem.total > 0 ? Math.round((info.mem.used / info.mem.total) * 100) : 0
  const diskUsed = info.disk.total - info.disk.free
  const diskPct = info.disk.total > 0 ? Math.round((diskUsed / info.disk.total) * 100) : 0
  return (
    <div className="desktop-widget-body">
      <div className="desktop-widget-bar-row">
        <span className="desktop-widget-bar-label">内存</span>
        <div className="desktop-widget-bar">
          <div className="desktop-widget-bar-fill" style={{ width: `${memPct}%` }} />
        </div>
        <span className="desktop-widget-bar-pct">{memPct}%</span>
      </div>
      <div className="desktop-widget-bar-row">
        <span className="desktop-widget-bar-label">磁盘</span>
        <div className="desktop-widget-bar">
          <div className="desktop-widget-bar-fill" style={{ width: `${diskPct}%` }} />
        </div>
        <span className="desktop-widget-bar-pct">{diskPct}%</span>
      </div>
    </div>
  )
}

/** 桌面小组件卡片（标题 + 按类型分发内容；抖动/减号由外层 DesktopView 处理） */
export default function WidgetCard({ widget }: { widget: DesktopWidget }): JSX.Element {
  return (
    <div className="desktop-widget">
      <div className="desktop-widget-title">{WIDGET_TITLES[widget.type]}</div>
      {widget.type === 'clock' && <ClockWidget />}
      {widget.type === 'todos' && <TodosWidget />}
      {widget.type === 'projects' && <ProjectsWidget />}
      {widget.type === 'system' && <SystemWidget />}
    </div>
  )
}

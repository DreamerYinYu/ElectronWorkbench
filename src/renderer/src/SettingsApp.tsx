import { useEffect, useRef, useState } from 'react'
import type { AppSettings, ThemeId } from './types'
import { applyAppearance } from './utils/appearance'
import Titlebar from './components/Titlebar'
import ConfirmDialog from './components/ConfirmDialog'

type SettingsTab = 'general' | 'appearance' | 'files' | 'about'

function toTab(v?: string): SettingsTab {
  return v === 'appearance' || v === 'files' || v === 'about' ? v : 'general'
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className={`switch ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}>
      <div className="switch-knob" />
    </div>
  )
}

const FONT_SIZE_STOPS = [
  { value: 0.9, label: '很小' },
  { value: 0.95, label: '小' },
  { value: 1, label: '默认' },
  { value: 1.15, label: '大' },
  { value: 1.35, label: '很大' }
]

const THEME_OPTIONS: { id: ThemeId; label: string }[] = [
  { id: 'light', label: '浅色' },
  { id: 'dark', label: '深色' },
  { id: 'wind', label: '有风' },
  { id: 'peer', label: '同行' },
  { id: 'ripple', label: '涟漪' }
]

/** WorkBuddy 风格的字号滑杆：轨道 + 刻度点 + 可拖动滑块 + 下方标签 */
function FontSizeSlider({
  value,
  onChange
}: {
  value: number
  onChange: (v: number) => void
}) {
  const stops = FONT_SIZE_STOPS
  const found = stops.findIndex((s) => Math.abs(s.value - value) < 0.001)
  const index = found >= 0 ? found : stops.findIndex((s) => s.value === 1)
  const innerRef = useRef<HTMLDivElement>(null)

  const moveTo = (clientX: number) => {
    const rect = innerRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    const nearest = Math.round(ratio * (stops.length - 1))
    const next = stops[nearest].value
    if (next !== value) onChange(next)
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    moveTo(e.clientX)
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons === 1) moveTo(e.clientX)
  }

  return (
    <div className="font-slider">
      <div
        className="font-slider-track"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
      >
        <div className="font-slider-inner" ref={innerRef}>
          {stops.map((s, i) => (
            <span
              key={s.value}
              className="font-slider-tick"
              style={{ left: `${(i / (stops.length - 1)) * 100}%` }}
            />
          ))}
          <span
            className="font-slider-fill"
            style={{ width: `${(index / (stops.length - 1)) * 100}%` }}
          />
          <span
            className="font-slider-thumb"
            style={{ left: `${(index / (stops.length - 1)) * 100}%` }}
          />
        </div>
      </div>
      <div className="font-slider-labels">
        {stops.map((s) => (
          <span key={s.value} className="font-slider-label">
            {s.label}
          </span>
        ))}
      </div>
    </div>
  )
}

/** 开机时间格式化：YYYY-MM-DD HH:mm */
function formatBootTime(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 运行时长格式化：X天X小时X分钟 / X小时X分钟 / X分钟 */
function formatUptime(ms: number): string {
  const totalMin = Math.floor(ms / 60000)
  const days = Math.floor(totalMin / 1440)
  const hours = Math.floor((totalMin % 1440) / 60)
  const mins = totalMin % 60
  if (days > 0) return `${days}天${hours}小时${mins}分钟`
  if (hours > 0) return `${hours}小时${mins}分钟`
  return `${mins}分钟`
}

function GeneralPanel({
  settings,
  save
}: {
  settings: AppSettings
  save: (patch: Partial<AppSettings>) => void
}) {
  const [configDir, setConfigDir] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [bootTime, setBootTime] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    window.workbench.getDataPaths().then((p) => setConfigDir(p.configDir))
  }, [])
  // 开机时间 + 已运行时长（每分钟刷新一次显示）
  useEffect(() => {
    window.workbench.getBootInfo().then((info) => setBootTime(info.bootTime))
    const t = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(t)
  }, [])

  return (
    <>
      <div className="settings-section-title">常规</div>
      <div className="setting-row">
        <div className="setting-info">
          <div className="setting-name">开机自启</div>
          <div className="setting-desc">开启后 Workbench 会在你登录电脑后自动启动。</div>
        </div>
        <Switch checked={settings.autoStart} onChange={(v) => save({ autoStart: v })} />
      </div>
      <div className="settings-section-title">显示</div>
      <div className="setting-row">
        <div className="setting-info">
          <div className="setting-name">字体大小</div>
          <div className="setting-desc">调整界面整体文字大小，立即生效。</div>
        </div>
        <FontSizeSlider value={settings.fontSize} onChange={(f) => save({ fontSize: f })} />
      </div>
      <div className="settings-section-title">本地存储</div>
      <div className="setting-row setting-group">
        <div className="setting-item">
          <div className="setting-info">
            <div className="setting-name">项目位置</div>
            <div className="setting-desc" style={{ wordBreak: 'break-all' }}>
              {settings.projectsFolder || '未设置'}
            </div>
          </div>
          <button
            className="btn"
            onClick={async () => {
              const dir = await window.workbench.selectDirectory()
              if (dir) save({ projectsFolder: dir })
            }}
          >
            更改
          </button>
          <button
            className="btn"
            onClick={() => {
              if (settings.projectsFolder) void window.workbench.openPath(settings.projectsFolder)
            }}
          >
            打开目录
          </button>
        </div>
        <div className="setting-item">
          <div className="setting-info">
            <div className="setting-name">系统缓存目录</div>
            <div className="setting-desc" style={{ wordBreak: 'break-all' }}>
              {configDir || '加载中…'}
            </div>
          </div>
          <button className="btn" onClick={() => configDir && void window.workbench.openPath(configDir)}>
            打开目录
          </button>
          <button className="btn danger" onClick={() => setConfirming(true)}>
            清除缓存
          </button>
        </div>
      </div>

      <div className="settings-section-title">工作提醒</div>
      <div className="setting-row setting-group">
        <div className="setting-item">
          <div className="setting-info">
            <div className="setting-name">满时长提醒</div>
            <div className="setting-desc">从电脑本次开机起计时，满设定时长后右下角弹通知提醒休息。</div>
          </div>
          <Switch
            checked={settings.workReminder.enabled}
            onChange={(v) => save({ workReminder: { ...settings.workReminder, enabled: v } })}
          />
        </div>
        <div className="setting-item">
          <div className="setting-info">
            <div className="setting-name">提醒时长</div>
          </div>
          <div className="setting-dir">
            <input
              className="setting-input"
              type="number"
              min={1}
              max={24}
              value={settings.workReminder.hours}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10)
                if (Number.isFinite(v)) {
                  save({ workReminder: { ...settings.workReminder, hours: Math.min(24, Math.max(1, v)) } })
                }
              }}
            />
            <span>小时</span>
          </div>
        </div>
        <div className="setting-item">
          <div className="setting-info">
            <div className="setting-name">提醒文案</div>
          </div>
          <input
            className="setting-input"
            value={settings.workReminder.message}
            onChange={(e) => save({ workReminder: { ...settings.workReminder, message: e.target.value } })}
          />
        </div>
        <div className="setting-item">
          <div className="setting-info">
            <div className="setting-name">本次开机时间</div>
            <div className="setting-desc">
              {bootTime !== null
                ? `${formatBootTime(bootTime)} · 已运行 ${formatUptime(now - bootTime)}`
                : '加载中…'}
            </div>
          </div>
        </div>
      </div>
      {confirming && (
        <ConfirmDialog
          title="清除缓存"
          message="将清空全部配置数据（设置、项目清单、界面状态、桌面布局），恢复默认。此操作不可撤销。"
          buttons={[
            { label: '取消', onClick: () => setConfirming(false) },
            {
              label: '清除缓存',
              variant: 'danger',
              onClick: () => {
                setConfirming(false)
                void window.workbench.resetAllData()
              }
            }
          ]}
          onClose={() => setConfirming(false)}
        />
      )}
    </>
  )
}

function AppearancePanel({
  settings,
  save
}: {
  settings: AppSettings
  save: (patch: Partial<AppSettings>) => void
}) {
  return (
    <>
      <div className="settings-section-title">主题</div>
      <div className="setting-row">
        <div className="setting-info">
          <div className="setting-name">外观主题</div>
          <div className="setting-desc">选择整套配色主题，立即生效。</div>
        </div>
        <div className="option-group">
          {THEME_OPTIONS.map((t) => (
            <button
              key={t.id}
              className={`option-item ${settings.theme === t.id ? 'active' : ''}`}
              onClick={() => save({ theme: t.id })}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

function AboutPanel() {
  return (
    <>
      <div className="settings-section-title">关于</div>
      <div className="setting-row">
        <div className="setting-info">
          <div className="setting-name">Workbench</div>
          <div className="setting-desc">版本信息 · V1.2</div>
          <div className="setting-desc">Electron + React 18 + TypeScript · 数据全部保存在本地</div>
        </div>
      </div>
    </>
  )
}

const FILE_HIDDEN_GROUPS: { title: string; items: { id: string; label: string }[] }[] = [
  {
    title: 'Unreal',
    items: [{ id: 'unreal_gen', label: 'Intermediate / Saved / Binaries / DerivedDataCache' }]
  },
  {
    title: 'Unity',
    items: [
      { id: 'unity_meta', label: '所有 .meta 元数据文件' },
      { id: 'unity_gen', label: 'Library / Temp / Logs / UserSettings' }
    ]
  },
  {
    title: 'Node.js',
    items: [
      { id: 'node_modules', label: 'node_modules' },
      { id: 'frontend_build', label: 'dist / build / .next / .nuxt' }
    ]
  },
  {
    title: 'Python',
    items: [{ id: 'python_cache', label: '__pycache__ / .venv / .pytest_cache' }]
  },
  {
    title: 'Java / .NET',
    items: [{ id: 'java_dotnet', label: 'target / .gradle / .idea / bin / obj / .vs' }]
  },
  {
    title: '通用',
    items: [
      { id: 'dotfiles', label: '点开头隐藏文件（.git / .DS_Store）' },
      { id: 'log_files', label: '日志文件（*.log）' }
    ]
  }
]

function FilesPanel({
  settings,
  save
}: {
  settings: AppSettings
  save: (patch: Partial<AppSettings>) => void
}) {
  const toggle = (id: string) => {
    const set = new Set(settings.hiddenItems)
    if (set.has(id)) set.delete(id)
    else set.add(id)
    save({ hiddenItems: [...set] })
  }

  return (
    <>
      <div className="settings-section-title">文件显示</div>
      <div className="setting-desc" style={{ marginBottom: 16 }}>
        按项目类型隐藏生成文件，勾选后所有项目立即生效。
      </div>
      {FILE_HIDDEN_GROUPS.map((g) => (
        <div key={g.title} style={{ marginBottom: 16 }}>
          <div className="hide-group-title">{g.title}</div>
          {g.items.map((it) => (
            <label className="hide-check-row" key={it.id}>
              <input type="checkbox" checked={settings.hiddenItems.includes(it.id)} onChange={() => toggle(it.id)} />
              <span>{it.label}</span>
            </label>
          ))}
        </div>
      ))}
    </>
  )
}

const NAV_ICONS: Record<SettingsTab, React.ReactNode> = {
  general: (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none">
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="8" cy="8" r="4.4" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  ),
  appearance: (
    <svg viewBox="0 0 16 16" width="15" height="15">
      <path d="M13.5 9.5A5.5 5.5 0 116.5 2.5a4.3 4.3 0 004.5 4.5 4.3 4.3 0 002.5 2.5z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <circle cx="6" cy="6" r="0.9" fill="currentColor" />
    </svg>
  ),
  files: (
    <svg viewBox="0 0 16 16" width="15" height="15">
      <path d="M1.5 4.5A1.5 1.5 0 013 3h3l1.5 1.5H13a1.5 1.5 0 011.5 1.5v6A1.5 1.5 0 0113 13.5H3a1.5 1.5 0 01-1.5-1.5v-7.5z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M6 7.5l4 0M6 10l2.5 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  about: (
    <svg viewBox="0 0 16 16" width="15" height="15">
      <circle cx="8" cy="8" r="5.8" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 7.2v3.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="8" cy="5.2" r="0.9" fill="currentColor" />
    </svg>
  )
}

export default function SettingsApp({ initialTab }: { initialTab?: string }) {
  const [tab, setTab] = useState<SettingsTab>(toTab(initialTab))
  const [settings, setSettings] = useState<AppSettings | null>(null)

  useEffect(() => {
    window.workbench.appSettings.get().then((s) => {
      setSettings(s)
      applyAppearance(s)
    })
    const off = window.workbench.onAppearanceChanged((s) => {
      setSettings(s)
      applyAppearance(s)
    })
    // 设置窗口已打开时，外部再次请求打开某个标签页（如用户菜单「外观」）→ 切换标签
    window.workbench.onSettingsSwitchTab((t) => setTab(toTab(t)))
    return off
  }, [])

  const save = (patch: Partial<AppSettings>) => {
    if (!settings) return
    const next = { ...settings, ...patch }
    setSettings(next)
    applyAppearance(next)
    window.workbench.appSettings.save(next)
  }

  const navItems: { key: SettingsTab; label: string }[] = [
    { key: 'general', label: '通用' },
    { key: 'appearance', label: '外观' },
    { key: 'files', label: '文件显示' },
    { key: 'about', label: '关于' }
  ]

  return (
    <div className="settings-app">
      <Titlebar title="设置" />
      <div className="settings-body">
        <nav className="settings-nav">
          {navItems.map((n) => (
            <div
              key={n.key}
              className={`nav-item ${tab === n.key ? 'active' : ''}`}
              onClick={() => setTab(n.key)}
            >
              {NAV_ICONS[n.key]}
              {n.label}
            </div>
          ))}
        </nav>
        <div className="settings-content">
          {settings && tab === 'general' && <GeneralPanel settings={settings} save={save} />}
          {settings && tab === 'appearance' && <AppearancePanel settings={settings} save={save} />}
          {settings && tab === 'files' && <FilesPanel settings={settings} save={save} />}
          {tab === 'about' && <AboutPanel />}
        </div>
      </div>
    </div>
  )
}

import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs'
import { join, dirname } from 'path'

export type SectionKey = 'settings' | 'projects' | 'ui' | 'window' | 'desktop'

interface StoreData {
  settings: unknown
  projects: unknown
  ui: unknown
  window: unknown
  desktop: unknown
}

function storePath(): string {
  return join(app.getPath('appData'), 'Workbench', 'workbench.json')
}

function legacyDir(): string {
  return join(app.getPath('appData'), 'Workbench')
}

function emptyData(): StoreData {
  return { settings: null, projects: [], ui: null, window: null, desktop: null }
}

let cache: StoreData | null = null

/** 读取旧版分散的配置文件（settings/config/state），用于首次迁移 */
function migrateLegacy(): StoreData {
  const dir = legacyDir()
  const data = emptyData()

  const legacySettings = join(dir, 'settings.json')
  if (existsSync(legacySettings)) {
    try {
      data.settings = JSON.parse(readFileSync(legacySettings, 'utf-8'))
    } catch {
      data.settings = null
    }
  }

  const legacyConfig = join(dir, 'config.json')
  if (existsSync(legacyConfig)) {
    try {
      data.projects = JSON.parse(readFileSync(legacyConfig, 'utf-8'))
    } catch {
      data.projects = []
    }
  }

  const legacyState = join(dir, 'state.json')
  if (existsSync(legacyState)) {
    try {
      const st = JSON.parse(readFileSync(legacyState, 'utf-8')) as { ui?: unknown; window?: unknown }
      data.ui = st.ui ?? null
      data.window = st.window ?? null
    } catch {
      data.ui = null
      data.window = null
    }
  }
  return data
}

/** 删除旧版分散的配置文件（迁移完成后清理） */
function removeLegacyFiles(): void {
  const dir = legacyDir()
  for (const name of ['settings.json', 'config.json', 'state.json']) {
    const p = join(dir, name)
    if (existsSync(p)) {
      try {
        rmSync(p)
      } catch {
        // 忽略删除失败，旧文件残留无害
      }
    }
  }
}

function load(): StoreData {
  if (cache) return cache
  const p = storePath()
  if (existsSync(p)) {
    try {
      cache = { ...emptyData(), ...(JSON.parse(readFileSync(p, 'utf-8')) as Partial<StoreData>) }
      return cache
    } catch {
      // 文件损坏，走迁移/重建
    }
  }
  cache = migrateLegacy()
  persist()
  removeLegacyFiles()
  return cache
}

function persist(): void {
  if (!cache) return
  const p = storePath()
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, JSON.stringify(cache, null, 2), 'utf-8')
}

export function loadSection<K extends SectionKey>(key: K): StoreData[K] {
  return load()[key]
}

export function saveSection<K extends SectionKey>(key: K, value: StoreData[K]): void {
  load()[key] = value
  persist()
}

/** 清空全部配置数据（settings/projects/ui/window/desktop），写回默认空结构，恢复出厂默认 */
export function resetAll(): void {
  cache = emptyData()
  persist()
}

import { loadSection, saveSection } from './store'

export interface UiState {
  currentProjectId: string | null
  view: 'grid' | 'list'
  sortKey: string
  sortDir: 'asc' | 'desc'
  sidebarWidth: number
  todoWidth: number
}

export interface WindowState {
  width: number
  height: number
  x?: number
  y?: number
  maximized: boolean
}

export interface AppState {
  ui: UiState
  window: WindowState
}

function defaultState(): AppState {
  return {
    ui: {
      currentProjectId: null,
      view: 'grid',
      sortKey: 'name',
      sortDir: 'asc',
      sidebarWidth: 224,
      todoWidth: 296
    },
    window: {
      width: 1200,
      height: 780,
      maximized: false
    }
  }
}

export function loadState(): AppState {
  const ui = loadSection('ui') as Partial<UiState> | null
  const win = loadSection('window') as Partial<WindowState> | null
  const def = defaultState()
  return {
    ui: { ...def.ui, ...(ui ?? {}) },
    window: { ...def.window, ...(win ?? {}) }
  }
}

export function saveState(state: AppState): void {
  saveSection('ui', state.ui)
  saveSection('window', state.window)
}

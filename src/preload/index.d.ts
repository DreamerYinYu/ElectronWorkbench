import type { ProjectMeta, FileEntry, TodoItem, ProjectSettings } from '../main/types'
import type { AppSettings } from '../main/appSettings'
import type { UiState } from '../main/state'

declare global {
  interface Window {
    workbench: {
      minimize: () => void
      toggleMaximize: () => void
      close: () => void
      initialAppearance: { fontSize: number; theme: string }
      getDefaultProjectsDir: () => Promise<string>
      openSettings: (tab?: string) => Promise<void>
      selectDirectory: () => Promise<string | null>
      getDataPaths: () => Promise<{ configDir: string; projectsFolder: string }>
      openPath: (target: string) => Promise<string>
      preview: {
        open: (filePath: string) => Promise<void>
        getFile: () => Promise<string>
        setDirty: (dirty: boolean) => Promise<void>
        onFileChanged: (callback: (filePath: string) => void) => void
        onConfirmClose: (callback: () => void) => void
        forceClose: () => Promise<void>
      }
      appSettings: {
        get: () => Promise<AppSettings>
        save: (settings: AppSettings) => Promise<void>
      }
      state: {
        getUi: () => Promise<UiState>
        saveUi: (ui: UiState) => Promise<void>
      }
      onAppearanceChanged: (callback: (settings: AppSettings) => void) => () => void
      onSettingsSwitchTab: (callback: (tab: string) => void) => void
      onMaximizeChange: (callback: (isMaximized: boolean) => void) => void
      projects: {
        list: () => Promise<ProjectMeta[]>
        reorder: (orderedIds: string[]) => Promise<ProjectMeta[]>
        scan: (folderPath: string) => Promise<ProjectMeta[]>
        create: (parentDir: string, name: string) => Promise<ProjectMeta>
        rename: (id: string, newName: string) => Promise<ProjectMeta>
        delete: (id: string) => Promise<void>
        getSettings: (id: string) => Promise<ProjectSettings>
        saveSettings: (id: string, settings: ProjectSettings) => Promise<void>
        compress: (id: string, destDir: string) => Promise<string>
        import: (archivePath: string, destDir: string) => Promise<ProjectMeta>
        renameLink: (id: string, targetPath: string, newName: string) => Promise<void>
        removeLink: (id: string, targetPath: string) => Promise<void>
        setLink: (id: string, name: string, targetPath: string) => Promise<void>
      }
      fs: {
        listDir: (dir: string) => Promise<FileEntry[]>
        mkdir: (parent: string, name: string) => Promise<string>
        createFile: (parent: string, name: string) => Promise<string>
        rename: (oldPath: string, newName: string) => Promise<string>
        remove: (target: string) => Promise<void>
        removeMany: (targets: string[]) => Promise<void>
        copy: (sources: string[], destDir: string) => Promise<void>
        copyEntries: (sources: string[], destDir: string, conflict: 'replace' | 'skip') => Promise<void>
        moveEntries: (sources: string[], destDir: string, conflict: 'replace' | 'skip') => Promise<void>
        readText: (target: string) => Promise<string>
        writeText: (target: string, content: string) => Promise<void>
        readBinary: (target: string) => Promise<string>
        readImage: (target: string) => Promise<string>
        openPath: (target: string) => Promise<string>
        showInFolder: (target: string) => Promise<void>
        stat: (target: string) => Promise<{ size: number; mtime: number; birthtime: number; type: 'file' | 'folder' }>
        statExternal: (target: string) => Promise<{ type: 'file' | 'folder' }>
        togglePin: (target: string) => Promise<boolean>
        watchProject: (projectPath: string) => Promise<void>
        getPathForFile: (file: File) => string
      }
      onFilesChanged: (callback: () => void) => void
      onDirSizeDone: (callback: (data: { path: string; size: number }) => void) => void
      todos: {
        list: (projectId: string) => Promise<TodoItem[]>
        add: (projectId: string, title: string) => Promise<TodoItem>
        toggle: (projectId: string, id: string) => Promise<TodoItem>
        update: (projectId: string, id: string, title: string) => Promise<TodoItem>
        remove: (projectId: string, id: string) => Promise<void>
        reorder: (projectId: string, orderedIds: string[]) => Promise<void>
      }
    }
  }
}

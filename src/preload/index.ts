import { contextBridge, ipcRenderer, webUtils } from 'electron'

/** 读取主进程通过 additionalArguments 传入的参数（如 --wb-font-size=1.15） */
function readArg(prefix: string): string {
  const a = process.argv.find((x) => x.startsWith(prefix))
  return a ? a.slice(prefix.length) : ''
}

/** 启动时同步外观（主进程在创建窗口时注入），供渲染层在 React 渲染前应用，避免字号跳变 */
const initialAppearance = {
  fontSize: parseFloat(readArg('--wb-font-size=')) || 1,
  theme: readArg('--wb-theme=') || 'light'
}

const api = {
  minimize: (): void => ipcRenderer.send('window:minimize'),
  toggleMaximize: (): void => ipcRenderer.send('window:toggle-maximize'),
  close: (): void => ipcRenderer.send('window:close'),
  initialAppearance,
  getDefaultProjectsDir: (): Promise<string> => ipcRenderer.invoke('app:getDefaultProjectsDir'),
  getDesktopPath: (): Promise<string> => ipcRenderer.invoke('app:getDesktopPath'),
  getWallpaper: (): Promise<string | null> => ipcRenderer.invoke('app:getWallpaper'),
  getAppIcon: (): Promise<string> => ipcRenderer.invoke('app:getAppIcon'),
  openSettings: (tab?: string): Promise<void> => ipcRenderer.invoke('app:openSettings', tab),
  resetAllData: (): Promise<void> => ipcRenderer.invoke('app:resetAllData'),
  selectDirectory: (): Promise<string | null> => ipcRenderer.invoke('dialog:selectDirectory'),
  getDataPaths: (): Promise<{ configDir: string; projectsFolder: string }> =>
    ipcRenderer.invoke('app:getDataPaths'),
  openPath: (target: string): Promise<string> => ipcRenderer.invoke('app:openPath', target),
  preview: {
    open: (filePath: string): Promise<void> => ipcRenderer.invoke('preview:open', filePath),
    getFile: (): Promise<string> => ipcRenderer.invoke('preview:getFile'),
    setDirty: (dirty: boolean): Promise<void> => ipcRenderer.invoke('preview:setDirty', dirty),
    onFileChanged: (callback: (filePath: string) => void): void => {
      ipcRenderer.on('preview:fileChanged', (_event, filePath: string) => callback(filePath))
    },
    onConfirmClose: (callback: () => void): void => {
      ipcRenderer.on('preview:confirmClose', () => callback())
    },
    forceClose: (): Promise<void> => ipcRenderer.invoke('preview:forceClose')
  },
  appSettings: {
    get: () => ipcRenderer.invoke('app:getSettings'),
    save: (settings: unknown) => ipcRenderer.invoke('app:saveSettings', settings)
  },
  state: {
    getUi: () => ipcRenderer.invoke('state:getUi'),
    saveUi: (ui: unknown) => ipcRenderer.invoke('state:saveUi', ui)
  },
  desktop: {
    getLayout: () => ipcRenderer.invoke('desktop:getLayout'),
    saveLayout: (layout: unknown) => ipcRenderer.invoke('desktop:saveLayout', layout),
    getSystemInfo: () => ipcRenderer.invoke('desktop:getSystemInfo'),
    getTodos: () => ipcRenderer.invoke('desktop:getTodos')
  },
  onAppearanceChanged: (callback: (settings: unknown) => void): void => {
    ipcRenderer.on('appearance:changed', (_event, settings) => callback(settings))
  },
  onSettingsSwitchTab: (callback: (tab: string) => void): void => {
    ipcRenderer.on('settings:switchTab', (_event, tab: string) => callback(tab))
  },
  onMaximizeChange: (callback: (isMaximized: boolean) => void): void => {
    ipcRenderer.on('window:maximized', (_event, isMaximized: boolean) => callback(isMaximized))
  },

  projects: {
    list: () => ipcRenderer.invoke('project:list'),
    reorder: (orderedIds: string[]) => ipcRenderer.invoke('project:reorder', orderedIds),
    scan: (folderPath: string) => ipcRenderer.invoke('project:scan', folderPath),
    create: (parentDir: string, name: string) => ipcRenderer.invoke('project:create', parentDir, name),
    rename: (id: string, newName: string) => ipcRenderer.invoke('project:rename', id, newName),
    delete: (id: string) => ipcRenderer.invoke('project:delete', id),
    getSettings: (id: string) => ipcRenderer.invoke('project:getSettings', id),
    saveSettings: (id: string, settings: unknown) => ipcRenderer.invoke('project:saveSettings', id, settings),
    compress: (id: string, destDir: string) => ipcRenderer.invoke('project:compress', id, destDir),
    import: (archivePath: string, destDir: string) => ipcRenderer.invoke('project:import', archivePath, destDir),
    renameLink: (id: string, targetPath: string, newName: string) =>
      ipcRenderer.invoke('project:renameLink', id, targetPath, newName),
    removeLink: (id: string, targetPath: string) => ipcRenderer.invoke('project:removeLink', id, targetPath),
    setLink: (id: string, name: string, targetPath: string) =>
      ipcRenderer.invoke('project:setLink', id, name, targetPath)
  },

  fs: {
    listDir: (dir: string) => ipcRenderer.invoke('fs:listDir', dir),
    listDesktop: () => ipcRenderer.invoke('fs:listDesktop'),
    mkdir: (parent: string, name: string) => ipcRenderer.invoke('fs:mkdir', parent, name),
    createFile: (parent: string, name: string) => ipcRenderer.invoke('fs:createFile', parent, name),
    rename: (oldPath: string, newName: string) => ipcRenderer.invoke('fs:rename', oldPath, newName),
    remove: (target: string) => ipcRenderer.invoke('fs:remove', target),
    removeMany: (targets: string[]) => ipcRenderer.invoke('fs:removeMany', targets),
    copy: (sources: string[], destDir: string) => ipcRenderer.invoke('fs:copy', sources, destDir),
    copyEntries: (sources: string[], destDir: string, conflict: 'replace' | 'skip') =>
      ipcRenderer.invoke('fs:copyEntries', sources, destDir, conflict),
    moveEntries: (sources: string[], destDir: string, conflict: 'replace' | 'skip') =>
      ipcRenderer.invoke('fs:moveEntries', sources, destDir, conflict),
    readText: (target: string) => ipcRenderer.invoke('fs:readText', target),
    writeText: (target: string, content: string) => ipcRenderer.invoke('fs:writeText', target, content),
    readBinary: (target: string) => ipcRenderer.invoke('fs:readBinary', target),
    readImage: (target: string) => ipcRenderer.invoke('fs:readImage', target),
    getIcon: (target: string) => ipcRenderer.invoke('fs:getIcon', target),
    openPath: (target: string) => ipcRenderer.invoke('fs:openPath', target),
    showInFolder: (target: string) => ipcRenderer.invoke('fs:showInFolder', target),
    stat: (target: string) => ipcRenderer.invoke('fs:stat', target),
    statExternal: (target: string) => ipcRenderer.invoke('fs:statExternal', target),
    togglePin: (target: string) => ipcRenderer.invoke('fs:togglePin', target),
    watchProject: (projectPath: string) => ipcRenderer.invoke('fs:watchProject', projectPath),
    getPathForFile: (file: File): string => webUtils.getPathForFile(file)
  },
  onFilesChanged: (callback: () => void): void => {
    ipcRenderer.on('fs:changed', () => callback())
  },
  onDirSizeDone: (callback: (data: { path: string; size: number }) => void): void => {
    ipcRenderer.on('fs:dirSizeDone', (_event, data: { path: string; size: number }) => callback(data))
  },

  todos: {
    list: (projectId: string) => ipcRenderer.invoke('todo:list', projectId),
    add: (projectId: string, title: string) => ipcRenderer.invoke('todo:add', projectId, title),
    toggle: (projectId: string, id: string) => ipcRenderer.invoke('todo:toggle', projectId, id),
    update: (projectId: string, id: string, title: string) =>
      ipcRenderer.invoke('todo:update', projectId, id, title),
    remove: (projectId: string, id: string) => ipcRenderer.invoke('todo:remove', projectId, id),
    reorder: (projectId: string, orderedIds: string[]) =>
      ipcRenderer.invoke('todo:reorder', projectId, orderedIds)
  }
}

contextBridge.exposeInMainWorld('workbench', api)

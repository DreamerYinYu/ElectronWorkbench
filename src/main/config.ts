import { loadSection, saveSection } from './store'
import type { ProjectMeta } from './types'

export function loadProjects(): ProjectMeta[] {
  const data = loadSection('projects')
  return Array.isArray(data) ? (data as ProjectMeta[]) : []
}

export function saveProjects(projects: ProjectMeta[]): void {
  saveSection('projects', projects)
}

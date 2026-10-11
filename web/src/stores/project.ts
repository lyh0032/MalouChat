import { create } from 'zustand'

import {
  createProject as createProjectApi,
  deleteProject as deleteProjectApi,
  fetchProjects,
  updateProject as updateProjectApi
} from '../api/project'
import type { CreateProjectInput, ProjectRecord, UpdateProjectInput } from '../types/project'

type ProjectState = {
  projects: ProjectRecord[]
  isLoadingProjects: boolean
  loadProjects: (silent?: boolean, force?: boolean) => Promise<void>
  createProject: (input: CreateProjectInput) => Promise<ProjectRecord>
  updateProject: (id: string, input: UpdateProjectInput) => Promise<ProjectRecord>
  deleteProject: (id: string) => Promise<void>
  adjustConversationCount: (id: string | null, delta: number) => void
  reset: () => void
}

let activeLoadPromise: Promise<void> | null = null
let hasLoaded = false
let loadEpoch = 0

export const useProjectStore = create<ProjectState>((set) => ({
  projects: [],
  isLoadingProjects: false,

  async loadProjects(silent = false, force = false) {
    if (activeLoadPromise) return activeLoadPromise
    if (hasLoaded && !force) return
    if (!silent) set({ isLoadingProjects: true })
    const epoch = loadEpoch
    const request = fetchProjects()
      .then((projects) => {
        if (epoch !== loadEpoch) return
        hasLoaded = true
        set({ projects })
      })
      .finally(() => {
        if (activeLoadPromise === request) activeLoadPromise = null
        if (!silent) set({ isLoadingProjects: false })
      })
    activeLoadPromise = request
    return request
  },

  async createProject(input) {
    const project = await createProjectApi(input)
    set((state) => ({ projects: [project, ...state.projects] }))
    return project
  },

  async updateProject(id, input) {
    const project = await updateProjectApi(id, input)
    set((state) => ({
      projects: state.projects.map((item) => item.id === id ? project : item)
    }))
    return project
  },

  async deleteProject(id) {
    await deleteProjectApi(id)
    set((state) => ({ projects: state.projects.filter((project) => project.id !== id) }))
  },

  adjustConversationCount(id, delta) {
    if (!id || delta === 0) return
    set((state) => ({
      projects: state.projects.map((project) => project.id === id
        ? { ...project, conversationCount: Math.max(0, project.conversationCount + delta) }
        : project)
    }))
  },

  reset() {
    activeLoadPromise = null
    hasLoaded = false
    loadEpoch += 1
    set({ projects: [], isLoadingProjects: false })
  }
}))

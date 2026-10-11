import { create } from 'zustand'

import { fetchAdminModels } from '../api/admin-model'
import type { AiModelRecord } from '../types/admin-model'

type AdminModelState = {
  models: AiModelRecord[]
  isLoading: boolean
  loadModels: (force?: boolean) => Promise<void>
  setModels: (models: AiModelRecord[]) => void
  reset: () => void
}

let activeLoadPromise: Promise<void> | null = null
let hasLoaded = false
let loadEpoch = 0

export const useAdminModelStore = create<AdminModelState>((set) => ({
  models: [],
  isLoading: false,

  async loadModels(force = false) {
    if (activeLoadPromise) return activeLoadPromise
    if (hasLoaded && !force) return
    set({ isLoading: true })
    const epoch = loadEpoch
    const request = fetchAdminModels()
      .then((models) => {
        if (epoch !== loadEpoch) return
        hasLoaded = true
        set({ models })
      })
      .finally(() => {
        if (activeLoadPromise === request) activeLoadPromise = null
        set({ isLoading: false })
      })
    activeLoadPromise = request
    return request
  },

  setModels(models) {
    hasLoaded = true
    set({ models })
  },

  reset() {
    activeLoadPromise = null
    hasLoaded = false
    loadEpoch += 1
    set({ models: [], isLoading: false })
  }
}))

import { create } from 'zustand'

import { createMemory, deleteMemory, fetchMemories, updateMemory } from '../api/memory'
import type {
  CreateMemoryInput,
  MemoryFilters,
  MemoryRecord,
  UpdateMemoryInput
} from '../types/memory'

type MemoryState = {
  memories: MemoryRecord[]
  filters: MemoryFilters
  isLoading: boolean
  hasLoaded: boolean
  loadMemories: (filters?: MemoryFilters, force?: boolean) => Promise<void>
  createMemory: (input: CreateMemoryInput) => Promise<MemoryRecord>
  updateMemory: (memoryId: string, input: UpdateMemoryInput) => Promise<MemoryRecord>
  deleteMemory: (memoryId: string) => Promise<void>
  reset: () => void
}

let activeLoad: Promise<void> | null = null
let loadEpoch = 0

export const useMemoryStore = create<MemoryState>((set, get) => ({
  memories: [],
  filters: {},
  isLoading: false,
  hasLoaded: false,

  async loadMemories(filters = get().filters, force = false) {
    if (!force && get().hasLoaded) return
    if (activeLoad) return activeLoad

    set({ isLoading: true, filters })
    const epoch = loadEpoch
    activeLoad = fetchMemories(filters)
      .then((memories) => {
        if (epoch !== loadEpoch) return
        set({ memories, hasLoaded: true })
      })
      .finally(() => {
        set({ isLoading: false })
        activeLoad = null
      })

    return activeLoad
  },

  async createMemory(input) {
    const memory = await createMemory(input)
    set((state) => ({ memories: [memory, ...state.memories] }))
    return memory
  },

  async updateMemory(memoryId, input) {
    const updatedMemory = await updateMemory(memoryId, input)
    set((state) => ({
      memories: state.memories.map((memory) =>
        memory.id === memoryId ? updatedMemory : memory
      )
    }))
    return updatedMemory
  },

  async deleteMemory(memoryId) {
    await deleteMemory(memoryId)
    set((state) => ({
      memories: state.memories.filter((memory) => memory.id !== memoryId)
    }))
  },

  reset() {
    activeLoad = null
    loadEpoch += 1
    set({ memories: [], filters: {}, isLoading: false, hasLoaded: false })
  }
}))

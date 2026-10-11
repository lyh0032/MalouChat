import { create } from 'zustand'

import {
  createKnowledgeBase,
  deleteKnowledgeBase,
  fetchKnowledgeBases,
  updateKnowledgeBase
} from '../api/knowledge-base'
import type {
  CreateKnowledgeBaseInput,
  KnowledgeBaseRecord,
  UpdateKnowledgeBaseInput
} from '../types/knowledge-base'

const POLL_INTERVAL_MS = 3000

type KnowledgeBaseState = {
  knowledgeBases: KnowledgeBaseRecord[]
  selectedKnowledgeBaseId: string
  isLoading: boolean
  isCreating: boolean
  conversationBindingsDirty: boolean
  loadKnowledgeBases: (silent?: boolean, force?: boolean) => Promise<void>
  createKnowledgeBase: (input: CreateKnowledgeBaseInput) => Promise<KnowledgeBaseRecord>
  updateKnowledgeBase: (id: string, input: UpdateKnowledgeBaseInput) => Promise<KnowledgeBaseRecord>
  deleteKnowledgeBase: (id: string) => Promise<void>
  replaceKnowledgeBase: (record: KnowledgeBaseRecord) => void
  removeKnowledgeBaseLocally: (id: string, affectsBindings?: boolean) => void
  markConversationBindingsDirty: () => void
  clearConversationBindingsDirty: () => void
  selectKnowledgeBase: (id: string) => void
  clearSelectedKnowledgeBase: () => void
  clearPolling: () => void
  reset: () => void
}

let activeLoadPromise: Promise<void> | null = null
let pollTimer: ReturnType<typeof setTimeout> | null = null
let hasLoaded = false
let loadEpoch = 0

function clearPollTimer() {
  if (pollTimer) clearTimeout(pollTimer)
  pollTimer = null
}

export const useKnowledgeBaseStore = create<KnowledgeBaseState>((set, get) => {
  function schedulePolling() {
    clearPollTimer()
    const hasProcessingItems = get().knowledgeBases.some(
      (item) => item.processingStatus === 'queued' || item.processingStatus === 'processing'
    )
    if (!hasProcessingItems) return

    pollTimer = setTimeout(() => {
      void get().loadKnowledgeBases(true, true)
    }, POLL_INTERVAL_MS)
  }

  function applyRecords(records: KnowledgeBaseRecord[]) {
    const previous = get().knowledgeBases
    const nextIds = new Set(records.map((item) => item.id))
    const selectedId = get().selectedKnowledgeBaseId
    const selected = records.find((item) => item.id === selectedId)

    set({
      knowledgeBases: records,
      conversationBindingsDirty:
        get().conversationBindingsDirty || previous.some((item) => !nextIds.has(item.id)),
      selectedKnowledgeBaseId: selected?.processingStatus === 'completed' ? selectedId : ''
    })
  }

  return {
    knowledgeBases: [],
    selectedKnowledgeBaseId: '',
    isLoading: false,
    isCreating: false,
    conversationBindingsDirty: false,

    async loadKnowledgeBases(silent = false, force = false) {
      if (activeLoadPromise) return activeLoadPromise
      if (hasLoaded && !force) return
      if (!silent) set({ isLoading: true })
      const epoch = loadEpoch

      const request = fetchKnowledgeBases()
        .then((records) => {
          if (epoch !== loadEpoch) return
          hasLoaded = true
          applyRecords(records)
        })
        .finally(() => {
          if (activeLoadPromise === request) activeLoadPromise = null
          if (!silent) set({ isLoading: false })
          schedulePolling()
        })

      activeLoadPromise = request
      return request
    },

    async createKnowledgeBase(input) {
      set({ isCreating: true })
      try {
        const record = await createKnowledgeBase(input)
        loadEpoch += 1
        activeLoadPromise = null
        set((state) => ({ knowledgeBases: [record, ...state.knowledgeBases] }))
        schedulePolling()
        return record
      } finally {
        set({ isCreating: false })
      }
    },

    async updateKnowledgeBase(id, input) {
      set({ isCreating: true })
      try {
        const record = await updateKnowledgeBase(id, input)
        loadEpoch += 1
        activeLoadPromise = null
        get().replaceKnowledgeBase(record)
        return record
      } finally {
        set({ isCreating: false })
      }
    },

    async deleteKnowledgeBase(id) {
      await deleteKnowledgeBase(id)
      get().removeKnowledgeBaseLocally(id, true)
    },

    replaceKnowledgeBase(record) {
      set((state) => ({
        knowledgeBases: state.knowledgeBases.map((item) => item.id === record.id ? record : item)
      }))
      schedulePolling()
    },

    removeKnowledgeBaseLocally(id, affectsBindings = false) {
      set((state) => ({
        knowledgeBases: state.knowledgeBases.filter((item) => item.id !== id),
        selectedKnowledgeBaseId: state.selectedKnowledgeBaseId === id ? '' : state.selectedKnowledgeBaseId,
        conversationBindingsDirty: state.conversationBindingsDirty || affectsBindings
      }))
      schedulePolling()
    },

    markConversationBindingsDirty() {
      set({ conversationBindingsDirty: true })
    },

    clearConversationBindingsDirty() {
      set({ conversationBindingsDirty: false })
    },

    selectKnowledgeBase(id) {
      const target = get().knowledgeBases.find((item) => item.id === id)
      if (target?.processingStatus === 'completed') set({ selectedKnowledgeBaseId: id })
    },

    clearSelectedKnowledgeBase() {
      set({ selectedKnowledgeBaseId: '' })
    },

    clearPolling: clearPollTimer,

    reset() {
      clearPollTimer()
      activeLoadPromise = null
      hasLoaded = false
      loadEpoch += 1
      set({ knowledgeBases: [], selectedKnowledgeBaseId: '', isLoading: false, isCreating: false, conversationBindingsDirty: false })
    }
  }
})

import { create } from 'zustand'

import { fetchAvailableModels, fetchPreferredModel } from '../api/model-preference'
import { fetchAvailableSpeechStyles, fetchSpeechStyle } from '../api/user-preference'
import type { SpeechStyleInfo } from '../types/auth'
import type { ModelInfo } from '../types/chat'

type PreferencesState = {
  availableModels: ModelInfo[]
  selectedModelId: string
  isLoadingModels: boolean
  availableSpeechStyles: SpeechStyleInfo[]
  selectedSpeechStyleId: string
  isLoadingSpeechStyles: boolean
  setSelectedModelId: (id: string) => void
  setSelectedSpeechStyleId: (id: string) => void
  loadModelPreferences: (force?: boolean) => Promise<void>
  loadSpeechStylePreferences: (force?: boolean) => Promise<void>
  reset: () => void
}

let modelPromise: Promise<void> | null = null
let speechPromise: Promise<void> | null = null
let modelsLoaded = false
let speechStylesLoaded = false
let preferenceEpoch = 0

export const usePreferencesStore = create<PreferencesState>((set) => ({
  availableModels: [],
  selectedModelId: '',
  isLoadingModels: false,
  availableSpeechStyles: [],
  selectedSpeechStyleId: 'default',
  isLoadingSpeechStyles: false,

  setSelectedModelId(selectedModelId) {
    set({ selectedModelId })
  },

  setSelectedSpeechStyleId(selectedSpeechStyleId) {
    set({ selectedSpeechStyleId })
  },

  async loadModelPreferences(force = false) {
    if (modelPromise) return modelPromise
    if (modelsLoaded && !force) return
    set({ isLoadingModels: true })
    const epoch = preferenceEpoch
    const request = Promise.all([fetchAvailableModels(), fetchPreferredModel()])
      .then(([availableModels, preferred]) => {
        if (epoch !== preferenceEpoch) return
        modelsLoaded = true
        set({ availableModels, selectedModelId: preferred.id })
      })
      .finally(() => {
        if (modelPromise === request) modelPromise = null
        if (epoch === preferenceEpoch) set({ isLoadingModels: false })
      })
    modelPromise = request
    return request
  },

  async loadSpeechStylePreferences(force = false) {
    if (speechPromise) return speechPromise
    if (speechStylesLoaded && !force) return
    set({ isLoadingSpeechStyles: true })
    const epoch = preferenceEpoch
    const request = Promise.all([fetchAvailableSpeechStyles(), fetchSpeechStyle()])
      .then(([availableSpeechStyles, selected]) => {
        if (epoch !== preferenceEpoch) return
        speechStylesLoaded = true
        set({ availableSpeechStyles, selectedSpeechStyleId: selected.id })
      })
      .finally(() => {
        if (speechPromise === request) speechPromise = null
        if (epoch === preferenceEpoch) set({ isLoadingSpeechStyles: false })
      })
    speechPromise = request
    return request
  },

  reset() {
    modelPromise = null
    speechPromise = null
    modelsLoaded = false
    speechStylesLoaded = false
    preferenceEpoch += 1
    set({ availableModels: [], selectedModelId: '', isLoadingModels: false, availableSpeechStyles: [], selectedSpeechStyleId: 'default', isLoadingSpeechStyles: false })
  }
}))

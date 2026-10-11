import { create } from 'zustand'

import { deleteLibraryAsset, fetchLibraryAssets } from '../api/library-asset'
import type { LibraryAsset } from '../types/library-asset'

type LibraryAssetState = {
  assets: LibraryAsset[]
  isLoading: boolean
  loadAssets: (force?: boolean) => Promise<void>
  deleteAsset: (assetId: string) => Promise<void>
  reset: () => void
}

let activeLoadPromise: Promise<void> | null = null
let hasLoaded = false
let loadEpoch = 0

export const useLibraryAssetStore = create<LibraryAssetState>((set) => ({
  assets: [],
  isLoading: false,

  async loadAssets(force = false) {
    if (activeLoadPromise) return activeLoadPromise
    if (hasLoaded && !force) return

    set({ isLoading: true })
    const epoch = loadEpoch
    const request = fetchLibraryAssets()
      .then((assets) => {
        if (epoch !== loadEpoch) return
        hasLoaded = true
        set({ assets })
      })
      .finally(() => {
        if (activeLoadPromise === request) activeLoadPromise = null
        set({ isLoading: false })
      })

    activeLoadPromise = request
    return request
  },

  async deleteAsset(assetId) {
    await deleteLibraryAsset(assetId)
    set((state) => ({
      assets: state.assets.filter((asset) => asset.id !== assetId)
    }))
  },

  reset() {
    activeLoadPromise = null
    hasLoaded = false
    loadEpoch += 1
    set({ assets: [], isLoading: false })
  }
}))

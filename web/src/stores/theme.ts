import { create } from 'zustand'

export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedThemeMode = 'light' | 'dark'

const STORAGE_KEY = 'theme-mode'

function getStoredMode(): ThemeMode {
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system'
}

function resolveMode(mode: ThemeMode): ResolvedThemeMode {
  if (mode !== 'system') return mode
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(mode: ResolvedThemeMode) {
  const html = document.documentElement
  html.classList.toggle('dark', mode === 'dark')

  if (mode === 'dark') html.dataset.theme = 'dark'
  else delete html.dataset.theme
}

type ThemeState = {
  mode: ThemeMode
  resolvedMode: ResolvedThemeMode
  setMode: (mode: ThemeMode) => void
  cycle: () => void
}

const initialMode = getStoredMode()
const initialResolvedMode = resolveMode(initialMode)
applyTheme(initialResolvedMode)

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: initialMode,
  resolvedMode: initialResolvedMode,

  setMode(mode) {
    const resolvedMode = resolveMode(mode)
    localStorage.setItem(STORAGE_KEY, mode)
    applyTheme(resolvedMode)
    set({ mode, resolvedMode })
  },

  cycle() {
    const order: ThemeMode[] = ['system', 'light', 'dark']
    const currentIndex = order.indexOf(get().mode)
    get().setMode(order[(currentIndex + 1) % order.length])
  }
}))

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  const state = useThemeStore.getState()
  if (state.mode !== 'system') return

  const resolvedMode = resolveMode('system')
  applyTheme(resolvedMode)
  useThemeStore.setState({ resolvedMode })
})

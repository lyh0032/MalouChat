import { create } from 'zustand'

import {
  fetchMe,
  login,
  loginAsGuest as loginAsGuestRequest,
  logoutSession,
  register
} from '../api/auth'
import type { LoginInput, RegisterInput, User } from '../types/auth'
import { clearStoredToken, getStoredToken, setStoredToken } from '../utils/token'
import { getStoredGuestIdentity, setStoredGuestIdentity } from '../utils/guest-identity'
import { updateUserLanguage } from '../api/user'
import { getUiLanguage, normalizeLanguage, setUiLanguage, t, type UiLanguage } from '../i18n'
import { toast } from '../utils/toast'
import { resetUserScopedStores } from './reset'

type AuthState = {
  token: string
  user: User | null
  isRestoring: boolean
  hasRestored: boolean
  login: (input: LoginInput) => Promise<void>
  loginAsGuest: () => Promise<void>
  register: (input: RegisterInput) => Promise<void>
  restoreSession: () => Promise<void>
  logout: () => void
  setSpeechStyle: (speechStyle: string) => void
  isSavingLanguage: boolean
  setLanguage: (language: UiLanguage) => Promise<void>
}

let authEpoch = 0
let restorePromise: Promise<void> | null = null

export const useAuthStore = create<AuthState>((set, get) => ({
  isSavingLanguage: false,
  token: getStoredToken(),
  user: null,
  isRestoring: false,
  hasRestored: false,

  async login(input) {
    const data = await login(input)
    authEpoch += 1
    setUiLanguage(normalizeLanguage(data.user.language))
    setStoredToken(data.token)
    set({ token: data.token, user: data.user, isSavingLanguage: false, hasRestored: true })
  },

  async loginAsGuest() {
    const storedIdentity = getStoredGuestIdentity()
    const data = await loginAsGuestRequest(storedIdentity?.guestKey)
    setStoredGuestIdentity({ username: data.user.username, guestKey: data.guestKey })
    authEpoch += 1
    setUiLanguage(normalizeLanguage(data.user.language))
    setStoredToken(data.token)
    set({ token: data.token, user: data.user, isSavingLanguage: false, hasRestored: true })
  },

  async register(input) {
    const data = await register(input)
    authEpoch += 1
    setUiLanguage(normalizeLanguage(data.user.language))
    setStoredToken(data.token)
    set({ token: data.token, user: data.user, isSavingLanguage: false, hasRestored: true })
  },

  async restoreSession() {
    if (get().hasRestored) return
    if (restorePromise) return restorePromise

    restorePromise = (async () => {
      const storedToken = getStoredToken()

      if (!storedToken) {
        set({ token: '', user: null, hasRestored: true })
        return
      }

      set({ token: storedToken, isRestoring: true })

      try {
        const user = await fetchMe()
        authEpoch += 1
        setUiLanguage(normalizeLanguage(user.language))
        set({ user, isSavingLanguage: false, hasRestored: true })
      } catch {
        clearStoredToken()
        set({ token: '', user: null, hasRestored: true })
      } finally {
        set({ isRestoring: false })
      }
    })().finally(() => {
      restorePromise = null
    })

    return restorePromise
  },

  logout() {
    authEpoch += 1
    set({ isSavingLanguage: false })
    clearStoredToken()
    resetUserScopedStores()
    set({ token: '', user: null, hasRestored: true })
    void logoutSession().catch(() => undefined)
  },

  async setLanguage(language) {
    if (get().isSavingLanguage) return
    const user = get().user
    if (!user) {
      setUiLanguage(language)
      return
    }
    const previous = getUiLanguage()
    const epoch = authEpoch
    set({ isSavingLanguage: true })
    setUiLanguage(language)
    try {
      const saved = await updateUserLanguage(language)
      if (epoch !== authEpoch || get().user?.id !== user.id) return
      set({ user: { ...get().user!, language: normalizeLanguage(saved.language) } })
      setUiLanguage(normalizeLanguage(saved.language))
    } catch {
      if (epoch !== authEpoch || get().user?.id !== user.id) return
      setUiLanguage(previous)
      toast.error(t('settings.languageSaveFailed'))
    } finally {
      if (epoch === authEpoch) set({ isSavingLanguage: false })
    }
  },

  setSpeechStyle(speechStyle) {
    const user = get().user
    if (!user) return
    set({ user: { ...user, speechStyle } })
  }
}))

export function selectIsAuthenticated(state: AuthState) {
  return Boolean(state.token && state.user)
}

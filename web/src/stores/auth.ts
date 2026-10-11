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
}

let restorePromise: Promise<void> | null = null

export const useAuthStore = create<AuthState>((set, get) => ({
  token: getStoredToken(),
  user: null,
  isRestoring: false,
  hasRestored: false,

  async login(input) {
    const data = await login(input)
    setStoredToken(data.token)
    set({ token: data.token, user: data.user, hasRestored: true })
  },

  async loginAsGuest() {
    const storedIdentity = getStoredGuestIdentity()
    const data = await loginAsGuestRequest(storedIdentity?.guestKey)
    setStoredGuestIdentity({ username: data.user.username, guestKey: data.guestKey })
    setStoredToken(data.token)
    set({ token: data.token, user: data.user, hasRestored: true })
  },

  async register(input) {
    const data = await register(input)
    setStoredToken(data.token)
    set({ token: data.token, user: data.user, hasRestored: true })
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
        set({ user, hasRestored: true })
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
    clearStoredToken()
    resetUserScopedStores()
    set({ token: '', user: null, hasRestored: true })
    void logoutSession().catch(() => undefined)
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

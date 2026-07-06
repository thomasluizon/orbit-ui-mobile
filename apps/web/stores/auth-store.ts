import { create } from 'zustand'
import type { User, LoginResponse } from '@orbit/shared/types/auth'
import { useOnboardingDraftStore } from './onboarding-draft-store'

const EXPIRY_CHECK_INTERVAL = 60 * 1000

interface AuthState {
  isAuthenticated: boolean
  user: User | null
  expiresAt: number | null

  setAuth: (loginResponse: LoginResponse) => void
  checkSession: () => Promise<void>
  startExpiryMonitor: () => () => void
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: false,
  user: null,
  expiresAt: null,

  setAuth: (loginResponse: LoginResponse) => {
    set({
      isAuthenticated: true,
      user: {
        userId: loginResponse.userId,
        name: loginResponse.name,
        email: loginResponse.email,
      },
    })
  },

  checkSession: async () => {
    let response: Response
    try {
      response = await fetch('/api/auth/session')
    } catch {
      return
    }

    if (response.status === 401 || response.status === 403) {
      set({ isAuthenticated: false, user: null, expiresAt: null })
      return
    }

    if (!response.ok) {
      return
    }

    const data = (await response.json()) as { expiresAt: number | null }
    if (data.expiresAt) {
      set({ isAuthenticated: true, expiresAt: data.expiresAt })
    } else {
      set({ isAuthenticated: false, user: null, expiresAt: null })
    }
  },

  startExpiryMonitor: () => {
    get().checkSession()

    const intervalId = setInterval(() => {
      const { isAuthenticated } = get()
      if (!isAuthenticated) {
        return
      }

      void get().checkSession()
    }, EXPIRY_CHECK_INTERVAL)

    return () => clearInterval(intervalId)
  },

  logout: async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {
    }

    set({ isAuthenticated: false, user: null, expiresAt: null })
    useOnboardingDraftStore.getState().reset()

    if (typeof globalThis !== 'undefined' && typeof globalThis.location !== 'undefined') {
      globalThis.location.href = '/login'
    }
  },
}))

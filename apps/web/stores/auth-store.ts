import { create } from 'zustand'
import type { User, LoginResponse } from '@orbit/shared/types/auth'
import { useOnboardingDraftStore } from './onboarding-draft-store'

const EXPIRY_CHECK_INTERVAL = 60 * 1000

interface AuthState {
  isAuthenticated: boolean
  user: User | null
  expiresAt: number | null
  sessionRefreshFailed: boolean

  setAuth: (loginResponse: LoginResponse) => void
  markSessionRefreshFailed: () => void
  checkSession: () => Promise<void>
  startExpiryMonitor: () => () => void
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: false,
  user: null,
  expiresAt: null,
  sessionRefreshFailed: false,

  setAuth: (loginResponse: LoginResponse) => {
    set({
      isAuthenticated: true,
      user: {
        userId: loginResponse.userId,
        name: loginResponse.name,
        email: loginResponse.email,
      },
      sessionRefreshFailed: false,
    })
  },

  markSessionRefreshFailed: () => {
    set({
      isAuthenticated: false,
      user: null,
      expiresAt: null,
      sessionRefreshFailed: true,
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
      const session = (await response.json().catch(() => null)) as {
        refreshFailed?: boolean
      } | null
      set({
        isAuthenticated: false,
        user: null,
        expiresAt: null,
        sessionRefreshFailed: session?.refreshFailed === true,
      })
      return
    }

    if (!response.ok) {
      return
    }

    const data = (await response.json()) as {
      expiresAt: number | null
      refreshFailed?: boolean
    }
    if (data.expiresAt) {
      set({
        isAuthenticated: true,
        expiresAt: data.expiresAt,
        sessionRefreshFailed: false,
      })
    } else {
      set({
        isAuthenticated: false,
        user: null,
        expiresAt: null,
        sessionRefreshFailed: data.refreshFailed === true,
      })
    }
  },

  startExpiryMonitor: () => {
    void get().checkSession()

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

    set({
      isAuthenticated: false,
      user: null,
      expiresAt: null,
      sessionRefreshFailed: false,
    })
    useOnboardingDraftStore.getState().reset()

    if ('location' in globalThis) {
      globalThis.location.href = '/login'
    }
  },
}))

import { create } from 'zustand'
import type { User, LoginResponse } from '@orbit/shared/types/auth'

const EXPIRY_CHECK_INTERVAL = 60 * 1000 // 60 seconds
const EXPIRY_WARNING_THRESHOLD = 5 * 60 * 1000 // 5 minutes

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
    try {
      const response = await fetch('/api/auth/session')
      if (!response.ok) {
        set({ isAuthenticated: false, user: null, expiresAt: null })
        return
      }
      const data = (await response.json()) as { expiresAt: number | null }
      if (data.expiresAt) {
        set({ isAuthenticated: true, expiresAt: data.expiresAt })
      } else {
        set({ isAuthenticated: false, user: null, expiresAt: null })
      }
    } catch {
      // Network error -- keep current state, will retry next interval
    }
  },

  startExpiryMonitor: () => {
    // Initial check
    get().checkSession()

    const intervalId = setInterval(() => {
      const { expiresAt, isAuthenticated } = get()
      if (!isAuthenticated || !expiresAt) return

      const remaining = expiresAt - Date.now()

      if (remaining <= 0) {
        // Token expired -- auto-logout
        get().logout()
        return
      }

      if (remaining <= EXPIRY_WARNING_THRESHOLD) {
        // TODO: Show warning toast via sonner when toast system is wired up
        // "Your session expires in X minutes. Please save your work."
      }
    }, EXPIRY_CHECK_INTERVAL)

    // Return cleanup function
    return () => clearInterval(intervalId)
  },

  logout: async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // Best-effort: proceed with client-side cleanup regardless
    }

    set({ isAuthenticated: false, user: null, expiresAt: null })

    // Redirect to login (only in browser)
    if (typeof globalThis !== 'undefined' && typeof globalThis.location !== 'undefined') {
      globalThis.location.href = '/login'
    }
  },
}))

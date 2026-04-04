import { create } from 'zustand'
import { router } from 'expo-router'
import type { User } from '@orbit/shared/types/auth'
import {
  getToken,
  setToken,
  setRefreshToken,
  clearAllTokens,
  getRefreshToken,
} from '@/lib/secure-store'
import { apiClient } from '@/lib/api-client'
import type { RefreshResponse } from '@orbit/shared/types/auth'

interface AuthState {
  isAuthenticated: boolean
  user: User | null
  isLoading: boolean
  login: (token: string, refreshToken: string | null, user: User) => Promise<void>
  logout: () => Promise<void>
  checkAuth: () => Promise<boolean>
  initialize: () => Promise<void>
}

function decodeJwtExp(token: string): number | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    // atob is available in React Native's Hermes engine
    const decoded = JSON.parse(atob(payload))
    return typeof decoded.exp === 'number' ? decoded.exp : null
  } catch {
    return null
  }
}

function isTokenExpired(token: string): boolean {
  const exp = decodeJwtExp(token)
  if (exp === null) return true
  // Consider expired if less than 60 seconds remain
  return exp * 1000 < Date.now() + 60_000
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: false,
  user: null,
  isLoading: true,

  login: async (token, refreshToken, user) => {
    await setToken(token)
    if (refreshToken) {
      await setRefreshToken(refreshToken)
    }
    set({ isAuthenticated: true, user, isLoading: false })
  },

  logout: async () => {
    await clearAllTokens()
    set({ isAuthenticated: false, user: null, isLoading: false })
    router.replace('/login')
  },

  checkAuth: async () => {
    const token = await getToken()
    if (!token) return false

    if (isTokenExpired(token)) {
      // Attempt token refresh
      const refresh = await getRefreshToken()
      if (!refresh) {
        await clearAllTokens()
        return false
      }

      try {
        const res = await apiClient<RefreshResponse>('/api/auth/refresh', {
          method: 'POST',
          body: JSON.stringify({ refreshToken: refresh }),
        })
        await setToken(res.token)
        await setRefreshToken(res.refreshToken)
        return true
      } catch {
        await clearAllTokens()
        return false
      }
    }

    return true
  },

  initialize: async () => {
    set({ isLoading: true })
    try {
      const isValid = await get().checkAuth()
      if (isValid) {
        // Fetch current user profile
        const user = await apiClient<User>('/api/auth/me')
        set({ isAuthenticated: true, user, isLoading: false })
      } else {
        set({ isAuthenticated: false, user: null, isLoading: false })
      }
    } catch {
      set({ isAuthenticated: false, user: null, isLoading: false })
    }
  },
}))

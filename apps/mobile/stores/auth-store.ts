import { create } from 'zustand'
import { router } from 'expo-router'
import type { User } from '@orbit/shared/types/auth'
import type { Profile } from '@orbit/shared/types/profile'
import { API } from '@orbit/shared/api'
import { clearStoredAuthReturnUrl } from '@/lib/auth-flow'
import {
  getToken,
  setToken,
  setRefreshToken,
  clearAllTokens,
  getRefreshToken,
} from '@/lib/secure-store'
import { clearWidgetToken, saveWidgetToken } from '@/lib/orbit-widget'
import type { RefreshResponse } from '@orbit/shared/types/auth'
import { apiClient } from '@/lib/api-client'

interface AuthState {
  isAuthenticated: boolean
  user: User | null
  isLoading: boolean
  expiresAt: number | null
  login: (token: string, refreshToken: string | null, user: User) => Promise<void>
  logout: () => Promise<void>
  checkAuth: () => Promise<boolean>
  initialize: () => Promise<void>
}

interface JwtSessionPayload {
  exp?: number
  email?: string
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'?: string
  sub?: string
  nameid?: string
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier'?: string
}

function decodeJwtPayload(token: string): JwtSessionPayload | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    // atob is available in React Native's Hermes engine
    return JSON.parse(atob(payload)) as JwtSessionPayload
  } catch {
    return null
  }
}

function decodeJwtExp(token: string): number | null {
  const payload = decodeJwtPayload(token)
  return typeof payload?.exp === 'number' ? payload.exp : null
}

function getExpiresAt(token: string): number | null {
  const exp = decodeJwtExp(token)
  return exp === null ? null : exp * 1000
}

function getUserFromToken(token: string, name?: string): User | null {
  const payload = decodeJwtPayload(token)
  if (!payload) return null

  const userId =
    payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier']
    ?? payload.nameid
    ?? payload.sub
  const email =
    payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress']
    ?? payload.email

  if (!userId || !email) return null

  return {
    userId,
    email,
    name: name ?? email.split('@')[0] ?? 'User',
  }
}

function isTokenExpired(token: string): boolean {
  const expiresAt = getExpiresAt(token)
  if (expiresAt === null) return true
  // Consider expired if less than 60 seconds remain
  return expiresAt < Date.now() + 60_000
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: false,
  user: null,
  isLoading: true,
  expiresAt: null,

  login: async (token, refreshToken, user) => {
    await setToken(token)
    if (refreshToken) {
      await setRefreshToken(refreshToken)
    }
    await saveWidgetToken(token).catch(() => {})
    set({
      isAuthenticated: true,
      user,
      isLoading: false,
      expiresAt: getExpiresAt(token),
    })
  },

  logout: async () => {
    const refreshToken = await getRefreshToken()

    if (refreshToken) {
      try {
        await fetch(`${process.env.EXPO_PUBLIC_API_BASE ?? 'https://api.useorbit.org'}${API.auth.logout}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        })
      } catch {
        // Best-effort logout; always clear local session state.
      }
    }

    await clearStoredAuthReturnUrl()
    await clearAllTokens()
    await clearWidgetToken().catch(() => {})
    set({ isAuthenticated: false, user: null, isLoading: false, expiresAt: null })
    router.replace('/login')
  },

  checkAuth: async () => {
    let token = await getToken()
    if (!token) {
      await clearWidgetToken().catch(() => {})
      set({ isAuthenticated: false, user: null, expiresAt: null })
      return false
    }

    if (isTokenExpired(token)) {
      // Attempt token refresh
      const refresh = await getRefreshToken()
      if (!refresh) {
        await clearAllTokens()
        await clearWidgetToken().catch(() => {})
        set({ isAuthenticated: false, user: null, expiresAt: null })
        return false
      }

      try {
        const res = await apiClient<RefreshResponse>(API.auth.refresh, {
          method: 'POST',
          body: JSON.stringify({ refreshToken: refresh }),
        })
        await setToken(res.token)
        await setRefreshToken(res.refreshToken)
        await saveWidgetToken(res.token).catch(() => {})
        token = res.token
      } catch {
        await clearAllTokens()
        await clearWidgetToken().catch(() => {})
        set({ isAuthenticated: false, user: null, expiresAt: null })
        return false
      }
    }

    await saveWidgetToken(token).catch(() => {})
    set((state) => ({
      isAuthenticated: true,
      user: state.user ?? getUserFromToken(token),
      expiresAt: getExpiresAt(token),
    }))

    return true
  },

  initialize: async () => {
    set({ isLoading: true })
    try {
      const isValid = await get().checkAuth()
      if (isValid) {
        const token = await getToken()
        if (token) {
          await saveWidgetToken(token).catch(() => {})
        }
        const tokenUser = token ? getUserFromToken(token) : null

        try {
          const profile = await apiClient<Profile>(API.profile.get)
          const user = tokenUser
            ? { ...tokenUser, name: profile.name, email: profile.email }
            : null
          set({
            isAuthenticated: true,
            user,
            isLoading: false,
            expiresAt: token ? getExpiresAt(token) : null,
          })
        } catch {
          set({
            isAuthenticated: true,
            user: tokenUser,
            isLoading: false,
            expiresAt: token ? getExpiresAt(token) : null,
          })
        }
      } else {
        set({ isAuthenticated: false, user: null, isLoading: false, expiresAt: null })
      }
    } catch {
      set({ isAuthenticated: false, user: null, isLoading: false, expiresAt: null })
    }
  },
}))

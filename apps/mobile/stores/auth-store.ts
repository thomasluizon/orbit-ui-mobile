import { create } from 'zustand'
import { router } from 'expo-router'
import type { RefreshResponse, User } from '@orbit/shared/types/auth'
import type { Profile } from '@orbit/shared/types/profile'
import { API } from '@orbit/shared/api'
import { profileKeys } from '@orbit/shared/query'
import { clearStoredAuthReturnUrl } from '@/lib/auth-flow'
import {
  getToken,
  setToken,
  setRefreshToken,
  clearRefreshToken,
  clearAllTokens,
  getRefreshToken,
} from '@/lib/secure-store'
import { clearWidgetToken, saveWidgetToken } from '@/lib/orbit-widget'
import { apiClient } from '@/lib/api-client'
import { clearPersistedQueryCache, queryClient } from '@/lib/query-client'
import i18n from '@/lib/i18n'
import { setRuntimeTheme } from '@/lib/theme'
import { useChatStore } from './chat-store'
import { useReviewReminderStore } from './review-reminder-store'

const MOBILE_API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? 'https://api.useorbit.org'

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

export async function clearSessionAndResetAuth(): Promise<void> {
  await clearAllTokens()
  await clearWidgetToken().catch(() => {})
  queryClient.clear()
  await clearPersistedQueryCache()
  useChatStore.getState().clearMessages()
  useReviewReminderStore.getState().setAccountScope(null)
  useAuthStore.setState({ isAuthenticated: false, user: null, expiresAt: null })
}

export async function refreshSessionToken(options?: {
  clearOnFailure?: boolean
}): Promise<string | null> {
  const clearOnFailure = options?.clearOnFailure ?? true
  const refreshToken = await getRefreshToken()
  if (!refreshToken) {
    if (clearOnFailure) {
      await clearSessionAndResetAuth()
    }
    return null
  }

  try {
    const response = await fetch(`${MOBILE_API_BASE}${API.auth.refresh}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })

    if (!response.ok) {
      if (clearOnFailure) {
        await clearSessionAndResetAuth()
      }
      return null
    }

    const data = (await response.json()) as RefreshResponse
    await setToken(data.token)
    await setRefreshToken(data.refreshToken)
    await saveWidgetToken(data.token).catch(() => {})

    const currentUser = useAuthStore.getState().user
    const tokenUser = getUserFromToken(data.token, currentUser?.name)
    useAuthStore.setState({
      isAuthenticated: true,
      user: currentUser ?? tokenUser,
      expiresAt: getExpiresAt(data.token),
    })

    return data.token
  } catch {
    if (clearOnFailure) {
      await clearSessionAndResetAuth()
    }
    return null
  }
}

async function loadProfileOrResetSession(tokenUser: User | null): Promise<User | null> {
  try {
    const profile = await apiClient<Profile>(API.profile.get)
    queryClient.setQueryData(profileKeys.detail(), profile)
    return tokenUser
      ? { ...tokenUser, name: profile.name, email: profile.email }
      : null
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      await clearSessionAndResetAuth()
      return null
    }

    return tokenUser
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: false,
  user: null,
  isLoading: true,
  expiresAt: null,

  login: async (token, refreshToken, user) => {
    queryClient.clear()
    await clearPersistedQueryCache()
    useChatStore.getState().clearMessages()
    useReviewReminderStore.getState().setAccountScope(user.userId)
    await clearRefreshToken()
    await setToken(token)
    if (refreshToken) {
      await setRefreshToken(refreshToken)
    }
    await saveWidgetToken(token).catch(() => {})
    let hydratedUser = user

    try {
      const profile = await apiClient<Profile>(API.profile.get)
      queryClient.setQueryData(profileKeys.detail(), profile)

      if (profile.language && i18n.language !== profile.language) {
        void i18n.changeLanguage(profile.language)
      }

      setRuntimeTheme({
        scheme: (profile.colorScheme as Parameters<typeof setRuntimeTheme>[0]['scheme']) ?? 'purple',
        themeMode:
          profile.themePreference === 'light' || profile.themePreference === 'dark'
            ? profile.themePreference
            : undefined,
      })

      hydratedUser = {
        ...user,
        name: profile.name,
        email: profile.email,
      }
    } catch {
      // Theme/profile hydration is best-effort during login.
    }

    set({
      isAuthenticated: true,
      user: hydratedUser,
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
    queryClient.clear()
    await clearPersistedQueryCache()
    useChatStore.getState().clearMessages()
    useReviewReminderStore.getState().setAccountScope(null)
    set({ isAuthenticated: false, user: null, isLoading: false, expiresAt: null })
    router.replace('/login')
  },

  checkAuth: async () => {
    let token = await getToken()
    if (!token) {
      await clearWidgetToken().catch(() => {})
      useReviewReminderStore.getState().setAccountScope(null)
      set({ isAuthenticated: false, user: null, expiresAt: null })
      return false
    }

    if (isTokenExpired(token)) {
      token = await refreshSessionToken()
      if (!token) {
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
      const user = await loadProfileOrResetSession(tokenUser)
        if (!user && !(await getToken())) {
          set({ isAuthenticated: false, user: null, isLoading: false, expiresAt: null })
          return
        }

      set({
        isAuthenticated: true,
        user,
        isLoading: false,
        expiresAt: token ? getExpiresAt(token) : null,
      })
      useReviewReminderStore.getState().setAccountScope(user?.userId ?? null)
    } else {
      set({ isAuthenticated: false, user: null, isLoading: false, expiresAt: null })
    }
    } catch {
      set({ isAuthenticated: false, user: null, isLoading: false, expiresAt: null })
    }
  },
}))

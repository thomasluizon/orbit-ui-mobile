import { create } from 'zustand'
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
import { cancelPersistentReminder } from '@/lib/persistent-reminder'
import { apiClient } from '@/lib/api-client'
import * as offlineQueue from '@/lib/offline-queue'
import { cancelScheduledFlush } from '@/lib/offline-mutations'
import { clearOfflineState } from '@/lib/offline-state'
import { clearPersistedQueryCache, queryClient, setQueryCacheScope } from '@/lib/query-client'
import { i18n } from '@/lib/i18n'
import { setRuntimeTheme } from '@/lib/theme'
import { useChatStore } from './chat-store'
import { useReviewReminderStore } from './review-reminder-store'
import { useOnboardingDraftStore } from './onboarding-draft-store'

const MOBILE_API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? 'https://api.useorbit.org'

let authTransitionInFlight = false

let profileHydrationInFlight: Promise<void> | null = null

/**
 * True while login() is swapping the session — between persisting the new token
 * and committing isAuthenticated:true. apiClient consults this to avoid tearing
 * down the session on a transient 401 fired in that window (the freshly written
 * SecureStore token isn't yet readable by an in-flight authed GET).
 */
export function isAuthTransitionInFlight(): boolean {
  return authTransitionInFlight
}

/**
 * Resolves once the background profile hydration started by initialize() has
 * settled (name/theme/language applied, or session cleared on Unauthorized).
 * initialize() returns before this completes so first paint isn't blocked on
 * the profile network call; callers that need a settled session can await this.
 */
export function whenProfileHydrated(): Promise<void> {
  return profileHydrationInFlight ?? Promise.resolve()
}

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
    return JSON.parse(atob(payload)) as JwtSessionPayload
  } catch {
    return null
  }
}

function getExpiresAtFromPayload(payload: JwtSessionPayload | null): number | null {
  return typeof payload?.exp === 'number' ? payload.exp * 1000 : null
}

function getUserFromPayload(payload: JwtSessionPayload | null, name?: string): User | null {
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

function getExpiresAt(token: string): number | null {
  return getExpiresAtFromPayload(decodeJwtPayload(token))
}

function getUserFromToken(token: string, name?: string): User | null {
  return getUserFromPayload(decodeJwtPayload(token), name)
}

function isTokenExpired(token: string): boolean {
  const expiresAt = getExpiresAt(token)
  if (expiresAt === null) return true
  return expiresAt < Date.now() + 60_000
}

export async function clearSessionAndResetAuth(): Promise<void> {
  await clearAllTokens()
  await clearWidgetToken().catch(() => {})
  queryClient.clear()
  await clearPersistedQueryCache()
  await setQueryCacheScope(null)
  cancelScheduledFlush()
  await offlineQueue.clear()
  await clearOfflineState()
  useChatStore.getState().clearMessages()
  useReviewReminderStore.getState().setAccountScope(null)
  useOnboardingDraftStore.getState().reset()
  useAuthStore.setState({ isAuthenticated: false, user: null, expiresAt: null })
}

/**
 * Outcome of a token rotation attempt. `network-error` is a transient blip that
 * leaves the session intact (callers must not log the user out); `unauthorized`
 * is a real auth failure where the session is cleared when `clearOnFailure`.
 */
export type RefreshSessionOutcome =
  | { status: 'refreshed'; token: string }
  | { status: 'unauthorized' }
  | { status: 'network-error' }

function isTransientNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true
  if (!(error instanceof Error)) return false

  const message = error.message.toLowerCase()
  return (
    message.includes('network request failed') ||
    message.includes('network error') ||
    message.includes('failed to fetch') ||
    message.includes('fetch failed') ||
    message.includes('load failed') ||
    message.includes('timed out')
  )
}

/**
 * Rotates the access token using the stored refresh token. Uses raw fetch, not
 * apiClient: apiClient's own 401 handler calls this function, so routing it back
 * through apiClient would invert the dependency and lose the clearOnFailure
 * contract (apiClient throws + clears unconditionally; this returns a discriminated
 * outcome and honours clearOnFailure). A transient network failure preserves the
 * session; a real auth rejection clears it when clearOnFailure.
 */
export async function refreshSession(options?: {
  clearOnFailure?: boolean
}): Promise<RefreshSessionOutcome> {
  const clearOnFailure = options?.clearOnFailure ?? true
  const refreshToken = await getRefreshToken()
  if (!refreshToken) {
    if (clearOnFailure) {
      await clearSessionAndResetAuth()
    }
    return { status: 'unauthorized' }
  }

  let response: Response
  try {
    response = await fetch(`${MOBILE_API_BASE}${API.auth.refresh}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
  } catch (error: unknown) {
    if (!isTransientNetworkError(error)) {
      if (clearOnFailure) {
        await clearSessionAndResetAuth()
      }
      return { status: 'unauthorized' }
    }
    return { status: 'network-error' }
  }

  if (!response.ok) {
    if (clearOnFailure) {
      await clearSessionAndResetAuth()
    }
    return { status: 'unauthorized' }
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

  return { status: 'refreshed', token: data.token }
}

/**
 * Backwards-compatible wrapper returning the rotated access token, or null when
 * the rotation did not yield a token (transient or unauthorized).
 */
export async function refreshSessionToken(options?: {
  clearOnFailure?: boolean
}): Promise<string | null> {
  const outcome = await refreshSession(options)
  return outcome.status === 'refreshed' ? outcome.token : null
}

function applyProfilePresentation(profile: Profile): void {
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
}

async function hydrateSessionProfile(): Promise<void> {
  try {
    const profile = await apiClient<Profile>(API.profile.get)
    queryClient.setQueryData(profileKeys.detail(), profile)
    applyProfilePresentation(profile)

    const currentUser = useAuthStore.getState().user
    if (currentUser) {
      useAuthStore.setState({
        user: { ...currentUser, name: profile.name, email: profile.email },
      })
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      await clearSessionAndResetAuth()
    }
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: false,
  user: null,
  isLoading: true,
  expiresAt: null,

  login: async (token, refreshToken, user) => {
    authTransitionInFlight = true
    try {
      await setToken(token)
      if (refreshToken) {
        await setRefreshToken(refreshToken)
      } else {
        await clearRefreshToken()
      }
      await saveWidgetToken(token).catch(() => {})
      queryClient.clear()
      await clearPersistedQueryCache()
      await setQueryCacheScope(user.userId)
      cancelScheduledFlush()
      await offlineQueue.clear()
      await clearOfflineState()
      useChatStore.getState().clearMessages()
      useReviewReminderStore.getState().setAccountScope(user.userId)
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
      } catch {}

      set({
        isAuthenticated: true,
        user: hydratedUser,
        isLoading: false,
        expiresAt: getExpiresAt(token),
      })
    } finally {
      authTransitionInFlight = false
    }
  },

  logout: async () => {
    const refreshToken = await getRefreshToken()

    await import('@/hooks/use-push-notifications')
      .then((module) => module.unsubscribePushToken())
      .catch(() => {})

    if (refreshToken) {
      await apiClient(API.auth.logout, {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      }).catch(() => {})
    }

    set({ isAuthenticated: false, user: null, isLoading: false, expiresAt: null })
    await clearStoredAuthReturnUrl()
    await clearAllTokens()
    await clearWidgetToken().catch(() => {})
    await cancelPersistentReminder().catch(() => {})
    queryClient.clear()
    await clearPersistedQueryCache()
    await setQueryCacheScope(null)
    cancelScheduledFlush()
    await offlineQueue.clear()
    await clearOfflineState()
    useChatStore.getState().clearMessages()
    useReviewReminderStore.getState().setAccountScope(null)
    useOnboardingDraftStore.getState().reset()
  },

  checkAuth: async () => {
    let token = await getToken()
    if (!token) {
      await clearWidgetToken().catch(() => {})
      await cancelPersistentReminder().catch(() => {})
      useReviewReminderStore.getState().setAccountScope(null)
      set({ isAuthenticated: false, user: null, expiresAt: null })
      return false
    }

    if (isTokenExpired(token)) {
      const outcome = await refreshSession()
      if (outcome.status === 'network-error') {
        const payload = decodeJwtPayload(token)
        set((state) => ({
          isAuthenticated: true,
          user: state.user ?? getUserFromPayload(payload),
          expiresAt: getExpiresAtFromPayload(payload),
        }))
        await setQueryCacheScope(get().user?.userId ?? null)
        return true
      }
      if (outcome.status !== 'refreshed') {
        return false
      }
      token = outcome.token
    }

    const payload = decodeJwtPayload(token)
    await saveWidgetToken(token).catch(() => {})
    set((state) => ({
      isAuthenticated: true,
      user: state.user ?? getUserFromPayload(payload),
      expiresAt: getExpiresAtFromPayload(payload),
    }))
    await setQueryCacheScope(get().user?.userId ?? null)

    return true
  },

  initialize: async () => {
    set({ isLoading: true })
    try {
      const isValid = await get().checkAuth()
      if (!isValid) {
        set({ isAuthenticated: false, user: null, isLoading: false, expiresAt: null })
        return
      }

      set({ isLoading: false })
      useReviewReminderStore.getState().setAccountScope(get().user?.userId ?? null)

      profileHydrationInFlight = (async () => {
        await hydrateSessionProfile()
        useReviewReminderStore.getState().setAccountScope(get().user?.userId ?? null)
      })()
      void profileHydrationInFlight
    } catch {
      set({ isAuthenticated: false, user: null, isLoading: false, expiresAt: null })
    }
  },
}))

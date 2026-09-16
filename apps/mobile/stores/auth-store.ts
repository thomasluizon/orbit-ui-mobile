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
import { cancelScheduledFlush, resumeOfflineReplay } from '@/lib/offline-mutations'
import { clearOfflineState } from '@/lib/offline-state'
import { clearPersistedQueryCache, queryClient, setQueryCacheScope } from '@/lib/query-client'
import { i18n } from '@/lib/i18n'
import {
  decodeJwtPayload,
  getAccountIdFromPayload,
  type JwtSessionPayload,
} from '@/lib/jwt-session'
import { setRuntimeTheme } from '@/lib/theme'
import { bindStepUpStateToAccount, clearStepUpState } from '@/lib/step-up-storage'
import { useChatStore } from './chat-store'
import { useReviewReminderStore } from './review-reminder-store'
import { useOnboardingDraftStore } from './onboarding-draft-store'
import { useThrottleStore } from './throttle-store'

const MOBILE_API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? 'https://api.useorbit.org'

let authTransitionInFlight = false
let sessionGeneration = 0
let credentialMutationTail = Promise.resolve()

let profileHydrationInFlight: Promise<void> | null = null
let refreshSessionInFlight: Promise<RefreshSessionAttempt> | null = null

/**
 * True while login() is swapping the session — between persisting the new token
 * and committing isAuthenticated:true. apiClient consults this to avoid tearing
 * down the session on a transient 401 fired in that window (the freshly written
 * SecureStore token isn't yet readable by an in-flight authed GET).
 */
export function isAuthTransitionInFlight(): boolean {
  return authTransitionInFlight
}

export function getSessionGeneration(): number {
  return sessionGeneration
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

function getExpiresAtFromPayload(payload: JwtSessionPayload | null): number | null {
  return typeof payload?.exp === 'number' ? payload.exp * 1000 : null
}

function getUserFromPayload(payload: JwtSessionPayload | null, name?: string): User | null {
  if (!payload) return null

  const userId = getAccountIdFromPayload(payload)
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

function isCurrentSessionGeneration(generation: number): boolean {
  return sessionGeneration === generation
}

async function withCredentialMutationLock<T>(mutation: () => Promise<T>): Promise<T> {
  const previousMutation = credentialMutationTail
  let releaseMutation!: () => void
  credentialMutationTail = new Promise<void>((resolve) => {
    releaseMutation = resolve
  })

  await previousMutation
  try {
    return await mutation()
  } finally {
    releaseMutation()
  }
}

type SessionTeardownResult = {
  generation: number
  refreshToken: string | null
}

async function clearSessionCredentials(
  expectedGeneration: number | null,
  captureRefreshToken: boolean,
): Promise<SessionTeardownResult | null> {
  return withCredentialMutationLock(async () => {
    const generation = expectedGeneration ?? sessionGeneration
    if (!isCurrentSessionGeneration(generation)) return null
    const refreshToken = captureRefreshToken ? await getRefreshToken() : null
    clearStepUpState()
    sessionGeneration += 1
    await clearAllTokens()
    await clearWidgetToken().catch(() => {})
    return { generation: sessionGeneration, refreshToken }
  })
}

async function runSessionTeardownStep(
  generation: number,
  step: () => void | Promise<void>,
): Promise<boolean> {
  if (!isCurrentSessionGeneration(generation)) return false
  await step()
  return isCurrentSessionGeneration(generation)
}

async function runSessionTeardown(
  expectedGeneration: number | null,
  captureRefreshToken: boolean,
  publishSignedOutImmediately: boolean,
): Promise<SessionTeardownResult | null> {
  const teardown = await clearSessionCredentials(expectedGeneration, captureRefreshToken)
  if (!teardown) return null
  const { generation } = teardown
  if (publishSignedOutImmediately) {
    useAuthStore.setState({
      isAuthenticated: false,
      user: null,
      isLoading: false,
      expiresAt: null,
    })
  }

  if (!(await runSessionTeardownStep(generation, () => cancelPersistentReminder().catch(() => {})))) return null

  queryClient.clear()
  if (!(await runSessionTeardownStep(generation, clearPersistedQueryCache))) return null
  if (!(await runSessionTeardownStep(generation, () => setQueryCacheScope(null)))) return null

  cancelScheduledFlush()
  if (!(await runSessionTeardownStep(generation, clearOfflineState))) return null

  useChatStore.getState().clearMessages()
  useReviewReminderStore.getState().setAccountScope(null)
  resetOnboardingDraftForSignOut()
  if (!publishSignedOutImmediately) {
    useAuthStore.setState({
      isAuthenticated: false,
      user: null,
      isLoading: false,
      expiresAt: null,
    })
  }
  return teardown
}

export async function clearSessionAndResetAuth(generation: number): Promise<void> {
  await runSessionTeardown(generation, false, false)
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

type RefreshSessionAttempt = {
  generation: number
  outcome: RefreshSessionOutcome
}

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

function resetOnboardingDraftForSignOut(): void {
  const onboardingLocallyDone = useOnboardingDraftStore.getState().onboardingLocallyDone
  useOnboardingDraftStore.getState().reset()
  if (onboardingLocallyDone) {
    useOnboardingDraftStore.getState().markOnboardingLocallyDone()
  }
}

/**
 * Rotates the access token using the stored refresh token. Uses raw fetch, not
 * apiClient: apiClient's own 401 handler calls this function, so routing it back
 * through apiClient would invert the dependency and lose the clearOnFailure
 * contract (apiClient throws + clears unconditionally; this returns a discriminated
 * outcome. A transient network failure preserves the session and a real auth
 * rejection is reported to the coordinated caller.
 */
async function rotateSessionToken(generation: number): Promise<RefreshSessionOutcome> {
  const refreshToken = await getRefreshToken()
  if (!refreshToken) {
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
      return { status: 'unauthorized' }
    }
    return { status: 'network-error' }
  }

  if (!response.ok) {
    if (response.status === 429) {
      useThrottleStore.getState().show(response.status, await response.json().catch(() => null))
    }
    return { status: response.status === 401 ? 'unauthorized' : 'network-error' }
  }

  const data = (await response.json()) as RefreshResponse
  const currentUser = useAuthStore.getState().user
  const tokenUser = getUserFromToken(data.token, currentUser?.name)
  const published = await withCredentialMutationLock(async () => {
    if (!isCurrentSessionGeneration(generation)) return false
    await setToken(data.token)
    await setRefreshToken(data.refreshToken)
    await saveWidgetToken(data.token).catch(() => {})
    if (tokenUser) bindStepUpStateToAccount(tokenUser.userId)
    sessionGeneration += 1
    useAuthStore.setState({
      isAuthenticated: true,
      user: currentUser ?? tokenUser,
      expiresAt: getExpiresAt(data.token),
    })
    return true
  })
  if (!published) return { status: 'unauthorized' }
  resumeOfflineReplay()

  return { status: 'refreshed', token: data.token }
}

async function runRefreshSession(): Promise<RefreshSessionAttempt> {
  const generation = sessionGeneration
  try {
    return {
      generation,
      outcome: await rotateSessionToken(generation),
    }
  } finally {
    refreshSessionInFlight = null
  }
}

export async function refreshSession(options?: {
  clearOnFailure?: boolean
}): Promise<RefreshSessionOutcome> {
  const clearOnFailure = options?.clearOnFailure ?? true
  const attempt = await (refreshSessionInFlight ??= runRefreshSession())

  if (attempt.outcome.status === 'unauthorized' && clearOnFailure) {
    await clearSessionAndResetAuth(attempt.generation)
  }

  return attempt.outcome
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
  const generation = sessionGeneration
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
      await clearSessionAndResetAuth(generation)
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
      const generation = await withCredentialMutationLock(async () => {
        await setToken(token)
        if (refreshToken) {
          await setRefreshToken(refreshToken)
        } else {
          await clearRefreshToken()
        }
        await saveWidgetToken(token).catch(() => {})
        bindStepUpStateToAccount(user.userId)
        sessionGeneration += 1
        set({
          isAuthenticated: true,
          user,
          isLoading: false,
          expiresAt: getExpiresAt(token),
        })
        return sessionGeneration
      })
      if (!isCurrentSessionGeneration(generation)) return
      queryClient.clear()
      await clearPersistedQueryCache()
      if (!isCurrentSessionGeneration(generation)) return
      await setQueryCacheScope(user.userId)
      if (!isCurrentSessionGeneration(generation)) return
      cancelScheduledFlush()
      offlineQueue.retainAccount(user.userId)
      await clearOfflineState()
      if (!isCurrentSessionGeneration(generation)) return
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

      if (!isCurrentSessionGeneration(generation)) return
      bindStepUpStateToAccount(user.userId)
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
    await import('@/hooks/use-push-notifications')
      .then((module) => module.unsubscribePushToken())
      .catch(() => {})

    const teardown = await runSessionTeardown(null, true, true)
    const refreshToken = teardown?.refreshToken ?? null
    if (refreshToken) {
      await apiClient(API.auth.logout, {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      }).catch(() => {})
    }

    await clearStoredAuthReturnUrl()
    offlineQueue.clear()
  },

  checkAuth: async () => {
    let generation = sessionGeneration
    let token = await getToken()
    if (!isCurrentSessionGeneration(generation)) return false
    if (!token) {
      await clearSessionAndResetAuth(generation)
      return false
    }

    if (isTokenExpired(token)) {
      const outcome = await refreshSession()
      if (outcome.status === 'unauthorized') return false
      if (outcome.status === 'refreshed') {
        token = outcome.token
        generation = sessionGeneration
      }
    }

    const payload = decodeJwtPayload(token)
    const accountId = getAccountIdFromPayload(payload)
    const restored = await withCredentialMutationLock(async () => {
      if (!isCurrentSessionGeneration(generation)) return false
      await saveWidgetToken(token).catch(() => {})
      if (accountId) bindStepUpStateToAccount(accountId)
      set((state) => ({
        isAuthenticated: true,
        user: state.user ?? getUserFromPayload(payload),
        expiresAt: getExpiresAtFromPayload(payload),
      }))
      return true
    })
    if (!restored) return false
    await setQueryCacheScope(get().user?.userId ?? null)

    return isCurrentSessionGeneration(generation)
  },

  initialize: async () => {
    const generation = sessionGeneration
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
      await clearSessionAndResetAuth(generation)
    }
  },
}))

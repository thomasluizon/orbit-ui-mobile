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
import { setRuntimeTheme } from '@/lib/theme'
import { useChatStore } from './chat-store'
import { useReviewReminderStore } from './review-reminder-store'
import { useOnboardingDraftStore } from './onboarding-draft-store'

const MOBILE_API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? 'https://api.useorbit.org'

let sessionEpoch = 0
let credentialVersion = 0
let credentialMutationTail = Promise.resolve()

let profileHydrationInFlight: Promise<void> | null = null
let refreshSessionInFlight: Promise<RefreshSessionAttempt> | null = null

type SessionSnapshot = {
  epoch: number
  credentialVersion: number
}

type SessionOwnerAuthority = {
  authority: 'session-owner'
  epoch: number
}

export type ObservedCredentialAuthority = {
  authority: 'observed-credential'
  epoch: number
  credentialVersion: number
}

type SessionTeardownAuthority = SessionOwnerAuthority | ObservedCredentialAuthority

/**
 * True while a session owner is preparing account state before the protected
 * tree can mount. apiClient consults this to avoid tearing down the session on
 * a transient 401 fired while new SecureStore credentials are settling.
 */
export function isAuthTransitionInFlight(): boolean {
  return useAuthStore.getState().sessionPhase === 'establishing'
}

export function getSessionGeneration(): SessionSnapshot {
  return { epoch: sessionEpoch, credentialVersion }
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

export type SessionPhase = 'signed-out' | 'establishing' | 'signed-in'

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

function getAccountIdFromPayload(payload: JwtSessionPayload | null): string | null {
  return payload?.['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier']
    ?? payload?.nameid
    ?? payload?.sub
    ?? null
}

interface AuthState {
  sessionPhase: SessionPhase
  isAuthenticated: boolean
  user: User | null
  isLoading: boolean
  expiresAt: number | null
  login: (token: string, refreshToken: string | null, user: User) => Promise<(() => boolean) | null>
  logout: () => Promise<boolean>
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

function isCurrentSessionEpoch(epoch: number): boolean {
  return sessionEpoch === epoch
}

function isCurrentCredentialObservation(observation: SessionSnapshot): boolean {
  return isCurrentSessionEpoch(observation.epoch)
    && credentialVersion === observation.credentialVersion
}

function isCurrentSessionTeardown(epoch: number): boolean {
  return isCurrentSessionEpoch(epoch) && useAuthStore.getState().sessionPhase === 'signed-out'
}

function deriveSessionPhase(sessionPhase: SessionPhase) {
  return {
    sessionPhase,
    isAuthenticated: sessionPhase === 'signed-in',
  }
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
  epoch: number
  refreshToken: string | null
}

async function clearSessionCredentials(
  authority: SessionTeardownAuthority,
  captureRefreshToken: boolean,
): Promise<SessionTeardownResult | null> {
  return withCredentialMutationLock(async () => {
    if (authority.authority === 'session-owner') {
      if (!isCurrentSessionEpoch(authority.epoch)) return null
    } else if (!isCurrentCredentialObservation(authority)) {
      return null
    }
    const refreshToken = captureRefreshToken ? await getRefreshToken() : null
    sessionEpoch += 1
    credentialVersion += 1
    useAuthStore.setState({
      ...deriveSessionPhase('signed-out'),
      isLoading: false,
      expiresAt: null,
    })
    await clearAllTokens()
    await clearWidgetToken().catch(() => {})
    return { epoch: sessionEpoch, refreshToken }
  })
}

async function runSessionTeardownStep(
  epoch: number,
  step: () => void | Promise<void>,
): Promise<boolean> {
  if (!isCurrentSessionTeardown(epoch)) return false
  await step()
  return isCurrentSessionTeardown(epoch)
}

async function runSessionTeardown(
  authority: SessionTeardownAuthority,
  captureRefreshToken: boolean,
): Promise<SessionTeardownResult | null> {
  const teardown = await clearSessionCredentials(authority, captureRefreshToken)
  if (!teardown) return null
  const { epoch } = teardown
  if (!(await runSessionTeardownStep(epoch, () => cancelPersistentReminder().catch(() => {})))) return null

  queryClient.clear()
  if (!(await runSessionTeardownStep(epoch, clearPersistedQueryCache))) return null
  if (!(await runSessionTeardownStep(epoch, () => setQueryCacheScope(null)))) return null

  cancelScheduledFlush()
  offlineQueue.clear()
  if (!(await runSessionTeardownStep(epoch, clearOfflineState))) return null

  useChatStore.getState().clearMessages()
  useReviewReminderStore.getState().setAccountScope(null)
  resetOnboardingDraftForSignOut()
  if (!isCurrentSessionTeardown(epoch)) return null
  useAuthStore.setState({ user: null })
  return teardown
}

export async function clearSessionAndResetAuth(
  authority: ObservedCredentialAuthority,
): Promise<boolean> {
  return (await runSessionTeardown(authority, false)) !== null
}

/**
 * Outcome of a token rotation attempt. `network-error` is a transient blip,
 * `superseded` belongs to a newer session, and `unauthorized` is a real auth
 * failure where the session is cleared when `clearOnFailure`.
 */
export type RefreshSessionOutcome =
  | { status: 'refreshed'; token: string }
  | { status: 'unauthorized' }
  | { status: 'network-error' }
  | { status: 'superseded' }

type RefreshSessionAttempt = {
  epoch: number
  credentialVersion: number
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
async function rotateSessionToken(
  epoch: number,
  expectedCredentialVersion: number,
): Promise<RefreshSessionOutcome> {
  const ownership = { epoch, credentialVersion: expectedCredentialVersion }
  const refreshToken = await getRefreshToken()
  if (!isCurrentCredentialObservation(ownership)) return { status: 'superseded' }
  if (!refreshToken) {
    return { status: 'unauthorized' }
  }
  const currentUser = useAuthStore.getState().user

  let response: Response
  try {
    response = await fetch(`${MOBILE_API_BASE}${API.auth.refresh}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
  } catch (error: unknown) {
    if (!isCurrentCredentialObservation(ownership)) return { status: 'superseded' }
    if (!isTransientNetworkError(error)) {
      return { status: 'unauthorized' }
    }
    return { status: 'network-error' }
  }

  if (!isCurrentCredentialObservation(ownership)) return { status: 'superseded' }
  if (!response.ok) {
    return { status: response.status === 401 ? 'unauthorized' : 'network-error' }
  }

  const data = (await response.json()) as RefreshResponse
  const tokenUser = getUserFromToken(data.token, currentUser?.name)
  const published = await withCredentialMutationLock(async () => {
    if (!isCurrentCredentialObservation(ownership)) return false
    await setToken(data.token)
    await setRefreshToken(data.refreshToken)
    await saveWidgetToken(data.token).catch(() => {})
    credentialVersion += 1
    const sessionPhase = useAuthStore.getState().sessionPhase
    useAuthStore.setState({
      ...(sessionPhase === 'establishing' ? {} : deriveSessionPhase('signed-in')),
      user: currentUser ?? tokenUser,
      expiresAt: getExpiresAt(data.token),
    })
    return true
  })
  if (!published) return { status: 'superseded' }
  resumeOfflineReplay()

  return { status: 'refreshed', token: data.token }
}

async function runRefreshSession(): Promise<RefreshSessionAttempt> {
  const { epoch, credentialVersion: expectedCredentialVersion } = getSessionGeneration()
  try {
    return {
      epoch,
      credentialVersion: expectedCredentialVersion,
      outcome: await rotateSessionToken(epoch, expectedCredentialVersion),
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
    await clearSessionAndResetAuth({
      authority: 'observed-credential',
      epoch: attempt.epoch,
      credentialVersion: attempt.credentialVersion,
    })
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
  switch (outcome.status) {
    case 'refreshed':
      return outcome.token
    case 'unauthorized':
    case 'network-error':
    case 'superseded':
      return null
  }
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
  const ownership = getSessionGeneration()
  try {
    const profile = await apiClient<Profile>(API.profile.get)
    if (!isCurrentSessionEpoch(ownership.epoch)) return
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
      await clearSessionAndResetAuth({
        authority: 'observed-credential',
        ...ownership,
      })
    }
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  ...deriveSessionPhase('signed-out'),
  user: null,
  isLoading: true,
  expiresAt: null,

  login: async (token, refreshToken, user) => {
    let ownership = getSessionGeneration()
    set(deriveSessionPhase('establishing'))
    try {
      const loginSession = await withCredentialMutationLock(async () => {
        await setToken(token)
        if (refreshToken) {
          await setRefreshToken(refreshToken)
        } else {
          await clearRefreshToken()
        }
        await saveWidgetToken(token).catch(() => {})
        sessionEpoch += 1
        credentialVersion += 1
        set({
          ...deriveSessionPhase('establishing'),
          user,
          isLoading: false,
          expiresAt: getExpiresAt(token),
        })
        return getSessionGeneration()
      })
      ownership = loginSession
      if (!isCurrentSessionEpoch(ownership.epoch)) return null
      queryClient.clear()
      await clearPersistedQueryCache()
      if (!isCurrentSessionEpoch(ownership.epoch)) return null
      await setQueryCacheScope(user.userId)
      if (!isCurrentSessionEpoch(ownership.epoch)) return null
      cancelScheduledFlush()
      offlineQueue.clear()
      await clearOfflineState()
      if (!isCurrentSessionEpoch(ownership.epoch)) return null
      useChatStore.getState().clearMessages()
      useReviewReminderStore.getState().setAccountScope(user.userId)
      let hydratedUser = user

      try {
        const profile = await apiClient<Profile>(API.profile.get)
        if (!isCurrentSessionEpoch(ownership.epoch)) return null
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

      if (!isCurrentSessionEpoch(ownership.epoch)) return null
      set({
        ...deriveSessionPhase('signed-in'),
        user: hydratedUser,
        isLoading: false,
        expiresAt:
          credentialVersion === ownership.credentialVersion ? getExpiresAt(token) : get().expiresAt,
      })
      return () => isCurrentSessionEpoch(ownership.epoch)
    } catch (error: unknown) {
      await runSessionTeardown({
        authority: 'session-owner',
        epoch: ownership.epoch,
      }, false).catch(() => {})
      throw error
    }
  },

  logout: async () => {
    const ownership = getSessionGeneration()
    await import('@/hooks/use-push-notifications')
      .then((module) => module.unsubscribePushToken())
      .catch(() => {})

    const teardown = await runSessionTeardown({
      authority: 'session-owner',
      epoch: ownership.epoch,
    }, true)
    const refreshToken = teardown?.refreshToken ?? null
    if (teardown && refreshToken && isCurrentSessionTeardown(teardown.epoch)) {
      await apiClient(API.auth.logout, {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
        skipAuthRecovery: true,
      }).catch(() => {})
    }

    if (!teardown) return false
    if (!isCurrentSessionTeardown(teardown.epoch)) return false
    await clearStoredAuthReturnUrl()
    if (!isCurrentSessionTeardown(teardown.epoch)) return false
    return true
  },

  checkAuth: async () => {
    const ownership = getSessionGeneration()
    const startingPhase = get().sessionPhase
    if (startingPhase === 'establishing') return true
    const ownsSessionEstablishment = startingPhase === 'signed-out'
    if (ownsSessionEstablishment) set(deriveSessionPhase('establishing'))

    let token = await getToken()
    if (!isCurrentSessionEpoch(ownership.epoch)) return false
    if (!token) {
      await clearSessionAndResetAuth({
        authority: 'observed-credential',
        ...ownership,
      })
      return false
    }

    if (isTokenExpired(token)) {
      const outcome = await refreshSession()
      switch (outcome.status) {
        case 'unauthorized':
        case 'superseded':
          return false
        case 'refreshed':
          token = outcome.token
          break
        case 'network-error':
          break
      }
    }

    const payload = decodeJwtPayload(token)
    const accountId = getAccountIdFromPayload(payload)
    const restored = await withCredentialMutationLock(async () => {
      if (!isCurrentSessionEpoch(ownership.epoch)) return false
      if (!ownsSessionEstablishment && get().sessionPhase === 'establishing') return true
      await saveWidgetToken(token).catch(() => {})
      await setQueryCacheScope(accountId)
      if (!isCurrentSessionEpoch(ownership.epoch)) return false
      if (!ownsSessionEstablishment && get().sessionPhase === 'establishing') return true
      set((state) => ({
        ...deriveSessionPhase('signed-in'),
        user: state.user ?? getUserFromPayload(payload),
        expiresAt: getExpiresAtFromPayload(payload),
      }))
      return true
    })
    if (!restored) return false

    return isCurrentSessionEpoch(ownership.epoch)
  },

  initialize: async () => {
    const ownership = getSessionGeneration()
    set({ isLoading: true })
    try {
      const isValid = await get().checkAuth()
      if (!isValid) {
        if (isCurrentCredentialObservation(ownership)) {
          set({
            ...deriveSessionPhase('signed-out'),
            user: null,
            isLoading: false,
            expiresAt: null,
          })
        }
        return
      }
      if (!isCurrentSessionEpoch(ownership.epoch)) return

      set({ isLoading: false })
      useReviewReminderStore.getState().setAccountScope(get().user?.userId ?? null)

      profileHydrationInFlight = (async () => {
        await hydrateSessionProfile()
        if (isCurrentSessionEpoch(ownership.epoch)) {
          useReviewReminderStore.getState().setAccountScope(get().user?.userId ?? null)
        }
      })()
      void profileHydrationInFlight
    } catch {
      await clearSessionAndResetAuth({
        authority: 'observed-credential',
        ...ownership,
      })
    }
  },
}))

import React from 'react'
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'
import { API } from '@orbit/shared/api'
import { notificationKeys, profileKeys } from '@orbit/shared/query'
import { i18n } from '@/lib/i18n'
import { getRuntimeTheme } from '@/lib/theme'
import { useLogout } from '@/hooks/use-logout'
import { useThrottleStore } from '@/stores/throttle-store'
import { getErrorSurface } from '@orbit/shared/utils'

import {
  clearSessionAndResetAuth,
  getSessionGeneration,
  isAuthTransitionInFlight,
  refreshSession,
  refreshSessionToken,
  useAuthStore,
  whenProfileHydrated,
} from '@/stores/auth-store'
import { clearStepUpState, isStepUpVerified, markStepUpVerified } from '@/lib/step-up-storage'
import { shouldExposeOnboardingRoute } from '@/lib/capture-mode'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'
import { useDeleteNotification } from '@/hooks/use-notifications'
import type { NotificationsResponse } from '@orbit/shared/types/notification'
import {
  getFailedNotificationDeleteIdsSnapshot,
  getPendingNotificationDeleteIdsSnapshot,
  queuePendingNotificationDelete,
  resetPendingNotificationDeletesForTests,
  retryFailedNotificationDelete,
} from '@/lib/pending-notification-deletes'

const PINNED_TEST_TIME = new Date('2026-09-12T09:00:00.000Z')
const TestRenderer = require('react-test-renderer')
vi.setSystemTime(PINNED_TEST_TIME)
beforeEach(() => vi.setSystemTime(PINNED_TEST_TIME))
afterEach(() => vi.useRealTimers())

const {
  replaceMock,
  getTokenMock,
  setTokenMock,
  setRefreshTokenMock,
  clearRefreshTokenMock,
  clearAllTokensMock,
  getRefreshTokenMock,
  clearWidgetTokenMock,
  saveWidgetTokenMock,
  apiClientMock,
  clearPersistedQueryCacheMock,
  queryClientClearMock,
  setQueryDataMock,
  clearStoredAuthReturnUrlMock,
  resetAccountScopedChatMock,
  forgetStoredSupportDraftMock,
  offlineQueueClearMock,
  retainAccountMock,
  clearOfflineStateMock,
  unsubscribePushTokenMock,
  fetchMock,
  setQueryCacheScopeMock,
  cancelScheduledFlushMock,
  resumeOfflineReplayMock,
  cancelPersistentReminderMock,
  cancelQueriesMock,
  getQueryDataMock,
  invalidateQueriesMock,
  queryCache,
} = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  getTokenMock: vi.fn(),
  setTokenMock: vi.fn(),
  setRefreshTokenMock: vi.fn(),
  clearRefreshTokenMock: vi.fn(),
  clearAllTokensMock: vi.fn(),
  getRefreshTokenMock: vi.fn(),
  clearWidgetTokenMock: vi.fn(),
  saveWidgetTokenMock: vi.fn(),
  apiClientMock: vi.fn(),
  clearPersistedQueryCacheMock: vi.fn(),
  queryClientClearMock: vi.fn(),
  setQueryDataMock: vi.fn(),
  clearStoredAuthReturnUrlMock: vi.fn(),
  resetAccountScopedChatMock: vi.fn(async () => {}),
  forgetStoredSupportDraftMock: vi.fn(async () => {}),
  offlineQueueClearMock: vi.fn(),
  retainAccountMock: vi.fn(),
  clearOfflineStateMock: vi.fn(),
  unsubscribePushTokenMock: vi.fn(),
  fetchMock: vi.fn(),
  setQueryCacheScopeMock: vi.fn(),
  cancelScheduledFlushMock: vi.fn(),
  resumeOfflineReplayMock: vi.fn(),
  cancelPersistentReminderMock: vi.fn(),
  cancelQueriesMock: vi.fn(async () => {}),
  getQueryDataMock: vi.fn((queryKey: readonly unknown[]) => queryCache.get(JSON.stringify(queryKey))),
  invalidateQueriesMock: vi.fn(async () => {}),
  queryCache: new Map<string, unknown>(),
}))

vi.mock('expo-router', () => ({
  router: {
    replace: replaceMock,
  },
  useRouter: () => ({ replace: replaceMock }),
}))

vi.mock('@/lib/secure-store', () => ({
  getToken: getTokenMock,
  setToken: setTokenMock,
  setRefreshToken: setRefreshTokenMock,
  clearRefreshToken: clearRefreshTokenMock,
  clearAllTokens: clearAllTokensMock,
  getRefreshToken: getRefreshTokenMock,
}))

vi.mock('@/lib/orbit-widget', () => ({
  clearWidgetToken: clearWidgetTokenMock,
  saveWidgetToken: saveWidgetTokenMock,
}))

vi.mock('@/lib/persistent-reminder', () => ({
  cancelPersistentReminder: cancelPersistentReminderMock,
}))

vi.mock('@/lib/api-client', () => ({
  apiClient: apiClientMock,
}))

vi.mock('@/lib/offline-queue', () => ({
  clear: offlineQueueClearMock,
  retainAccount: retainAccountMock,
}))

vi.mock('@/lib/offline-mutations', () => ({
  buildQueuedMutation: vi.fn((options) => ({ id: 'mutation-1', ...options })),
  createQueuedAck: vi.fn((mutationId: string) => ({ queued: true, queuedMutationId: mutationId })),
  isQueuedResult: vi.fn(() => false),
  queueOrExecute: vi.fn(({ execute }) => execute()),
  cancelScheduledFlush: cancelScheduledFlushMock,
  resumeOfflineReplay: resumeOfflineReplayMock,
}))

vi.mock('@/lib/offline-state', () => ({
  clearOfflineState: clearOfflineStateMock,
}))

vi.mock('@/hooks/use-push-notifications', () => ({
  unsubscribePushToken: unsubscribePushTokenMock,
}))

vi.mock('@/lib/query-client', () => ({
  queryClient: {
    clear: queryClientClearMock,
    cancelQueries: cancelQueriesMock,
    getQueryData: getQueryDataMock,
    invalidateQueries: invalidateQueriesMock,
    setQueryData: setQueryDataMock,
  },
  clearPersistedQueryCache: clearPersistedQueryCacheMock,
  setQueryCacheScope: setQueryCacheScopeMock,
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    cancelQueries: cancelQueriesMock,
    getQueryData: getQueryDataMock,
    invalidateQueries: invalidateQueriesMock,
    setQueryData: setQueryDataMock,
  }),
  useMutation: (config: unknown) => config,
  useQuery: vi.fn(),
}))

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next')
  return { ...actual, useTranslation: () => ({ t: (key: string) => key }) }
})

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showError: vi.fn() }),
}))

vi.mock('@/lib/auth-flow', () => ({
  clearStoredAuthReturnUrl: clearStoredAuthReturnUrlMock,
}))

vi.mock('@/lib/support-draft-storage', () => ({
  forgetStoredSupportDraft: forgetStoredSupportDraftMock,
}))

vi.mock('@/stores/chat-store', () => ({
  useChatStore: {
    getState: () => ({
      resetAccountScopedChat: resetAccountScopedChatMock,
    }),
  },
}))

vi.stubGlobal('fetch', fetchMock)

function makeJwt(expirySeconds: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' }), 'utf8').toString('base64')
  const payload = Buffer.from(JSON.stringify({ exp: expirySeconds }), 'utf8').toString('base64')
  return `${header}.${payload}.`
}

function makeJwtWithClaims(expirySeconds: number, userId = 'jwt-user', email = 'jwt@example.com'): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' }), 'utf8').toString('base64')
  const payload = Buffer.from(
    JSON.stringify({
      exp: expirySeconds,
      'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier': userId,
      'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress': email,
    }),
    'utf8',
  ).toString('base64')
  return `${header}.${payload}.`
}

function renderHookValue<T>(hook: () => T): T {
  let value!: T
  function Probe() {
    value = hook()
    return null
  }
  TestRenderer.act(() => TestRenderer.create(React.createElement(Probe)))
  return value
}

describe('mobile auth store security paths', () => {
  beforeEach(() => {
    resetPendingNotificationDeletesForTests()
    clearStepUpState()
    replaceMock.mockReset()
    getTokenMock.mockReset()
    setTokenMock.mockReset()
    setRefreshTokenMock.mockReset()
    clearRefreshTokenMock.mockReset()
    clearAllTokensMock.mockReset()
    getRefreshTokenMock.mockReset()
    clearWidgetTokenMock.mockReset()
    saveWidgetTokenMock.mockReset()
    apiClientMock.mockReset()
    clearPersistedQueryCacheMock.mockReset()
    queryClientClearMock.mockReset()
    setQueryDataMock.mockReset()
    clearStoredAuthReturnUrlMock.mockReset()
    resetAccountScopedChatMock.mockReset()
    resetAccountScopedChatMock.mockResolvedValue(undefined)
    forgetStoredSupportDraftMock.mockReset()
    forgetStoredSupportDraftMock.mockResolvedValue(undefined)
    offlineQueueClearMock.mockReset()
    retainAccountMock.mockReset()
    clearOfflineStateMock.mockReset()
    unsubscribePushTokenMock.mockReset()
    fetchMock.mockReset()
    setQueryCacheScopeMock.mockReset()
    cancelScheduledFlushMock.mockReset()
    resumeOfflineReplayMock.mockReset()
    cancelPersistentReminderMock.mockReset()
    cancelQueriesMock.mockClear()
    getQueryDataMock.mockClear()
    invalidateQueriesMock.mockClear()
    queryCache.clear()
    queryClientClearMock.mockImplementation(() => queryCache.clear())
    setQueryDataMock.mockImplementation((
      queryKey: readonly unknown[],
      updater: unknown,
    ) => {
      const cacheKey = JSON.stringify(queryKey)
      const current = queryCache.get(cacheKey)
      queryCache.set(cacheKey, typeof updater === 'function' ? updater(current) : updater)
    })
    cancelPersistentReminderMock.mockResolvedValue(undefined)
    setQueryCacheScopeMock.mockResolvedValue(undefined)

    clearWidgetTokenMock.mockResolvedValue(undefined)
    saveWidgetTokenMock.mockResolvedValue(undefined)
    clearPersistedQueryCacheMock.mockResolvedValue(undefined)
    clearStoredAuthReturnUrlMock.mockResolvedValue(undefined)
    clearOfflineStateMock.mockResolvedValue(undefined)
    unsubscribePushTokenMock.mockResolvedValue(undefined)
    apiClientMock.mockResolvedValue(undefined)

    useAuthStore.setState({
      sessionPhase: 'signed-out',
      isAuthenticated: false,
      user: null,
      isLoading: true,
      expiresAt: null,
    })
    useOnboardingDraftStore.setState({ onboardingLocallyDone: false })
  })

  it('clears any stale refresh token during login when no new refresh token is provided', async () => {
    await useAuthStore.getState().login('access-token', null, {
      userId: 'user-1',
      email: 'user@example.com',
      name: 'User',
    })

    expect(clearRefreshTokenMock).toHaveBeenCalledTimes(1)
    expect(setTokenMock).toHaveBeenCalledWith('access-token')
    expect(setRefreshTokenMock).not.toHaveBeenCalled()
    expect(saveWidgetTokenMock).toHaveBeenCalledWith('access-token')
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })

  it('persists the new tokens before clearing cached query data on login', async () => {
    const callOrder: string[] = []
    setTokenMock.mockImplementation(() => {
      callOrder.push('setToken')
      return Promise.resolve()
    })
    setRefreshTokenMock.mockImplementation(() => {
      callOrder.push('setRefreshToken')
      return Promise.resolve()
    })
    queryClientClearMock.mockImplementation(() => {
      callOrder.push('queryClient.clear')
    })

    await useAuthStore.getState().login('access-token', 'refresh-token', {
      userId: 'user-1',
      email: 'user@example.com',
      name: 'User',
    })

    expect(callOrder.indexOf('setToken')).toBeGreaterThanOrEqual(0)
    expect(callOrder.indexOf('setToken')).toBeLessThan(callOrder.indexOf('queryClient.clear'))
    expect(callOrder.indexOf('setRefreshToken')).toBeLessThan(callOrder.indexOf('queryClient.clear'))
  })

  it('does not carry the support draft into a replacement account', async () => {
    await useAuthStore.getState().login('access-token', 'refresh-token', {
      userId: 'user-1',
      email: 'user@example.com',
      name: 'User',
    })

    expect(forgetStoredSupportDraftMock).toHaveBeenCalledTimes(1)
  })

  it('keeps the protected tree unavailable until account cleanup completes', async () => {
    let releasePersistedCacheClear!: () => void
    const persistedCacheClearReleased = new Promise<void>((resolve) => {
      releasePersistedCacheClear = resolve
    })
    clearPersistedQueryCacheMock.mockReturnValue(persistedCacheClearReleased)

    let protectedTreeMounts = 0
    let sharedProfileCacheReads = 0
    const unsubscribe = useAuthStore.subscribe((state) => {
      if (!state.isAuthenticated) return
      protectedTreeMounts += 1
      sharedProfileCacheReads += 1
    })

    const login = useAuthStore.getState().login('access-token', 'refresh-token', {
      userId: 'user-1',
      email: 'user@example.com',
      name: 'User',
    })

    await vi.waitFor(() => expect(clearPersistedQueryCacheMock).toHaveBeenCalledTimes(1))
    try {
      expect(useAuthStore.getState()).toMatchObject({
        sessionPhase: 'establishing',
        isAuthenticated: false,
      })
      expect(protectedTreeMounts).toBe(0)
      expect(sharedProfileCacheReads).toBe(0)
    } finally {
      releasePersistedCacheClear()
      await login
      unsubscribe()
    }

    expect(useAuthStore.getState()).toMatchObject({
      sessionPhase: 'signed-in',
      isAuthenticated: true,
    })
    expect(protectedTreeMounts).toBe(1)
    expect(sharedProfileCacheReads).toBe(1)
  })

  it('returns to signed out when account cleanup rejects during login', async () => {
    clearPersistedQueryCacheMock.mockRejectedValueOnce(new Error('cache cleanup failed'))

    await expect(useAuthStore.getState().login('access-token', 'refresh-token', {
      userId: 'user-1',
      email: 'user@example.com',
      name: 'User',
    })).rejects.toThrow('cache cleanup failed')

    expect(useAuthStore.getState()).toMatchObject({
      sessionPhase: 'signed-out',
      isAuthenticated: false,
    })
  })

  it('does not let checkAuth complete a login transition it did not start', async () => {
    const storedToken = makeJwtWithClaims(
      Math.floor(Date.now() / 1000) + 3600,
      'user-1',
      'user@example.com',
    )
    getTokenMock.mockResolvedValue(storedToken)

    let releasePersistedCacheClear!: () => void
    const persistedCacheClearReleased = new Promise<void>((resolve) => {
      releasePersistedCacheClear = resolve
    })
    clearPersistedQueryCacheMock.mockReturnValue(persistedCacheClearReleased)

    let signedInPublications = 0
    const unsubscribe = useAuthStore.subscribe((state) => {
      if (state.sessionPhase === 'signed-in') signedInPublications += 1
    })

    const login = useAuthStore.getState().login('access-token', 'refresh-token', {
      userId: 'user-1',
      email: 'user@example.com',
      name: 'User',
    })

    await vi.waitFor(() => expect(clearPersistedQueryCacheMock).toHaveBeenCalledTimes(1))
    const restored = await useAuthStore.getState().checkAuth()

    try {
      expect(restored).toBe(true)
      expect(useAuthStore.getState()).toMatchObject({
        sessionPhase: 'establishing',
        isAuthenticated: false,
      })
      expect(signedInPublications).toBe(0)
    } finally {
      releasePersistedCacheClear()
      await login
      unsubscribe()
    }

    expect(useAuthStore.getState()).toMatchObject({
      sessionPhase: 'signed-in',
      isAuthenticated: true,
    })
    expect(signedInPublications).toBe(1)
  })

  it('finishes login after a successful refresh during account cleanup', async () => {
    const loginExpirySeconds = Math.floor(Date.now() / 1000) + 1800
    const refreshedExpirySeconds = loginExpirySeconds + 1800
    const loginToken = makeJwtWithClaims(loginExpirySeconds, 'user-1', 'user@example.com')
    const refreshedToken = makeJwtWithClaims(
      refreshedExpirySeconds,
      'user-1',
      'user@example.com',
    )
    getRefreshTokenMock.mockResolvedValue('refresh-token')
    fetchMock.mockResolvedValue(Response.json({
      token: refreshedToken,
      refreshToken: 'next-refresh',
    }))

    let releasePersistedCacheClear!: () => void
    const persistedCacheClearReleased = new Promise<void>((resolve) => {
      releasePersistedCacheClear = resolve
    })
    clearPersistedQueryCacheMock.mockReturnValue(persistedCacheClearReleased)

    const login = useAuthStore.getState().login(loginToken, 'refresh-token', {
      userId: 'user-1',
      email: 'user@example.com',
      name: 'User',
    })
    await vi.waitFor(() => expect(clearPersistedQueryCacheMock).toHaveBeenCalledTimes(1))

    await expect(refreshSession()).resolves.toEqual({
      status: 'refreshed',
      token: refreshedToken,
    })

    releasePersistedCacheClear()
    await login

    expect(useAuthStore.getState()).toMatchObject({
      sessionPhase: 'signed-in',
      isAuthenticated: true,
      expiresAt: refreshedExpirySeconds * 1000,
    })
  })

  it('rolls back login after a same-session refresh when later cleanup fails', async () => {
    const loginToken = makeJwtWithClaims(
      Math.floor(Date.now() / 1000) + 1800,
      'user-1',
      'user@example.com',
    )
    const refreshedToken = makeJwtWithClaims(
      Math.floor(Date.now() / 1000) + 3600,
      'user-1',
      'user@example.com',
    )
    getRefreshTokenMock.mockResolvedValue('refresh-token')
    fetchMock.mockResolvedValue(Response.json({
      token: refreshedToken,
      refreshToken: 'next-refresh',
    }))

    let releasePersistedCacheClear!: () => void
    const persistedCacheClearReleased = new Promise<void>((resolve) => {
      releasePersistedCacheClear = resolve
    })
    clearPersistedQueryCacheMock.mockReturnValue(persistedCacheClearReleased)
    setQueryCacheScopeMock.mockRejectedValueOnce(new Error('cache scope failed'))

    const login = useAuthStore.getState().login(loginToken, 'refresh-token', {
      userId: 'user-1',
      email: 'user@example.com',
      name: 'User',
    })
    await vi.waitFor(() => expect(clearPersistedQueryCacheMock).toHaveBeenCalledTimes(1))

    await expect(refreshSession()).resolves.toMatchObject({ status: 'refreshed' })
    releasePersistedCacheClear()

    await expect(login).rejects.toThrow('cache scope failed')
    expect(useAuthStore.getState()).toMatchObject({
      sessionPhase: 'signed-out',
      isAuthenticated: false,
      user: null,
    })
  })

  it('refuses a stale login rollback after a replacement login advances the epoch', async () => {
    const replacementToken = makeJwtWithClaims(
      Math.floor(Date.now() / 1000) + 3600,
      'replacement-user',
      'replacement@example.com',
    )
    let rejectOriginalCleanup!: (error: Error) => void
    const originalCleanup = new Promise<void>((_resolve, reject) => {
      rejectOriginalCleanup = reject
    })
    clearPersistedQueryCacheMock
      .mockReturnValueOnce(originalCleanup)
      .mockResolvedValue(undefined)

    const originalLogin = useAuthStore.getState().login('original-token', 'original-refresh', {
      userId: 'original-user',
      email: 'original@example.com',
      name: 'Original user',
    })
    await vi.waitFor(() => expect(clearPersistedQueryCacheMock).toHaveBeenCalledTimes(1))

    await useAuthStore.getState().login(
      replacementToken,
      'replacement-refresh',
      {
        userId: 'replacement-user',
        email: 'replacement@example.com',
        name: 'Replacement user',
      },
    )
    rejectOriginalCleanup(new Error('original cleanup failed'))

    await expect(originalLogin).rejects.toThrow('original cleanup failed')
    expect(clearAllTokensMock).not.toHaveBeenCalled()
    expect(useAuthStore.getState()).toMatchObject({
      sessionPhase: 'signed-in',
      isAuthenticated: true,
      user: { userId: 'replacement-user' },
    })
  })

  /**
   * The consumers of `superseded` are covered where they live, but nothing proved the STORE ever
   * produces it. Collapsing this one return back to `unauthorized` left every one of those consumer
   * tests green, which is the whole reason this test exists.
   */
  it('reports a refresh that lost the session race as superseded, never unauthorized', async () => {
    const refreshedExpirySeconds = Math.floor(Date.now() / 1000) + 3600
    const refreshedToken = makeJwtWithClaims(
      refreshedExpirySeconds,
      'user-1',
      'user@example.com',
    )
    getRefreshTokenMock.mockResolvedValue('refresh-token')

    let releaseServerRefresh!: (response: Response) => void
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => {
      releaseServerRefresh = resolve
    }))

    useAuthStore.setState({
      sessionPhase: 'signed-in',
      isAuthenticated: true,
      user: { userId: 'user-1', email: 'user@example.com', name: 'User' },
      isLoading: false,
      expiresAt: Date.now() + 60_000,
    })

    const refresh = refreshSession({ clearOnFailure: false })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    /** A sign out lands while the server call is still in flight, so the epoch moves under it. */
    await useAuthStore.getState().logout()

    releaseServerRefresh(Response.json({
      token: refreshedToken,
      refreshToken: 'next-refresh',
    }))

    await expect(refresh).resolves.toEqual({ status: 'superseded' })
  })

  it('reports a stale refresh 401 as superseded after a replacement login', async () => {
    const replacementToken = makeJwtWithClaims(
      Math.floor(Date.now() / 1000) + 3600,
      'replacement-user',
      'replacement@example.com',
    )
    let storedToken: string | null = 'old-access-token'
    let storedRefreshToken: string | null = 'old-refresh-token'
    let releaseServerRefresh!: (response: Response) => void

    getRefreshTokenMock.mockImplementation(() => Promise.resolve(storedRefreshToken))
    setTokenMock.mockImplementation((token: string) => {
      storedToken = token
      return Promise.resolve()
    })
    setRefreshTokenMock.mockImplementation((token: string) => {
      storedRefreshToken = token
      return Promise.resolve()
    })
    clearAllTokensMock.mockImplementation(() => {
      storedToken = null
      storedRefreshToken = null
      return Promise.resolve()
    })
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => {
      releaseServerRefresh = resolve
    }))
    useAuthStore.setState({
      sessionPhase: 'signed-in',
      isAuthenticated: true,
      user: { userId: 'old-user', email: 'old@example.com', name: 'Old user' },
      isLoading: false,
      expiresAt: Date.now() + 60_000,
    })

    const refresh = refreshSession({ clearOnFailure: false })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    await useAuthStore.getState().logout()
    await useAuthStore.getState().login(
      replacementToken,
      'replacement-refresh-token',
      {
        userId: 'replacement-user',
        email: 'replacement@example.com',
        name: 'Replacement user',
      },
    )

    releaseServerRefresh(new Response(null, { status: 401 }))

    await expect(refresh).resolves.toEqual({ status: 'superseded' })
    expect(storedToken).toBe(replacementToken)
    expect(storedRefreshToken).toBe('replacement-refresh-token')
    expect(replaceMock).not.toHaveBeenCalled()
    expect(useAuthStore.getState()).toMatchObject({
      sessionPhase: 'signed-in',
      isAuthenticated: true,
      user: { userId: 'replacement-user' },
    })
  })

  it('aborts a blocked login when teardown changes the session', async () => {
    let releasePersistedCacheClear!: () => void
    const persistedCacheClearReleased = new Promise<void>((resolve) => {
      releasePersistedCacheClear = resolve
    })
    clearPersistedQueryCacheMock
      .mockReturnValueOnce(persistedCacheClearReleased)
      .mockResolvedValue(undefined)

    const login = useAuthStore.getState().login('access-token', 'refresh-token', {
      userId: 'user-1',
      email: 'user@example.com',
      name: 'User',
    })
    await vi.waitFor(() => expect(clearPersistedQueryCacheMock).toHaveBeenCalledTimes(1))

    const generation = getSessionGeneration()
    await clearSessionAndResetAuth({
      authority: 'observed-credential',
      ...generation,
    })
    releasePersistedCacheClear()
    await login

    expect(useAuthStore.getState()).toMatchObject({
      sessionPhase: 'signed-out',
      isAuthenticated: false,
      user: null,
      expiresAt: null,
    })
  })

  it('keeps a restored session unauthenticated until cache scoping completes', async () => {
    const rotatedToken = makeJwtWithClaims(
      Math.floor(Date.now() / 1000) + 3600,
      'restored-user',
      'restored@example.com',
    )
    getTokenMock.mockResolvedValue(makeJwt(Math.floor(Date.now() / 1000) - 10))
    getRefreshTokenMock.mockResolvedValue('refresh-token')
    fetchMock.mockResolvedValue(Response.json({
      token: rotatedToken,
      refreshToken: 'next-refresh',
    }))

    let releaseCacheScope!: () => void
    const cacheScopeReleased = new Promise<void>((resolve) => {
      releaseCacheScope = resolve
    })
    setQueryCacheScopeMock.mockReturnValue(cacheScopeReleased)

    const checkAuth = useAuthStore.getState().checkAuth()
    await vi.waitFor(() => expect(setQueryCacheScopeMock).toHaveBeenCalledWith('restored-user'))

    try {
      expect(useAuthStore.getState()).toMatchObject({
        sessionPhase: 'establishing',
        isAuthenticated: false,
      })
    } finally {
      releaseCacheScope()
      await checkAuth
    }

    expect(useAuthStore.getState()).toMatchObject({
      sessionPhase: 'signed-in',
      isAuthenticated: true,
      user: { userId: 'restored-user' },
    })
  })

  it('flags an auth transition between persisting the token and committing the session', async () => {
    expect(isAuthTransitionInFlight()).toBe(false)

    let flagDuringSetToken = false
    setTokenMock.mockImplementation(() => {
      flagDuringSetToken = isAuthTransitionInFlight()
      return Promise.resolve()
    })

    await useAuthStore.getState().login('access-token', 'refresh-token', {
      userId: 'user-1',
      email: 'user@example.com',
      name: 'User',
    })

    expect(flagDuringSetToken).toBe(true)
    expect(isAuthTransitionInFlight()).toBe(false)
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })

  it('keeps the session authenticated when a concurrent clear fires mid-login', async () => {
    const previousGeneration = getSessionGeneration()
    apiClientMock.mockImplementation(async () => {
      await clearSessionAndResetAuth({
        authority: 'observed-credential',
        ...previousGeneration,
      })
      return undefined
    })

    await useAuthStore.getState().login('access-token', 'refresh-token', {
      userId: 'user-1',
      email: 'user@example.com',
      name: 'User',
    })

    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })

  it('resets local auth state when profile refresh returns unauthorized', async () => {
    const validToken = makeJwt(Math.floor(Date.now() / 1000) + 3600)
    getTokenMock.mockResolvedValueOnce(validToken)
    getTokenMock.mockResolvedValueOnce(null)
    getRefreshTokenMock.mockResolvedValue('refresh-token')
    apiClientMock.mockRejectedValue(new Error('Unauthorized'))

    await useAuthStore.getState().initialize()
    await whenProfileHydrated()

    expect(clearAllTokensMock).toHaveBeenCalledTimes(1)
    expect(clearWidgetTokenMock).toHaveBeenCalledTimes(1)
    expect(clearPersistedQueryCacheMock).toHaveBeenCalledTimes(1)
    expect(queryClientClearMock).toHaveBeenCalledTimes(1)
    expect(resetAccountScopedChatMock).toHaveBeenCalledTimes(1)
    expect(forgetStoredSupportDraftMock).toHaveBeenCalledTimes(1)
    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: false,
      user: null,
      isLoading: false,
      expiresAt: null,
    })
  })

  it('keeps the session after a 429 refresh response and publishes the throttle', async () => {
    useThrottleStore.getState().clear()
    getRefreshTokenMock.mockResolvedValue('refresh-token')
    const retryAfterUtc = new Date(Date.now() + 60_000).toISOString()
    fetchMock.mockResolvedValue(Response.json({
      error: 'Rate limited', requestId: 'refresh-request', limit: 1, count: 2, retryAfterUtc,
    }, { status: 429 }))
    useAuthStore.setState({
      isAuthenticated: true,
      user: { userId: 'user-1', email: 'user@example.com', name: 'User' },
      isLoading: false,
      expiresAt: Date.now() - 1000,
    })

    const outcome = await refreshSession()

    expect(outcome).toEqual({ status: 'network-error' })
    expect(getErrorSurface(useThrottleStore.getState().error)).toEqual({
      retryAt: Date.parse(retryAfterUtc), requestId: 'refresh-request',
    })
    expect(clearAllTokensMock).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    useThrottleStore.getState().clear()
  })

  it('clears auth state when refreshSessionToken receives an invalid refresh response', async () => {
    getRefreshTokenMock.mockResolvedValue('refresh-token')
    fetchMock.mockResolvedValue({ ok: false, status: 401 })
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        userId: 'user-1',
        email: 'user@example.com',
        name: 'User',
      },
      isLoading: false,
      expiresAt: Date.now() + 3600_000,
    })

    const refreshedToken = await refreshSessionToken()

    expect(refreshedToken).toBeNull()
    expect(clearAllTokensMock).toHaveBeenCalledTimes(1)
    expect(clearWidgetTokenMock).toHaveBeenCalledTimes(1)
    expect(clearPersistedQueryCacheMock).toHaveBeenCalledTimes(1)
    expect(queryClientClearMock).toHaveBeenCalledTimes(1)
    expect(resetAccountScopedChatMock).toHaveBeenCalledTimes(1)
    expect(forgetStoredSupportDraftMock).toHaveBeenCalledTimes(1)
    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: false,
      user: null,
      expiresAt: null,
    })
  })

  it('preserves the session on a transient network error during refresh', async () => {
    getRefreshTokenMock.mockResolvedValue('refresh-token')
    fetchMock.mockRejectedValue(new TypeError('Network request failed'))
    useAuthStore.setState({
      isAuthenticated: true,
      user: { userId: 'user-1', email: 'user@example.com', name: 'User' },
      isLoading: false,
      expiresAt: Date.now() + 3600_000,
    })

    const outcome = await refreshSession()

    expect(outcome).toEqual({ status: 'network-error' })
    expect(clearAllTokensMock).not.toHaveBeenCalled()
    expect(queryClientClearMock).not.toHaveBeenCalled()
    expect(resetAccountScopedChatMock).not.toHaveBeenCalled()
    expect(forgetStoredSupportDraftMock).not.toHaveBeenCalled()
    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: true,
      user: { userId: 'user-1' },
    })
  })

  it('preserves the session when refresh receives a 502 response', async () => {
    getRefreshTokenMock.mockResolvedValue('refresh-token')
    fetchMock.mockResolvedValue(new Response(null, { status: 502 }))
    useAuthStore.setState({
      isAuthenticated: true,
      user: { userId: 'user-1', email: 'user@example.com', name: 'User' },
      isLoading: false,
      expiresAt: Date.now() - 1000,
    })

    const outcome = await refreshSession()

    expect(outcome).toEqual({ status: 'network-error' })
    expect(clearAllTokensMock).not.toHaveBeenCalled()
    expect(queryClientClearMock).not.toHaveBeenCalled()
    expect(resetAccountScopedChatMock).not.toHaveBeenCalled()
    expect(forgetStoredSupportDraftMock).not.toHaveBeenCalled()
    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: true,
      user: { userId: 'user-1' },
    })
  })

  it('keeps checkAuth authenticated when an expired token cannot refresh due to a network blip', async () => {
    const expiredToken = makeJwt(Math.floor(Date.now() / 1000) - 10)
    getTokenMock.mockResolvedValue(expiredToken)
    getRefreshTokenMock.mockResolvedValue('refresh-token')
    fetchMock.mockRejectedValue(new TypeError('Network request failed'))
    useAuthStore.setState({
      isAuthenticated: true,
      user: { userId: 'user-1', email: 'user@example.com', name: 'User' },
      isLoading: false,
      expiresAt: Date.now() - 1000,
    })

    const isValid = await useAuthStore.getState().checkAuth()

    expect(isValid).toBe(true)
    expect(clearAllTokensMock).not.toHaveBeenCalled()
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })

  it('clears auth state and tears down the session without imperatively navigating on logout', async () => {
    getRefreshTokenMock.mockResolvedValue(null)
    useAuthStore.setState({
      isAuthenticated: true,
      user: { userId: 'user-1', email: 'user@example.com', name: 'User' },
      isLoading: false,
      expiresAt: Date.now() + 3600_000,
    })

    const order: string[] = []
    const unsubscribe = useAuthStore.subscribe((state) => {
      if (!state.isAuthenticated) order.push('unauthenticated')
    })
    queryClientClearMock.mockImplementation(() => {
      order.push('clearCache')
    })

    await useAuthStore.getState().logout()
    unsubscribe()

    expect(replaceMock).not.toHaveBeenCalled()
    expect(clearAllTokensMock).toHaveBeenCalledTimes(1)
    expect(queryClientClearMock).toHaveBeenCalledTimes(1)
    expect(offlineQueueClearMock).toHaveBeenCalledTimes(1)
    expect(clearOfflineStateMock).toHaveBeenCalledTimes(1)
    expect(order.indexOf('unauthenticated')).toBeGreaterThanOrEqual(0)
    expect(order.indexOf('unauthenticated')).toBeLessThan(
      order.indexOf('clearCache'),
    )
    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: false,
      user: null,
      isLoading: false,
      expiresAt: null,
    })
  })

  it('keeps onboarding hidden after a returning person signs out', async () => {
    getRefreshTokenMock.mockResolvedValue(null)
    useOnboardingDraftStore.getState().markOnboardingLocallyDone()
    useAuthStore.setState({
      isAuthenticated: true,
      user: { userId: 'user-1', email: 'user@example.com', name: 'User' },
      isLoading: false,
      expiresAt: Date.now() + 3600_000,
    })

    await useAuthStore.getState().logout()

    const { isAuthenticated } = useAuthStore.getState()
    const { onboardingLocallyDone } = useOnboardingDraftStore.getState()
    expect(onboardingLocallyDone).toBe(true)
    expect(
      shouldExposeOnboardingRoute(false, isAuthenticated, onboardingLocallyDone),
    ).toBe(false)
  })

  it('attempts a best-effort push unsubscribe before clearing tokens on logout', async () => {
    getRefreshTokenMock.mockResolvedValue(null)
    const order: string[] = []
    unsubscribePushTokenMock.mockImplementation(() => {
      order.push('unsubscribePush')
      return Promise.resolve()
    })
    clearAllTokensMock.mockImplementation(() => {
      order.push('clearAllTokens')
      return Promise.resolve()
    })
    useAuthStore.setState({
      isAuthenticated: true,
      user: { userId: 'user-1', email: 'user@example.com', name: 'User' },
      isLoading: false,
      expiresAt: Date.now() + 3600_000,
    })

    await useAuthStore.getState().logout()

    expect(unsubscribePushTokenMock).toHaveBeenCalledTimes(1)
    expect(order.indexOf('unsubscribePush')).toBeGreaterThanOrEqual(0)
    expect(order.indexOf('unsubscribePush')).toBeLessThan(
      order.indexOf('clearAllTokens'),
    )
  })

  it('does not let a failing push unsubscribe block logout teardown', async () => {
    getRefreshTokenMock.mockResolvedValue(null)
    unsubscribePushTokenMock.mockRejectedValue(new Error('network down'))
    useAuthStore.setState({
      isAuthenticated: true,
      user: { userId: 'user-1', email: 'user@example.com', name: 'User' },
      isLoading: false,
      expiresAt: Date.now() + 3600_000,
    })

    await expect(useAuthStore.getState().logout()).resolves.toBe(true)

    expect(clearAllTokensMock).toHaveBeenCalledTimes(1)
    expect(offlineQueueClearMock).toHaveBeenCalledTimes(1)
    expect(clearOfflineStateMock).toHaveBeenCalledTimes(1)
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('dismisses the persistent reminder on logout so a signed-out tray shows no streak data', async () => {
    getRefreshTokenMock.mockResolvedValue(null)
    useAuthStore.setState({
      isAuthenticated: true,
      user: { userId: 'user-1', email: 'user@example.com', name: 'User' },
      isLoading: false,
      expiresAt: Date.now() + 3600_000,
    })

    await useAuthStore.getState().logout()

    expect(cancelPersistentReminderMock).toHaveBeenCalledTimes(1)
  })

  it('does not let an in-flight refresh restore credentials after logout completes', async () => {
    const rotatedToken = makeJwtWithClaims(
      Math.floor(Date.now() / 1000) + 3600,
      'rotated-user',
      'rotated@example.com',
    )
    let storedToken: string | null = 'expired-token'
    let storedRefreshToken: string | null = 'refresh-token'
    let resolveRefresh!: (response: Response) => void

    getRefreshTokenMock.mockImplementation(() => Promise.resolve(storedRefreshToken))
    setTokenMock.mockImplementation((token: string) => {
      storedToken = token
      return Promise.resolve()
    })
    setRefreshTokenMock.mockImplementation((token: string) => {
      storedRefreshToken = token
      return Promise.resolve()
    })
    clearAllTokensMock.mockImplementation(() => {
      storedToken = null
      storedRefreshToken = null
      return Promise.resolve()
    })
    fetchMock.mockImplementationOnce(
      () => new Promise<Response>((resolve) => { resolveRefresh = resolve }),
    )
    useAuthStore.setState({
      isAuthenticated: true,
      user: { userId: 'user-1', email: 'user@example.com', name: 'User' },
      isLoading: false,
      expiresAt: Date.now() - 1000,
    })

    const refresh = refreshSession()
    await vi.waitFor(() => expect(resolveRefresh).toBeTypeOf('function'))
    await useAuthStore.getState().logout()

    resolveRefresh(Response.json({ token: rotatedToken, refreshToken: 'next-refresh' }))
    await refresh

    expect(storedToken).toBeNull()
    expect(storedRefreshToken).toBeNull()
    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: false,
      user: null,
      expiresAt: null,
    })
  })

  it('owns logout before an in-flight refresh resolves during the revoke request', async () => {
    const rotatedToken = makeJwtWithClaims(
      Math.floor(Date.now() / 1000) + 3600,
      'rotated-user',
      'rotated@example.com',
    )
    let storedToken: string | null = 'expired-token'
    let storedRefreshToken: string | null = 'refresh-token'
    let resolveRefresh!: (response: Response) => void
    let resolveRevoke!: () => void

    getRefreshTokenMock.mockImplementation(() => Promise.resolve(storedRefreshToken))
    setTokenMock.mockImplementation((token: string) => {
      storedToken = token
      return Promise.resolve()
    })
    setRefreshTokenMock.mockImplementation((token: string) => {
      storedRefreshToken = token
      return Promise.resolve()
    })
    clearAllTokensMock.mockImplementation(() => {
      storedToken = null
      storedRefreshToken = null
      return Promise.resolve()
    })
    fetchMock.mockImplementationOnce(
      () => new Promise<Response>((resolve) => { resolveRefresh = resolve }),
    )
    apiClientMock.mockImplementationOnce(
      () => new Promise<void>((resolve) => { resolveRevoke = resolve }),
    )
    useAuthStore.setState({
      isAuthenticated: true,
      user: { userId: 'user-1', email: 'user@example.com', name: 'User' },
      isLoading: false,
      expiresAt: Date.now() - 1000,
    })

    const refresh = refreshSession()
    await vi.waitFor(() => expect(resolveRefresh).toBeTypeOf('function'))
    const logout = useAuthStore.getState().logout()
    await vi.waitFor(() => expect(resolveRevoke).toBeTypeOf('function'))

    resolveRefresh(Response.json({ token: rotatedToken, refreshToken: 'next-refresh' }))
    await refresh

    try {
      expect(storedToken).toBeNull()
      expect(storedRefreshToken).toBeNull()
      expect(useAuthStore.getState().isAuthenticated).toBe(false)
    } finally {
      resolveRevoke()
      await logout
    }
  })

  it('advances the session epoch and signs out when revocation rejects', async () => {
    getRefreshTokenMock.mockResolvedValue('refresh-token')
    apiClientMock.mockRejectedValueOnce(new Error('network down'))
    const epochBeforeLogout = getSessionGeneration().epoch
    useAuthStore.setState({
      isAuthenticated: true,
      user: { userId: 'user-1', email: 'user@example.com', name: 'User' },
      isLoading: false,
      expiresAt: Date.now() + 3600_000,
    })

    await expect(useAuthStore.getState().logout()).resolves.toBe(true)

    expect(getSessionGeneration().epoch).toBeGreaterThan(epochBeforeLogout)
    expect(clearAllTokensMock).toHaveBeenCalledTimes(1)
    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: false,
      user: null,
      isLoading: false,
      expiresAt: null,
    })
  })

  it('does not let deferred logout work clear replacement session state', async () => {
    const replacementToken = makeJwtWithClaims(
      Math.floor(Date.now() / 1000) + 3600,
      'replacement-user',
      'replacement@example.com',
    )
    let storedToken: string | null = 'old-access-token'
    let storedRefreshToken: string | null = 'old-refresh-token'
    let storedAuthReturnUrl: string | null = '/replacement-destination'
    const offlineEntries = ['replacement-mutation']
    let releaseRevoke!: () => void

    getRefreshTokenMock.mockImplementation(() => Promise.resolve(storedRefreshToken))
    setTokenMock.mockImplementation((token: string) => {
      storedToken = token
      return Promise.resolve()
    })
    setRefreshTokenMock.mockImplementation((token: string) => {
      storedRefreshToken = token
      return Promise.resolve()
    })
    clearAllTokensMock.mockImplementation(() => {
      storedToken = null
      storedRefreshToken = null
      return Promise.resolve()
    })
    clearStoredAuthReturnUrlMock.mockImplementation(() => {
      storedAuthReturnUrl = null
      return Promise.resolve()
    })
    offlineQueueClearMock.mockImplementation(() => {
      offlineEntries.length = 0
    })
    apiClientMock.mockImplementationOnce(
      () => new Promise<void>((resolve) => { releaseRevoke = resolve }),
    )
    useAuthStore.setState({
      sessionPhase: 'signed-in',
      isAuthenticated: true,
      user: { userId: 'old-user', email: 'old@example.com', name: 'Old user' },
      isLoading: false,
      expiresAt: Date.now() + 3600_000,
    })

    const logout = renderHookValue(() => useLogout())()
    await vi.waitFor(() => expect(releaseRevoke).toBeTypeOf('function'))

    await useAuthStore.getState().login(
      replacementToken,
      'replacement-refresh-token',
      {
        userId: 'replacement-user',
        email: 'replacement@example.com',
        name: 'Replacement user',
      },
    )
    storedAuthReturnUrl = '/replacement-destination'
    offlineEntries.splice(0, offlineEntries.length, 'replacement-mutation')

    releaseRevoke()
    await logout

    expect(storedToken).toBe(replacementToken)
    expect(storedRefreshToken).toBe('replacement-refresh-token')
    expect(storedAuthReturnUrl).toBe('/replacement-destination')
    expect(offlineEntries).toEqual(['replacement-mutation'])
    expect(useAuthStore.getState()).toMatchObject({
      sessionPhase: 'signed-in',
      isAuthenticated: true,
      user: { userId: 'replacement-user' },
    })
    expect(replaceMock).not.toHaveBeenCalled()
  })

  it('does not navigate an old logout after replacement login during return URL cleanup', async () => {
    const oldUser = { userId: 'old-user', email: 'old@example.com', name: 'Old' }
    const newUser = { userId: 'new-user', email: 'new@example.com', name: 'New' }
    let releaseReturnUrlCleanup!: () => void
    const returnUrlCleanup = new Promise<void>((resolve) => {
      releaseReturnUrlCleanup = resolve
    })
    getRefreshTokenMock.mockResolvedValue(null)
    await useAuthStore.getState().login('old-access-token', null, oldUser)
    clearStoredAuthReturnUrlMock.mockReturnValue(returnUrlCleanup)

    const logoutAndRedirect = renderHookValue(() => useLogout())
    const oldLogout = logoutAndRedirect()
    await vi.waitFor(() => expect(clearStoredAuthReturnUrlMock).toHaveBeenCalledTimes(1))
    expect(useAuthStore.getState().isAuthenticated).toBe(false)

    await useAuthStore.getState().login('new-access-token', 'new-refresh-token', newUser)
    releaseReturnUrlCleanup()
    await oldLogout

    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: true, user: newUser })
    expect(replaceMock).not.toHaveBeenCalled()
  })

  it('does not let a second logout waiting on push unsubscribe adopt a replacement session', async () => {
    const replacementToken = makeJwtWithClaims(
      Math.floor(Date.now() / 1000) + 3600,
      'replacement-user',
      'replacement@example.com',
    )
    let storedToken: string | null = 'old-access-token'
    let storedRefreshToken: string | null = 'old-refresh-token'
    let storedAuthReturnUrl: string | null = '/old-destination'
    const offlineEntries = ['old-mutation']
    let releaseSecondUnsubscribe!: () => void
    let secondLogout!: Promise<boolean>
    const secondUnsubscribeReleased = new Promise<void>((resolve) => {
      releaseSecondUnsubscribe = resolve
    })

    getRefreshTokenMock.mockImplementation(() => Promise.resolve(storedRefreshToken))
    setTokenMock.mockImplementation((token: string) => {
      storedToken = token
      return Promise.resolve()
    })
    setRefreshTokenMock.mockImplementation((token: string) => {
      storedRefreshToken = token
      return Promise.resolve()
    })
    clearAllTokensMock.mockImplementation(() => {
      storedToken = null
      storedRefreshToken = null
      return Promise.resolve()
    })
    clearStoredAuthReturnUrlMock.mockImplementation(() => {
      storedAuthReturnUrl = null
      return Promise.resolve()
    })
    offlineQueueClearMock.mockImplementation(() => {
      offlineEntries.length = 0
    })
    unsubscribePushTokenMock
      .mockImplementationOnce(() => {
        secondLogout = useAuthStore.getState().logout()
        return Promise.resolve()
      })
      .mockReturnValueOnce(secondUnsubscribeReleased)
    useAuthStore.setState({
      sessionPhase: 'signed-in',
      isAuthenticated: true,
      user: { userId: 'old-user', email: 'old@example.com', name: 'Old user' },
      isLoading: false,
      expiresAt: Date.now() + 3600_000,
    })

    const firstLogout = useAuthStore.getState().logout()
    await vi.waitFor(() => expect(unsubscribePushTokenMock).toHaveBeenCalledTimes(2))
    await expect(firstLogout).resolves.toBe(true)

    await useAuthStore.getState().login(
      replacementToken,
      'replacement-refresh-token',
      {
        userId: 'replacement-user',
        email: 'replacement@example.com',
        name: 'Replacement user',
      },
    )
    storedAuthReturnUrl = '/replacement-destination'
    offlineEntries.splice(0, offlineEntries.length, 'replacement-mutation')

    releaseSecondUnsubscribe()
    await expect(secondLogout).resolves.toBe(false)

    expect(storedToken).toBe(replacementToken)
    expect(storedRefreshToken).toBe('replacement-refresh-token')
    expect(storedAuthReturnUrl).toBe('/replacement-destination')
    expect(offlineEntries).toEqual(['replacement-mutation'])
    expect(useAuthStore.getState()).toMatchObject({
      sessionPhase: 'signed-in',
      isAuthenticated: true,
      user: { userId: 'replacement-user' },
    })
  })

  it('dismisses the persistent reminder when checkAuth finds no token', async () => {
    getTokenMock.mockResolvedValue(null)

    const isValid = await useAuthStore.getState().checkAuth()

    expect(isValid).toBe(false)
    expect(cancelPersistentReminderMock).toHaveBeenCalledTimes(1)
  })

  it('filters queue ownership and clears offline state before establishing a new session on login', async () => {
    const order: string[] = []
    retainAccountMock.mockImplementation(() => {
      order.push('offlineQueue.retainAccount')
    })
    clearOfflineStateMock.mockImplementation(() => {
      order.push('clearOfflineState')
      return Promise.resolve()
    })

    await useAuthStore.getState().login('access-token', 'refresh-token', {
      userId: 'user-1',
      email: 'user@example.com',
      name: 'User',
    })

    expect(retainAccountMock).toHaveBeenCalledWith('user-1')
    expect(offlineQueueClearMock).not.toHaveBeenCalled()
    expect(clearOfflineStateMock).toHaveBeenCalledTimes(1)
    expect(order).toContain('offlineQueue.retainAccount')
    expect(order).toContain('clearOfflineState')
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })

  it('rotates the token and derives the user from JWT claims on a successful refresh', async () => {
    const rotatedToken = makeJwtWithClaims(Math.floor(Date.now() / 1000) + 3600, 'rotated-user', 'rotated@example.com')
    getRefreshTokenMock.mockResolvedValue('refresh-token')
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ token: rotatedToken, refreshToken: 'next-refresh' }),
    })
    useAuthStore.setState({
      sessionPhase: 'signed-in',
      isAuthenticated: true,
    })

    const outcome = await refreshSession()

    expect(outcome).toEqual({ status: 'refreshed', token: rotatedToken })
    expect(setTokenMock).toHaveBeenCalledWith(rotatedToken)
    expect(setRefreshTokenMock).toHaveBeenCalledWith('next-refresh')
    expect(saveWidgetTokenMock).toHaveBeenCalledWith(rotatedToken)
    expect(resumeOfflineReplayMock).toHaveBeenCalledTimes(1)
    expect(useAuthStore.getState().user).toMatchObject({
      userId: 'rotated-user',
      email: 'rotated@example.com',
    })
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })

  it('refuses teardown authorized by an older credential version', async () => {
    const generationBeforeRefresh = getSessionGeneration()
    const rotatedToken = makeJwtWithClaims(
      Math.floor(Date.now() / 1000) + 3600,
      'rotated-user',
      'rotated@example.com',
    )
    getRefreshTokenMock.mockResolvedValue('refresh-token')
    fetchMock.mockResolvedValue(Response.json({
      token: rotatedToken,
      refreshToken: 'next-refresh',
    }))
    useAuthStore.setState({
      sessionPhase: 'signed-in',
      isAuthenticated: true,
    })

    await expect(refreshSession()).resolves.toEqual({
      status: 'refreshed',
      token: rotatedToken,
    })

    await expect(clearSessionAndResetAuth({
      authority: 'observed-credential',
      ...generationBeforeRefresh,
    })).resolves.toBe(false)
    expect(clearAllTokensMock).not.toHaveBeenCalled()
    expect(useAuthStore.getState().sessionPhase).toBe('signed-in')
  })

  it('shares one token rotation across concurrent refresh callers', async () => {
    const rotatedToken = makeJwtWithClaims(
      Math.floor(Date.now() / 1000) + 3600,
      'rotated-user',
      'rotated@example.com',
    )
    getRefreshTokenMock.mockResolvedValue('refresh-token')
    useAuthStore.setState({
      isAuthenticated: true,
      user: { userId: 'user-1', email: 'user@example.com', name: 'User' },
      isLoading: false,
      expiresAt: Date.now() - 1000,
    })

    let resolveWinningRequest!: (response: Response) => void
    let resolveLosingRequest: ((response: Response) => void) | undefined
    fetchMock
      .mockImplementationOnce(
        () => new Promise<Response>((resolve) => { resolveWinningRequest = resolve }),
      )
      .mockImplementationOnce(
        () => new Promise<Response>((resolve) => { resolveLosingRequest = resolve }),
      )

    const bannerRefresh = refreshSession()
    const apiRefresh = refreshSession()
    await vi.waitFor(() => expect(resolveWinningRequest).toBeTypeOf('function'))

    resolveWinningRequest(Response.json({
      token: rotatedToken,
      refreshToken: 'next-refresh',
    }))
    await vi.waitFor(() => expect(setTokenMock).toHaveBeenCalledWith(rotatedToken))
    resolveLosingRequest?.(new Response(null, { status: 401 }))

    const outcomes = await Promise.all([bannerRefresh, apiRefresh])

    expect(outcomes).toEqual([
      { status: 'refreshed', token: rotatedToken },
      { status: 'refreshed', token: rotatedToken },
    ])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(clearAllTokensMock).not.toHaveBeenCalled()
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })

  it('keeps a newer rotated session when an older failed refresh finishes teardown', async () => {
    const rotatedExpirySeconds = Math.floor(Date.now() / 1000) + 3600
    const rotatedToken = makeJwtWithClaims(
      rotatedExpirySeconds,
      'rotated-user',
      'rotated@example.com',
    )
    let storedToken: string | null = 'expired-token'
    let storedRefreshToken: string | null = 'refresh-token'
    let releaseTeardown!: () => void

    getRefreshTokenMock.mockResolvedValue('refresh-token')
    setTokenMock.mockImplementation((token: string) => {
      storedToken = token
      return Promise.resolve()
    })
    setRefreshTokenMock.mockImplementation((token: string) => {
      storedRefreshToken = token
      return Promise.resolve()
    })
    clearAllTokensMock.mockImplementation(() => {
      storedToken = null
      storedRefreshToken = null
      return Promise.resolve()
    })
    clearPersistedQueryCacheMock
      .mockImplementationOnce(
        () => new Promise<void>((resolve) => { releaseTeardown = resolve }),
      )
      .mockResolvedValue(undefined)
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(Response.json({
        token: rotatedToken,
        refreshToken: 'next-refresh',
      }))
    useAuthStore.setState({
      sessionPhase: 'signed-in',
      isAuthenticated: true,
      user: { userId: 'user-1', email: 'user@example.com', name: 'User' },
      isLoading: false,
      expiresAt: Date.now() - 1000,
    })

    const failedRefresh = refreshSession()
    await vi.waitFor(() => expect(releaseTeardown).toBeTypeOf('function'))

    const successfulRefresh = refreshSession()
    await expect(successfulRefresh).resolves.toEqual({
      status: 'refreshed',
      token: rotatedToken,
    })
    releaseTeardown()
    await expect(failedRefresh).resolves.toEqual({ status: 'unauthorized' })

    expect(storedToken).toBe(rotatedToken)
    expect(storedRefreshToken).toBe('next-refresh')
    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: true,
      user: { userId: 'user-1' },
      expiresAt: rotatedExpirySeconds * 1000,
    })
  })

  it('serializes credential deletion with a newer rotation write', async () => {
    const rotatedExpirySeconds = Math.floor(Date.now() / 1000) + 3600
    const rotatedToken = makeJwtWithClaims(
      rotatedExpirySeconds,
      'rotated-user',
      'rotated@example.com',
    )
    let storedToken: string | null = 'expired-token'
    let storedRefreshToken: string | null = 'refresh-token'
    let signalDeletionStarted!: () => void
    let releaseDeletion!: () => void
    const deletionStarted = new Promise<void>((resolve) => { signalDeletionStarted = resolve })
    const deletionReleased = new Promise<void>((resolve) => { releaseDeletion = resolve })

    getRefreshTokenMock.mockResolvedValue('refresh-token')
    setTokenMock.mockImplementation((token: string) => {
      storedToken = token
      return Promise.resolve()
    })
    setRefreshTokenMock.mockImplementation((token: string) => {
      storedRefreshToken = token
      return Promise.resolve()
    })
    clearAllTokensMock.mockImplementation(async () => {
      signalDeletionStarted()
      await deletionReleased
      storedToken = null
      storedRefreshToken = null
    })
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(Response.json({
        token: rotatedToken,
        refreshToken: 'next-refresh',
      }))
    useAuthStore.setState({
      sessionPhase: 'signed-in',
      isAuthenticated: true,
      user: { userId: 'user-1', email: 'user@example.com', name: 'User' },
      isLoading: false,
      expiresAt: Date.now() - 1000,
    })

    const rejectedRefresh = refreshSession()
    await deletionStarted
    const successfulRefresh = refreshSession()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    try {
      expect(setTokenMock).not.toHaveBeenCalled()
    } finally {
      releaseDeletion()
      await Promise.all([rejectedRefresh, successfulRefresh])
    }

    expect(storedToken).toBe(rotatedToken)
    expect(storedRefreshToken).toBe('next-refresh')
    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: true,
      user: { userId: 'user-1' },
      expiresAt: rotatedExpirySeconds * 1000,
    })
  })

  it('clears the session when refreshSession finds no stored refresh token', async () => {
    getRefreshTokenMock.mockResolvedValue(null)

    const outcome = await refreshSession()

    expect(outcome).toEqual({ status: 'unauthorized' })
    expect(clearAllTokensMock).toHaveBeenCalledTimes(1)
  })

  it('completes logout after push unsubscribe refreshes the same session', async () => {
    const refreshedToken = makeJwtWithClaims(
      Math.floor(Date.now() / 1000) + 3600,
      'user-1',
      'user@example.com',
    )
    getRefreshTokenMock.mockResolvedValue('refresh-token')
    fetchMock.mockResolvedValue(Response.json({
      token: refreshedToken,
      refreshToken: 'next-refresh',
    }))
    unsubscribePushTokenMock.mockImplementation(async () => {
      await refreshSession()
    })
    useAuthStore.setState({
      sessionPhase: 'signed-in',
      isAuthenticated: true,
      user: { userId: 'user-1', email: 'user@example.com', name: 'User' },
      isLoading: false,
      expiresAt: Date.now() + 60_000,
    })

    await expect(useAuthStore.getState().logout()).resolves.toBe(true)

    expect(clearAllTokensMock).toHaveBeenCalledTimes(1)
    expect(queryClientClearMock).toHaveBeenCalledTimes(1)
    expect(useAuthStore.getState()).toMatchObject({
      sessionPhase: 'signed-out',
      isAuthenticated: false,
      user: null,
    })
  })

  it('preserves tokens when refreshSession has no refresh token but clearOnFailure is false', async () => {
    getRefreshTokenMock.mockResolvedValue(null)

    const outcome = await refreshSession({ clearOnFailure: false })

    expect(outcome).toEqual({ status: 'unauthorized' })
    expect(clearAllTokensMock).not.toHaveBeenCalled()
  })

  it('treats a non-TypeError network message as transient and keeps the session', async () => {
    getRefreshTokenMock.mockResolvedValue('refresh-token')
    fetchMock.mockRejectedValue(new Error('Network error while fetching'))

    const outcome = await refreshSession()

    expect(outcome).toEqual({ status: 'network-error' })
    expect(clearAllTokensMock).not.toHaveBeenCalled()
  })

  it('treats a thrown non-Error as unauthorized and clears the session', async () => {
    getRefreshTokenMock.mockResolvedValue('refresh-token')
    fetchMock.mockRejectedValue('socket exploded')

    const outcome = await refreshSession()

    expect(outcome).toEqual({ status: 'unauthorized' })
    expect(clearAllTokensMock).toHaveBeenCalledTimes(1)
  })

  it('returns false from checkAuth when an expired token cannot be refreshed', async () => {
    getTokenMock.mockResolvedValue(makeJwt(Math.floor(Date.now() / 1000) - 10))
    getRefreshTokenMock.mockResolvedValue(null)
    markStepUpVerified('keys')

    const isValid = await useAuthStore.getState().checkAuth()

    expect(isValid).toBe(false)
    expect(isStepUpVerified('keys')).toBe(false)
  })

  it('refreshes an expired token in checkAuth and authenticates with the rotated token', async () => {
    const rotatedToken = makeJwtWithClaims(Math.floor(Date.now() / 1000) + 3600, 'refreshed-user', 'refreshed@example.com')
    getTokenMock.mockResolvedValue(makeJwt(Math.floor(Date.now() / 1000) - 10))
    getRefreshTokenMock.mockResolvedValue('refresh-token')
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ token: rotatedToken, refreshToken: 'next-refresh' }),
    })

    const isValid = await useAuthStore.getState().checkAuth()

    expect(isValid).toBe(true)
    expect(setQueryCacheScopeMock).toHaveBeenCalledWith('refreshed-user')
    expect(useAuthStore.getState().user).toMatchObject({ userId: 'refreshed-user' })
  })

  it('treats a token with an unparseable payload as expired', async () => {
    getTokenMock.mockResolvedValue('header.@@not-base64@@.sig')
    getRefreshTokenMock.mockResolvedValue(null)

    const isValid = await useAuthStore.getState().checkAuth()

    expect(isValid).toBe(false)
  })

  it('marks the session unauthenticated when initialize finds no token', async () => {
    getTokenMock.mockResolvedValue(null)
    markStepUpVerified('keys')

    await useAuthStore.getState().initialize()

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: false,
      user: null,
      isLoading: false,
    })
    expect(isStepUpVerified('keys')).toBe(false)
  })

  it('recovers to a signed-out state when initialize throws while reading the token', async () => {
    getTokenMock.mockRejectedValue(new Error('secure store unavailable'))

    await useAuthStore.getState().initialize()

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: false,
      user: null,
      isLoading: false,
    })
  })

  it('hydrates the cached profile and merges its name and email after initialize', async () => {
    getTokenMock.mockResolvedValue(makeJwtWithClaims(Math.floor(Date.now() / 1000) + 3600, 'user-1', 'stale@example.com'))
    getRefreshTokenMock.mockResolvedValue('refresh-token')
    apiClientMock.mockResolvedValue({
      name: 'Fresh Name',
      email: 'fresh@example.com',
      language: 'pt-BR',
      colorScheme: 'ocean',
      themePreference: 'dark',
    })

    await useAuthStore.getState().initialize()
    await whenProfileHydrated()

    expect(useAuthStore.getState().user).toMatchObject({
      name: 'Fresh Name',
      email: 'fresh@example.com',
    })
  })

  it('calls the logout endpoint when a refresh token is present', async () => {
    getRefreshTokenMock.mockResolvedValue('refresh-token')
    useAuthStore.setState({
      isAuthenticated: true,
      user: { userId: 'user-1', email: 'user@example.com', name: 'User' },
      isLoading: false,
      expiresAt: Date.now() + 3600_000,
    })

    await useAuthStore.getState().logout()

    expect(apiClientMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('does not carry API key visibility into a replacement account', async () => {
    await useAuthStore.getState().login('account-a-token', null, {
      userId: 'account-a',
      email: 'account-a@example.com',
      name: 'Account A',
    })
    markStepUpVerified('keys')

    await useAuthStore.getState().logout()
    await useAuthStore.getState().login('account-b-token', null, {
      userId: 'account-b',
      email: 'account-b@example.com',
      name: 'Account B',
    })

    expect(isStepUpVerified('keys')).toBe(false)
  })

  it('does not carry delayed notification deletes into a replacement account', async () => {
    vi.useFakeTimers()
    const failedDelete = vi.fn(() => { throw new Error('Server error') })
    let rejectActiveDelete!: (error: Error) => void
    const activeDeleteRequest = new Promise<never>((_resolve, reject) => {
      rejectActiveDelete = reject
    })
    const deleteMutation = useDeleteNotification() as unknown as {
      mutationFn: (notificationId: string) => Promise<unknown>
      onMutate: (notificationId: string) => Promise<{
        previous: NotificationsResponse | undefined
        sessionEpoch: number
      }>
      onError: (error: Error, notificationId: string, context: {
        previous: NotificationsResponse | undefined
        sessionEpoch: number
      }) => void
      onSettled: (
        data: unknown,
        error: Error | null,
        notificationId: string,
        context: { previous: NotificationsResponse | undefined; sessionEpoch: number },
      ) => void
    }
    const executeActiveDelete = async () => {
      const context = await deleteMutation.onMutate('active-notification')
      try {
        const result = await activeDeleteRequest
        deleteMutation.onSettled(result, null, 'active-notification', context)
      } catch (error: unknown) {
        deleteMutation.onError(error as Error, 'active-notification', context)
        deleteMutation.onSettled(undefined, error as Error, 'active-notification', context)
        throw error
      }
    }
    const pendingDelete = vi.fn()
    const accountANotifications: NotificationsResponse = {
      items: [{
        id: 'active-notification',
        title: 'Account A',
        body: 'Account A body',
        url: null,
        habitId: null,
        isRead: false,
        createdAtUtc: '2025-01-01T00:00:00Z',
      }],
      unreadCount: 1,
    }
    const accountBNotifications: NotificationsResponse = {
      items: [{
        id: 'account-b-notification',
        title: 'Account B',
        body: 'Account B body',
        url: null,
        habitId: null,
        isRead: false,
        createdAtUtc: '2025-01-02T00:00:00Z',
      }],
      unreadCount: 1,
    }
    try {
      await useAuthStore.getState().login('account-a-token', null, {
        userId: 'account-a',
        email: 'account-a@example.com',
        name: 'Account A',
      })
      setQueryDataMock(notificationKeys.lists(), accountANotifications)
      queuePendingNotificationDelete('failed-notification', failedDelete)
      queuePendingNotificationDelete('active-notification', executeActiveDelete)
      await vi.advanceTimersByTimeAsync(5000)
      queuePendingNotificationDelete('pending-notification', pendingDelete)
      expect(getFailedNotificationDeleteIdsSnapshot()).toEqual(['failed-notification'])

      await useAuthStore.getState().logout()
      await useAuthStore.getState().login('account-b-token', null, {
        userId: 'account-b',
        email: 'account-b@example.com',
        name: 'Account B',
      })
      setQueryDataMock(notificationKeys.lists(), accountBNotifications)
      setQueryDataMock.mockClear()
      invalidateQueriesMock.mockClear()
      rejectActiveDelete(new Error('Late server error'))
      await Promise.resolve()
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(5000)

      expect(getPendingNotificationDeleteIdsSnapshot()).toEqual([])
      expect(getFailedNotificationDeleteIdsSnapshot()).toEqual([])
      expect(retryFailedNotificationDelete('failed-notification')).toBe(false)
      expect(retryFailedNotificationDelete('active-notification')).toBe(false)
      expect(failedDelete).toHaveBeenCalledTimes(1)
      expect(pendingDelete).not.toHaveBeenCalled()
      expect(getQueryDataMock(notificationKeys.lists())).toEqual(accountBNotifications)
      expect(setQueryDataMock).not.toHaveBeenCalled()
      expect(invalidateQueriesMock).not.toHaveBeenCalled()
    } finally {
      resetPendingNotificationDeletesForTests()
      vi.useRealTimers()
    }
  })

  it('drops a previous account pending delete when a login follows no teardown', async () => {
    vi.useFakeTimers()
    const staleDelete = vi.fn(() => Promise.resolve())
    try {
      queuePendingNotificationDelete('account-a-notification', staleDelete)
      expect(getPendingNotificationDeleteIdsSnapshot()).toEqual(['account-a-notification'])

      await useAuthStore.getState().login('account-b-token', null, {
        userId: 'account-b',
        email: 'account-b@example.com',
        name: 'Account B',
      })

      expect(getPendingNotificationDeleteIdsSnapshot()).toEqual([])
      await vi.advanceTimersByTimeAsync(5000)
      expect(staleDelete).not.toHaveBeenCalled()
    } finally {
      resetPendingNotificationDeletesForTests()
      vi.useRealTimers()
    }
  })

  it('applies the profile language and theme during login hydration', async () => {
    apiClientMock.mockResolvedValue({
      name: 'Login Name',
      email: 'login@example.com',
      language: 'pt-BR',
      colorScheme: 'ocean',
      themePreference: 'light',
    })

    await useAuthStore.getState().login('access-token', 'refresh-token', {
      userId: 'user-1',
      email: 'user@example.com',
      name: 'User',
    })

    expect(useAuthStore.getState().user).toMatchObject({
      name: 'Login Name',
      email: 'login@example.com',
    })
  })

  it('does not publish an old profile after a replacement login scopes the cache', async () => {
    const oldUser = { userId: 'old-user', email: 'old@example.com', name: 'Old' }
    const newUser = { userId: 'new-user', email: 'new@example.com', name: 'New' }
    const oldProfile = { name: 'Old', email: oldUser.email, language: 'pt-BR', colorScheme: 'rose', themePreference: 'light' }
    const newProfile = { name: 'New', email: newUser.email, language: 'en', colorScheme: 'blue', themePreference: 'dark' }
    let releaseOldProfile!: (profile: typeof oldProfile) => void
    apiClientMock
      .mockImplementationOnce(() => new Promise<typeof oldProfile>((resolve) => { releaseOldProfile = resolve }))
      .mockResolvedValueOnce(newProfile)

    const oldLogin = useAuthStore.getState().login('old-token', 'old-refresh', oldUser)
    await vi.waitFor(() => expect(releaseOldProfile).toBeTypeOf('function'))
    await useAuthStore.getState().login('new-token', 'new-refresh', newUser)
    releaseOldProfile(oldProfile)
    await oldLogin

    expect(setQueryDataMock).toHaveBeenCalledTimes(1)
    expect(setQueryDataMock).toHaveBeenCalledWith(profileKeys.detail(), newProfile)
    expect(i18n.language).toBe('en')
    expect(getRuntimeTheme()).toMatchObject({ scheme: 'blue', themeMode: 'dark' })
    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: true, user: newUser })
  })

  it('refuses a rejected refresh logout after a replacement login', async () => {
    const oldUser = { userId: 'old-user', email: 'old@example.com', name: 'Old' }
    const newUser = { userId: 'new-user', email: 'new@example.com', name: 'New' }
    await useAuthStore.getState().login('old-token', 'old-refresh', oldUser)
    const oldOwnership = getSessionGeneration()
    await useAuthStore.getState().login('new-token', 'new-refresh', newUser)

    const logoutAndRedirect = renderHookValue(() => useLogout())
    await logoutAndRedirect(oldOwnership)

    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: true, user: newUser })
    expect(replaceMock).not.toHaveBeenCalled()
    expect(clearAllTokensMock).not.toHaveBeenCalled()
    expect(apiClientMock).not.toHaveBeenCalledWith(API.auth.logout, expect.anything())
  })
})

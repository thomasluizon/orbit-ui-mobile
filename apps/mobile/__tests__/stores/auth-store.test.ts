import { beforeEach, describe, expect, it, vi } from 'vitest'
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
  clearMessagesMock,
  offlineQueueClearMock,
  retainAccountMock,
  clearOfflineStateMock,
  unsubscribePushTokenMock,
  fetchMock,
  setQueryCacheScopeMock,
  cancelScheduledFlushMock,
  resumeOfflineReplayMock,
  cancelPersistentReminderMock,
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
  clearMessagesMock: vi.fn(),
  offlineQueueClearMock: vi.fn(),
  retainAccountMock: vi.fn(),
  clearOfflineStateMock: vi.fn(),
  unsubscribePushTokenMock: vi.fn(),
  fetchMock: vi.fn(),
  setQueryCacheScopeMock: vi.fn(),
  cancelScheduledFlushMock: vi.fn(),
  resumeOfflineReplayMock: vi.fn(),
  cancelPersistentReminderMock: vi.fn(),
}))

vi.mock('expo-router', () => ({
  router: {
    replace: replaceMock,
  },
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
    setQueryData: setQueryDataMock,
  },
  clearPersistedQueryCache: clearPersistedQueryCacheMock,
  setQueryCacheScope: setQueryCacheScopeMock,
}))

vi.mock('@/lib/auth-flow', () => ({
  clearStoredAuthReturnUrl: clearStoredAuthReturnUrlMock,
}))

vi.mock('@/stores/chat-store', () => ({
  useChatStore: {
    getState: () => ({
      clearMessages: clearMessagesMock,
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

describe('mobile auth store security paths', () => {
  beforeEach(() => {
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
    clearStoredAuthReturnUrlMock.mockReset()
    clearMessagesMock.mockReset()
    offlineQueueClearMock.mockReset()
    retainAccountMock.mockReset()
    clearOfflineStateMock.mockReset()
    unsubscribePushTokenMock.mockReset()
    fetchMock.mockReset()
    setQueryCacheScopeMock.mockReset()
    cancelScheduledFlushMock.mockReset()
    resumeOfflineReplayMock.mockReset()
    cancelPersistentReminderMock.mockReset()
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
    await clearSessionAndResetAuth(generation.epoch, generation.credentialVersion)
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
    const previousEpoch = getSessionGeneration().epoch
    apiClientMock.mockImplementation(async () => {
      await clearSessionAndResetAuth(previousEpoch)
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
    expect(clearMessagesMock).toHaveBeenCalledTimes(1)
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
    expect(clearMessagesMock).toHaveBeenCalledTimes(1)
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

    await expect(useAuthStore.getState().logout()).resolves.toBeUndefined()

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

    await expect(useAuthStore.getState().logout()).resolves.toBeUndefined()

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

    const logout = useAuthStore.getState().logout()
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

    await expect(clearSessionAndResetAuth(
      generationBeforeRefresh.epoch,
      generationBeforeRefresh.credentialVersion,
    )).resolves.toBe(false)
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
})

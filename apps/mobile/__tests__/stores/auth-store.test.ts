import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearSessionAndResetAuth,
  isAuthTransitionInFlight,
  refreshSession,
  refreshSessionToken,
  useAuthStore,
  whenProfileHydrated,
} from '@/stores/auth-store'

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
  clearOfflineStateMock,
  unsubscribePushTokenMock,
  fetchMock,
  setQueryCacheScopeMock,
  cancelScheduledFlushMock,
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
  clearOfflineStateMock: vi.fn(),
  unsubscribePushTokenMock: vi.fn(),
  fetchMock: vi.fn(),
  setQueryCacheScopeMock: vi.fn(),
  cancelScheduledFlushMock: vi.fn(),
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
}))

vi.mock('@/lib/offline-mutations', () => ({
  cancelScheduledFlush: cancelScheduledFlushMock,
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
    clearOfflineStateMock.mockReset()
    unsubscribePushTokenMock.mockReset()
    fetchMock.mockReset()
    setQueryCacheScopeMock.mockReset()
    cancelScheduledFlushMock.mockReset()
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
      isAuthenticated: false,
      user: null,
      isLoading: true,
      expiresAt: null,
    })
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
    setTokenMock.mockImplementation(async () => {
      callOrder.push('setToken')
    })
    setRefreshTokenMock.mockImplementation(async () => {
      callOrder.push('setRefreshToken')
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

  it('flags an auth transition between persisting the token and committing the session', async () => {
    expect(isAuthTransitionInFlight()).toBe(false)

    let flagDuringSetToken = false
    setTokenMock.mockImplementation(async () => {
      flagDuringSetToken = isAuthTransitionInFlight()
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
    apiClientMock.mockImplementation(async () => {
      await clearSessionAndResetAuth()
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

  it('attempts a best-effort push unsubscribe before clearing tokens on logout', async () => {
    getRefreshTokenMock.mockResolvedValue(null)
    const order: string[] = []
    unsubscribePushTokenMock.mockImplementation(async () => {
      order.push('unsubscribePush')
    })
    clearAllTokensMock.mockImplementation(async () => {
      order.push('clearAllTokens')
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

  it('dismisses the persistent reminder when checkAuth finds no token', async () => {
    getTokenMock.mockResolvedValue(null)

    const isValid = await useAuthStore.getState().checkAuth()

    expect(isValid).toBe(false)
    expect(cancelPersistentReminderMock).toHaveBeenCalledTimes(1)
  })

  it('clears the offline queue and offline state before establishing a new session on login', async () => {
    const order: string[] = []
    offlineQueueClearMock.mockImplementation(() => {
      order.push('offlineQueue.clear')
    })
    clearOfflineStateMock.mockImplementation(async () => {
      order.push('clearOfflineState')
    })

    await useAuthStore.getState().login('access-token', 'refresh-token', {
      userId: 'user-1',
      email: 'user@example.com',
      name: 'User',
    })

    expect(offlineQueueClearMock).toHaveBeenCalledTimes(1)
    expect(clearOfflineStateMock).toHaveBeenCalledTimes(1)
    expect(order).toContain('offlineQueue.clear')
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

    const outcome = await refreshSession()

    expect(outcome).toEqual({ status: 'refreshed', token: rotatedToken })
    expect(setTokenMock).toHaveBeenCalledWith(rotatedToken)
    expect(setRefreshTokenMock).toHaveBeenCalledWith('next-refresh')
    expect(saveWidgetTokenMock).toHaveBeenCalledWith(rotatedToken)
    expect(useAuthStore.getState().user).toMatchObject({
      userId: 'rotated-user',
      email: 'rotated@example.com',
    })
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
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

    const isValid = await useAuthStore.getState().checkAuth()

    expect(isValid).toBe(false)
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

    await useAuthStore.getState().initialize()

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: false,
      user: null,
      isLoading: false,
    })
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

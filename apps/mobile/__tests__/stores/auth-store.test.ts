import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  clearStoredAuthReturnUrlMock,
  clearMessagesMock,
  fetchMock,
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
  clearStoredAuthReturnUrlMock: vi.fn(),
  clearMessagesMock: vi.fn(),
  fetchMock: vi.fn(),
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

vi.mock('@/lib/api-client', () => ({
  apiClient: apiClientMock,
}))

vi.mock('@/lib/query-client', () => ({
  queryClient: {
    clear: queryClientClearMock,
  },
  clearPersistedQueryCache: clearPersistedQueryCacheMock,
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

import { refreshSessionToken, useAuthStore } from '@/stores/auth-store'

function makeJwt(expirySeconds: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' }), 'utf8').toString('base64')
  const payload = Buffer.from(JSON.stringify({ exp: expirySeconds }), 'utf8').toString('base64')
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
    fetchMock.mockReset()

    clearWidgetTokenMock.mockResolvedValue(undefined)
    saveWidgetTokenMock.mockResolvedValue(undefined)
    clearPersistedQueryCacheMock.mockResolvedValue(undefined)
    clearStoredAuthReturnUrlMock.mockResolvedValue(undefined)
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

  it('resets local auth state when profile refresh returns unauthorized', async () => {
    const validToken = makeJwt(Math.floor(Date.now() / 1000) + 3600)
    getTokenMock.mockResolvedValueOnce(validToken)
    getTokenMock.mockResolvedValueOnce(null)
    getRefreshTokenMock.mockResolvedValue('refresh-token')
    apiClientMock.mockRejectedValue(new Error('Unauthorized'))

    await useAuthStore.getState().initialize()

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
})

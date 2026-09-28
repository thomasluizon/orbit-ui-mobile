import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryObserver } from '@tanstack/query-core'
import { queryClient } from '@/lib/query-client'
import { useAuthStore } from '@/stores/auth-store'
import { getRefreshToken } from '@/lib/secure-store'
import { API } from '@orbit/shared/api'
import { apiClient as storeApiClient } from '@/lib/api-client'
import { startAccountScopedSession } from '@/lib/account-scoped-state'

vi.mock('@/lib/secure-store', () => ({
  getToken: vi.fn(() => Promise.resolve(null)),
  setToken: vi.fn(async () => {}),
  setRefreshToken: vi.fn(async () => {}),
  clearRefreshToken: vi.fn(async () => {}),
  clearAllTokens: vi.fn(async () => {}),
  getRefreshToken: vi.fn(() => Promise.resolve(null)),
}))
vi.mock('@/lib/orbit-widget', () => ({
  clearWidgetToken: vi.fn(async () => {}),
  saveWidgetToken: vi.fn(async () => {}),
}))
vi.mock('@/lib/persistent-reminder', () => ({ cancelPersistentReminder: vi.fn(async () => {}) }))
vi.mock('@/lib/app-version', () => ({ buildAppVersionHeaders: vi.fn(() => ({})) }))
vi.mock('expo-router', () => ({ router: { replace: vi.fn() } }))
vi.mock('@/lib/api-client', () => ({ apiClient: vi.fn(() => Promise.reject(new Error('profile unavailable'))) }))
vi.mock('@/lib/offline-queue', () => ({ clear: vi.fn() }))
vi.mock('@/lib/offline-mutations', () => ({ cancelScheduledFlush: vi.fn() }))
vi.mock('@/lib/offline-state', () => ({ clearOfflineState: vi.fn(async () => {}) }))
vi.mock('@/hooks/use-push-notifications', () => ({ unsubscribePushToken: vi.fn(async () => {}) }))
vi.mock('@/lib/account-scoped-state', () => ({ startAccountScopedSession: vi.fn(async () => {}) }))
vi.mock('@/lib/auth-flow', () => ({ clearStoredAuthReturnUrl: vi.fn(async () => {}) }))
vi.mock('@/lib/posthog', () => ({ identifyPostHogUser: vi.fn(), resetPostHogUser: vi.fn() }))
vi.mock('@/stores/chat-store', () => ({
  useChatStore: { getState: () => ({ clearMessages: vi.fn() }) },
}))

describe('Android account boundary queries', () => {
  beforeEach(() => {
    queryClient.clear()
    vi.mocked(getRefreshToken).mockResolvedValue(null)
    vi.mocked(storeApiClient).mockClear()
    vi.mocked(startAccountScopedSession).mockReset()
    vi.mocked(startAccountScopedSession).mockResolvedValue()
    useAuthStore.setState({
      sessionPhase: 'signed-out',
      isAuthenticated: false,
      user: null,
      isLoading: false,
      expiresAt: null,
    })
  })

  it.each(['login', 'logout'] as const)('settles a mounted observer across %s', async (boundary) => {
    if (boundary === 'logout') {
      useAuthStore.setState({
        sessionPhase: 'signed-in',
        isAuthenticated: true,
        user: { userId: 'account-a', email: 'a@example.com', name: 'A' },
      })
    }
    let answer: (value: string) => void = () => {}
    const previousAnswer = new Promise<string>((resolve) => { answer = resolve })
    const queryFn = vi.fn()
      .mockImplementationOnce(() => previousAnswer)
      .mockResolvedValueOnce('current account')
    const observer = new QueryObserver(queryClient, { queryKey: ['boundary-test'], queryFn })
    const unsubscribe = observer.subscribe(() => {})
    try {
      expect(observer.getCurrentResult().fetchStatus).toBe('fetching')
      if (boundary === 'login') {
        await useAuthStore.getState().login('access-token', null, {
          userId: 'account-b', email: 'b@example.com', name: 'B',
        })
      } else {
        await useAuthStore.getState().logout()
      }
      answer('previous account')
      if (boundary === 'login') {
        await vi.waitFor(() => expect(observer.getCurrentResult()).toMatchObject({
          status: 'success', fetchStatus: 'idle', data: 'current account',
        }))
        expect(queryFn).toHaveBeenCalledTimes(2)
      } else {
        expect(observer.getCurrentResult()).toMatchObject({
          status: 'pending', fetchStatus: 'idle', data: undefined,
        })
        expect(queryFn).toHaveBeenCalledTimes(1)
      }
    } finally {
      unsubscribe()
      queryClient.clear()
    }
  })

  it('revokes the refresh token once when a mounted query would answer 401 during logout', async () => {
    useAuthStore.setState({
      sessionPhase: 'signed-in',
      isAuthenticated: true,
      user: { userId: 'account-a', email: 'a@example.com', name: 'A' },
    })
    vi.mocked(getRefreshToken).mockResolvedValue('refresh-token')
    const { apiClient } = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client')
    let profileRequests = 0
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith(API.profile.get) && ++profileRequests > 1) {
        return Promise.resolve(new Response('"current account"', { status: 200 }))
      }
      return Promise.resolve(new Response(null, { status: 401 }))
    })
    vi.stubGlobal('fetch', fetchMock)

    let releaseInitial: (value: string) => void = () => {}
    const initialRequest = new Promise<string>((resolve) => { releaseInitial = resolve })
    const queryFn = vi.fn()
      .mockImplementationOnce(() => initialRequest)
      .mockImplementation(() => apiClient(API.profile.get))
    const observer = new QueryObserver(queryClient, { queryKey: ['logout-401'], queryFn })
    const unsubscribe = observer.subscribe(() => {})
    let releaseScopeClear: () => void = () => {}
    const scopeClear = new Promise<void>((resolve) => { releaseScopeClear = resolve })
    vi.mocked(startAccountScopedSession).mockImplementationOnce(() => scopeClear)
    try {
      const logout = useAuthStore.getState().logout()
      await vi.waitFor(() => expect(startAccountScopedSession).toHaveBeenCalled())
      await new Promise((resolve) => setTimeout(resolve, 120))
      releaseScopeClear()
      await logout
      releaseInitial('previous account')
      expect(vi.mocked(storeApiClient).mock.calls.filter(([path]) => path === API.auth.logout)).toHaveLength(1)
      expect(queryFn).toHaveBeenCalledTimes(1)
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      releaseScopeClear()
      unsubscribe()
      queryClient.clear()
      vi.unstubAllGlobals()
    }
  })
})

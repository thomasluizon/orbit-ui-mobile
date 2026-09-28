import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryObserver } from '@tanstack/query-core'
import { queryClient } from '@/lib/query-client'
import { useAuthStore } from '@/stores/auth-store'

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
      await vi.waitFor(() => expect(observer.getCurrentResult()).toMatchObject({
        status: 'success', fetchStatus: 'idle', data: 'current account',
      }))
      expect(queryFn).toHaveBeenCalledTimes(2)
    } finally {
      unsubscribe()
      queryClient.clear()
    }
  })
})

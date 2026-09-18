import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/stores/auth-store'
import { getSessionEpoch } from '@/lib/session-epoch'
import { useChatStore } from '@/stores/chat-store'
import type { LoginResponse } from '@orbit/shared/types/auth'
import type { ChatMessage } from '@orbit/shared/types/chat'
import { CHAT_DRAFT_STORAGE_KEY } from '@orbit/shared/hooks'
import { clearStepUpState, isStepUpVerified, markStepUpVerified } from '@/lib/step-up-storage'
import {
  getFailedNotificationDeleteIdsSnapshot,
  getPendingNotificationDeleteIdsSnapshot,
  queuePendingNotificationDelete,
  resetPendingNotificationDeletesForTests,
  retryFailedNotificationDelete,
} from '@/lib/pending-notification-deletes'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('auth store', () => {
  beforeEach(() => {
    resetPendingNotificationDeletesForTests()
    clearStepUpState()
    useAuthStore.setState({
      isAuthenticated: false,
      user: null,
      expiresAt: null,
      sessionRefreshFailed: false,
    })
    mockFetch.mockReset()
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ expiresAt: null }),
    })
  })

  afterEach(() => {
    globalThis.localStorage.removeItem(CHAT_DRAFT_STORAGE_KEY)
    useChatStore.setState({
      messages: [],
      isTyping: false,
      streamingMessageId: null,
      draft: '',
      draftRevision: 0,
      draftHydrated: false,
      contextualSuggestion: null,
    })
  })

  function makeLoginResponse(overrides: Partial<LoginResponse> = {}): LoginResponse {
    return {
      userId: 'user-1',
      name: 'Thomas',
      email: 'thomas@example.com',
      ...overrides,
    }
  }

  function makeChatMessage(): ChatMessage {
    return {
      id: 'message-1',
      role: 'user',
      content: 'Remind me about the gym tonight',
      timestamp: new Date('2025-01-01T12:00:00Z'),
    }
  }

  const accountANotificationList = {
    items: [{ id: 'account-a-notification', title: 'Account A reminder' }],
    unreadCount: 1,
  }

  it('starts unauthenticated', () => {
    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(false)
    expect(state.user).toBeNull()
    expect(state.expiresAt).toBeNull()
  })

  it('sets authenticated state from LoginResponse', () => {
    useAuthStore.getState().setAuth(makeLoginResponse())

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: true,
      user: {
        userId: 'user-1',
        name: 'Thomas',
        email: 'thomas@example.com',
      },
    })
  })

  it('logs out and calls the BFF logout endpoint', async () => {
    mockFetch.mockResolvedValue({ ok: true })
    useAuthStore.getState().setAuth(makeLoginResponse())

    await useAuthStore.getState().logout()

    expect(mockFetch).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' })
    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: false,
      user: null,
      expiresAt: null,
      sessionRefreshFailed: false,
    })
  })

  it('removes the stored Astra draft when the account signs out', async () => {
    mockFetch.mockResolvedValue({ ok: true })
    useAuthStore.getState().setAuth(makeLoginResponse())
    useChatStore.getState().setDraft('cancel my 9pm meds reminder')
    useChatStore.getState().hydrateDraft('cancel my 9pm meds reminder')
    globalThis.localStorage.setItem(CHAT_DRAFT_STORAGE_KEY, 'cancel my 9pm meds reminder')

    await useAuthStore.getState().logout()

    expect(globalThis.localStorage.getItem(CHAT_DRAFT_STORAGE_KEY)).toBeNull()
    expect(useChatStore.getState().draft).toBe('')
    expect(useChatStore.getState().draftHydrated).toBe(false)
  })

  it('marks the session as signed out after confirming a refresh rejection', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ expiresAt: null, refreshFailed: true }),
    })
    useAuthStore.getState().setAuth(makeLoginResponse())

    await useAuthStore.getState().confirmSessionRefreshFailure()

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: false,
      user: null,
      expiresAt: null,
      sessionRefreshFailed: true,
    })
  })

  it('does not carry API key visibility into a replacement account', async () => {
    useAuthStore.getState().setAuth(makeLoginResponse({ userId: 'account-a' }))
    markStepUpVerified('keys')

    await useAuthStore.getState().logout()
    useAuthStore.getState().setAuth(makeLoginResponse({ userId: 'account-b' }))

    expect(isStepUpVerified('keys')).toBe(false)
  })

  it('does not carry a failed notification delete into a replacement account', async () => {
    vi.useFakeTimers()
    const executeDelete = vi.fn(() => { throw new Error('Server error') })
    try {
      useAuthStore.getState().setAuth(makeLoginResponse({ userId: 'account-a' }))
      queuePendingNotificationDelete('account-a-notification', executeDelete)
      vi.advanceTimersByTime(5000)
      expect(getFailedNotificationDeleteIdsSnapshot()).toEqual(['account-a-notification'])

      await useAuthStore.getState().logout()
      useAuthStore.getState().setAuth(makeLoginResponse({ userId: 'account-b' }))

      expect(getFailedNotificationDeleteIdsSnapshot()).toEqual([])
      expect(retryFailedNotificationDelete('account-a-notification')).toBe(false)
      expect(executeDelete).toHaveBeenCalledTimes(1)
    } finally {
      resetPendingNotificationDeletesForTests()
      vi.useRealTimers()
    }
  })

  it('updates expiresAt from the session response', async () => {
    const expiresAt = Date.now() + 3600000
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ expiresAt }),
    })
    useAuthStore.getState().setAuth(makeLoginResponse())

    await useAuthStore.getState().checkSession()

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: true,
      expiresAt,
      sessionRefreshFailed: false,
    })
  })

  it('clears auth state when the session response has no active expiry', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ expiresAt: null }),
    })
    useAuthStore.getState().setAuth(makeLoginResponse())
    markStepUpVerified('keys')

    await useAuthStore.getState().checkSession()

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: false,
      user: null,
      expiresAt: null,
      sessionRefreshFailed: false,
    })
    expect(isStepUpVerified('keys')).toBe(false)
  })

  it('keeps the current state on network errors', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))
    useAuthStore.getState().setAuth(makeLoginResponse())

    await useAuthStore.getState().checkSession()

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: true,
      user: expect.objectContaining({ userId: 'user-1' }),
    })
  })

  it('clears the session on a 401 response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ expiresAt: null, refreshFailed: true }),
    })
    useAuthStore.getState().setAuth(makeLoginResponse())
    markStepUpVerified('keys')

    await useAuthStore.getState().checkSession()

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: false,
      user: null,
      expiresAt: null,
      sessionRefreshFailed: true,
    })
    expect(isStepUpVerified('keys')).toBe(false)
  })

  it('keeps the current state on a transient server error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ expiresAt: null }),
    })
    useAuthStore.getState().setAuth(makeLoginResponse())

    await useAuthStore.getState().checkSession()

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: true,
      user: expect.objectContaining({ userId: 'user-1' }),
    })
  })

  describe('startExpiryMonitor', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('returns a cleanup function and checks the session immediately', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ expiresAt: Date.now() + 3600000 }),
      })
      useAuthStore.getState().setAuth(makeLoginResponse())

      const cleanup = useAuthStore.getState().startExpiryMonitor()
      await vi.runOnlyPendingTimersAsync()

      expect(typeof cleanup).toBe('function')
      expect(mockFetch).toHaveBeenCalledWith('/api/auth/session')
      cleanup()
    })

    it('polls the session endpoint every minute while authenticated', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ expiresAt: Date.now() + 3600000 }),
      })
      useAuthStore.getState().setAuth(makeLoginResponse())

      const cleanup = useAuthStore.getState().startExpiryMonitor()
      await vi.runOnlyPendingTimersAsync()
      mockFetch.mockClear()

      await vi.advanceTimersByTimeAsync(60000)

      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(mockFetch).toHaveBeenCalledWith('/api/auth/session')
      cleanup()
    })

    it('keeps polling after a retryable 401 and recovers on the next check', async () => {
      const expiresAt = Date.now() + 3600000
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ expiresAt: null, refreshFailed: false }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ expiresAt, refreshFailed: false }),
        })
      useAuthStore.getState().setAuth(makeLoginResponse())

      const cleanup = useAuthStore.getState().startExpiryMonitor()
      await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))

      expect(useAuthStore.getState().isAuthenticated).toBe(true)

      await vi.advanceTimersByTimeAsync(60000)

      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(useAuthStore.getState()).toMatchObject({
        isAuthenticated: true,
        expiresAt,
        sessionRefreshFailed: false,
      })
      cleanup()
    })

    it('keeps polling after a confirmed failure so a delayed winner can recover', async () => {
      const expiresAt = Date.now() + 3600000
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ expiresAt, refreshFailed: false }),
      })
      useAuthStore.getState().setAuth(makeLoginResponse())

      const cleanup = useAuthStore.getState().startExpiryMonitor()
      await vi.waitFor(() => expect(useAuthStore.getState().expiresAt).toBe(expiresAt))
      mockFetch.mockClear()
      useAuthStore.setState({
        isAuthenticated: false,
        user: null,
        expiresAt: null,
        sessionRefreshFailed: true,
      })

      await vi.advanceTimersByTimeAsync(60000)

      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(useAuthStore.getState()).toMatchObject({
        isAuthenticated: true,
        expiresAt,
        sessionRefreshFailed: false,
      })
      cleanup()
    })

    it('skips interval polling when not authenticated', async () => {
      const cleanup = useAuthStore.getState().startExpiryMonitor()
      mockFetch.mockClear()

      await vi.advanceTimersByTimeAsync(60000)

      expect(mockFetch).not.toHaveBeenCalled()
      cleanup()
    })
  })

  describe('an account switch under a running tab', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(async () => {
      vi.useRealTimers()
      const { getQueryClient } = await import('@/lib/query-client')
      getQueryClient().clear()
    })

    function respondWithAccount(userId: string) {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          expiresAt: Date.now() + 3600000,
          userId,
          refreshFailed: false,
        }),
      })
    }

    it('drops what the replaced account left behind', async () => {
      useAuthStore.getState().setAuth(makeLoginResponse())
      const generationBeforeSwitch = getSessionEpoch()
      queuePendingNotificationDelete('account-a-notification', () => Promise.resolve())
      expect(getPendingNotificationDeleteIdsSnapshot()).toEqual(['account-a-notification'])
      respondWithAccount('user-2')

      await useAuthStore.getState().checkSession()

      expect(getSessionEpoch()).toBeGreaterThan(generationBeforeSwitch)
      expect(getPendingNotificationDeleteIdsSnapshot()).toEqual([])
      expect(useAuthStore.getState().user).toBeNull()
      expect(useAuthStore.getState().isAuthenticated).toBe(true)
    })

    it('empties the query cache the replaced account filled', async () => {
      const { getQueryClient } = await import('@/lib/query-client')
      const { notificationKeys } = await import('@orbit/shared/query')
      const queryClient = getQueryClient()
      useAuthStore.getState().setAuth(makeLoginResponse())
      queryClient.setQueryData(notificationKeys.lists(), accountANotificationList)
      respondWithAccount('user-2')

      await useAuthStore.getState().checkSession()

      expect(queryClient.getQueryData(notificationKeys.lists())).toBeUndefined()
      expect(queryClient.getQueryCache().getAll()).toEqual([])
    })

    it('empties the Astra conversation the replaced account left', async () => {
      useAuthStore.getState().setAuth(makeLoginResponse())
      useChatStore.getState().addMessage(makeChatMessage())
      useChatStore.setState({ isTyping: true, streamingMessageId: 'message-2' })
      respondWithAccount('user-2')

      await useAuthStore.getState().checkSession()

      expect(useChatStore.getState().messages).toEqual([])
      expect(useChatStore.getState().isTyping).toBe(false)
      expect(useChatStore.getState().streamingMessageId).toBeNull()
    })

    it('empties the Astra composer the replaced account left', async () => {
      useAuthStore.getState().setAuth(makeLoginResponse())
      useChatStore.getState().setDraft('cancel my 9pm meds reminder')
      useChatStore.getState().hydrateDraft('cancel my 9pm meds reminder')
      useChatStore.getState().setContextualSuggestion({
        id: 'habit-1',
        label: 'Ask about Morning walk',
        prompt: 'How is Morning walk going?',
      })
      globalThis.localStorage.setItem(CHAT_DRAFT_STORAGE_KEY, 'cancel my 9pm meds reminder')
      respondWithAccount('user-2')

      await useAuthStore.getState().checkSession()

      expect(useChatStore.getState().draft).toBe('')
      expect(useChatStore.getState().draftRevision).toBe(0)
      expect(useChatStore.getState().draftHydrated).toBe(false)
      expect(useChatStore.getState().contextualSuggestion).toBeNull()
      expect(globalThis.localStorage.getItem(CHAT_DRAFT_STORAGE_KEY)).toBeNull()
    })

    it('drops a previous account pending delete when a login follows no teardown', async () => {
      const staleDelete = vi.fn(() => Promise.resolve())
      queuePendingNotificationDelete('account-a-notification', staleDelete)
      expect(getPendingNotificationDeleteIdsSnapshot()).toEqual(['account-a-notification'])

      useAuthStore.getState().setAuth(makeLoginResponse({ userId: 'user-2' }))

      expect(getPendingNotificationDeleteIdsSnapshot()).toEqual([])
      await vi.advanceTimersByTimeAsync(5000)
      expect(staleDelete).not.toHaveBeenCalled()
    })

    it('empties the query cache when a login replaces the account a dead session left', async () => {
      const { getQueryClient } = await import('@/lib/query-client')
      const { notificationKeys } = await import('@orbit/shared/query')
      const queryClient = getQueryClient()
      useAuthStore.getState().setAuth(makeLoginResponse())
      queryClient.setQueryData(notificationKeys.lists(), accountANotificationList)

      await useAuthStore.getState().checkSession()
      queryClient.setQueryData(notificationKeys.lists(), accountANotificationList)
      useAuthStore.getState().setAuth(makeLoginResponse({
        userId: 'user-2',
        name: 'Bea',
        email: 'bea@example.com',
      }))

      expect(queryClient.getQueryData(notificationKeys.lists())).toBeUndefined()
      expect(queryClient.getQueryCache().getAll()).toEqual([])
    })

    it('refuses the replacement account the user the dead session remembered', async () => {
      useAuthStore.getState().setAuth(makeLoginResponse())
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ refreshFailed: true }),
      })
      await useAuthStore.getState().confirmSessionRefreshFailure()
      expect(useAuthStore.getState().sessionRefreshFailed).toBe(true)
      respondWithAccount('user-2')

      await useAuthStore.getState().recoverSessionRefreshFailure()

      expect(useAuthStore.getState().user).toBeNull()
      expect(useAuthStore.getState().isAuthenticated).toBe(true)
    })

    it('leaves a tab alone while the cookie still holds its own account', async () => {
      useAuthStore.getState().setAuth(makeLoginResponse())
      const generationBeforeCheck = getSessionEpoch()
      queuePendingNotificationDelete('account-a-notification', () => Promise.resolve())
      respondWithAccount('user-1')

      await useAuthStore.getState().checkSession()

      expect(getSessionEpoch()).toBe(generationBeforeCheck)
      expect(getPendingNotificationDeleteIdsSnapshot()).toEqual(['account-a-notification'])
      expect(useAuthStore.getState().user?.userId).toBe('user-1')
    })

    it('keeps the cache when the same account recovers from a rejected refresh', async () => {
      const { getQueryClient } = await import('@/lib/query-client')
      const { notificationKeys } = await import('@orbit/shared/query')
      const queryClient = getQueryClient()
      useAuthStore.getState().setAuth(makeLoginResponse())
      queryClient.setQueryData(notificationKeys.lists(), accountANotificationList)
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ refreshFailed: true }),
      })

      await useAuthStore.getState().confirmSessionRefreshFailure()
      expect(useAuthStore.getState().sessionRefreshFailed).toBe(true)
      respondWithAccount('user-1')
      await useAuthStore.getState().recoverSessionRefreshFailure()

      expect(queryClient.getQueryData(notificationKeys.lists())).toEqual(accountANotificationList)
      expect(useAuthStore.getState().user?.userId).toBe('user-1')
    })
  })
})

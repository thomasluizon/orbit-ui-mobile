import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getHeldAccountId, useAuthStore } from '@/stores/auth-store'
import { fetchAuthEndpoint } from '@/app/(auth)/login/login-form-helpers'
import { getSessionEpoch } from '@/lib/session-epoch'
import { subscribeToAccountSignal } from '@/lib/cross-tab-account-signal'
import { useChatStore } from '@/stores/chat-store'
import type { LoginResponse } from '@orbit/shared/types/auth'
import type { ChatMessage } from '@orbit/shared/types/chat'
import { CHAT_DRAFT_STORAGE_KEY } from '@orbit/shared/hooks'
import { clearStepUpState, isStepUpVerified, markStepUpVerified } from '@/lib/step-up-storage'
import { SUPPORT_DRAFT_STORAGE_KEY } from '@/lib/support-draft-storage'
import {
  getFailedNotificationDeleteIdsSnapshot,
  getPendingNotificationDeleteIdsSnapshot,
  queuePendingNotificationDelete,
  resetPendingNotificationDeletesForTests,
  retryFailedNotificationDelete,
} from '@/lib/pending-notification-deletes'

const PINNED_TEST_TIME = new Date('2026-09-12T09:00:00.000Z')
vi.setSystemTime(PINNED_TEST_TIME)
beforeEach(() => vi.setSystemTime(PINNED_TEST_TIME))
afterEach(() => vi.useRealTimers())

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)
let lockQueue: Promise<unknown>


describe('auth store', () => {
  beforeEach(() => {
    lockQueue = Promise.resolve()
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: {
        request: (_name: string, task: () => Promise<unknown>) => {
          const result = lockQueue.then(task)
          lockQueue = result.catch(() => {})
          return result
        },
      },
    })
    resetPendingNotificationDeletesForTests()
    clearStepUpState()
    useAuthStore.setState({
      isAuthenticated: false,
      sessionInactive: false,
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
    Reflect.deleteProperty(navigator, 'locks')
    globalThis.localStorage.removeItem(CHAT_DRAFT_STORAGE_KEY)
    globalThis.localStorage.removeItem(SUPPORT_DRAFT_STORAGE_KEY)
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

  const accountASupportDraft = JSON.stringify({
    subject: 'billing',
    message: 'you charged me twice on the 14th, refund the second one',
  })

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

  it('keeps the session when browser cookie locking is unavailable', async () => {
    Reflect.deleteProperty(navigator, 'locks')
    useAuthStore.getState().setAuth(makeLoginResponse())

    await useAuthStore.getState().logout()
    await expect(fetchAuthEndpoint('/api/auth/verify-code', {
      email: 'thomas@example.com', code: '123456',
    })).rejects.toThrow('Web Locks API is required for session cookie changes')

    expect(mockFetch).not.toHaveBeenCalled()
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })

  it('keeps a replacement login when an older logout response arrives', async () => {
    let releaseLogout!: () => void
    mockFetch.mockImplementation((url: string) => url === '/api/auth/logout'
      ? new Promise<Response>((resolve) => {
        releaseLogout = () => resolve(Response.json({ success: true }))
      })
      : Promise.resolve(Response.json(makeLoginResponse({ userId: 'user-2', email: 'new@example.com' }))))
    useAuthStore.getState().setAuth(makeLoginResponse())

    const oldLogout = useAuthStore.getState().logout()
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' }))
    const replacementLogin = fetchAuthEndpoint('/api/auth/verify-code', {
      email: 'new@example.com', code: '123456',
    }).then((response) => useAuthStore.getState().setAuth(response as LoginResponse))
    await Promise.resolve()
    expect(mockFetch).not.toHaveBeenCalledWith('/api/auth/verify-code', expect.anything())
    releaseLogout()
    await Promise.all([oldLogout, replacementLogin])

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: true,
      user: { userId: 'user-2', email: 'new@example.com' },
    })
  })

  it('preserves replacement login cookies when an older logout response arrives in the same tab', async () => {
    const browserCookies = new Map<string, string>([
      ['auth_token', 'old-access'], ['refresh_token', 'old-refresh'],
    ])
    let releaseLogout!: () => void
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/auth/logout') {
        return new Promise<Response>((resolve) => {
          releaseLogout = () => {
            browserCookies.clear()
            resolve(Response.json({ success: true }))
          }
        })
      }
      if (url === '/api/auth/verify-code') {
        browserCookies.set('auth_token', 'new-access')
        browserCookies.set('refresh_token', 'new-refresh')
        return Promise.resolve(Response.json(makeLoginResponse()))
      }
      throw new Error(`Unexpected auth endpoint: ${url}`)
    })
    useAuthStore.getState().setAuth(makeLoginResponse())

    const oldLogout = useAuthStore.getState().logout()
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' }))
    const replacementLogin = fetchAuthEndpoint('/api/auth/verify-code', {
      email: 'thomas@example.com', code: '123456',
    })
    await Promise.resolve()
    expect(mockFetch).not.toHaveBeenCalledWith('/api/auth/verify-code', expect.anything())
    releaseLogout()
    await Promise.all([oldLogout, replacementLogin])

    expect(browserCookies.get('auth_token')).toBe('new-access')
    expect(browserCookies.get('refresh_token')).toBe('new-refresh')
  })

  it('reconciles a delayed cross-tab signal with cookies cleared by logout', async () => {
    const browserCookies = new Map([['auth_token', 'old-access']])
    let releaseLogout!: () => void
    mockFetch.mockImplementation((url: string) => url === '/api/auth/logout'
      ? new Promise<Response>((resolve) => {
        releaseLogout = () => {
          browserCookies.clear()
          resolve(Response.json({ success: true }))
        }
      })
      : Promise.resolve(Response.json(browserCookies.has('auth_token')
        ? { expiresAt: Date.now() + 3600000, userId: 'user-2' }
        : { expiresAt: null })))
    useAuthStore.getState().setAuth(makeLoginResponse())

    const oldLogout = useAuthStore.getState().logout()
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' }))
    useAuthStore.getState().adoptAccountFromSignal('user-2')
    await vi.waitFor(() => expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: true,
      expiresAt: Date.now() + 3600000,
      sessionRefreshFailed: false,
    }))
    releaseLogout()
    await oldLogout

    expect(browserCookies.size).toBe(0)
    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: false,
      user: null,
      sessionInactive: true,
    })
  })

  it('rejects a session read started during logout after cookies are cleared', async () => {
    const browserCookies = new Map([['auth_token', 'old-access']])
    let releaseLogout!: () => void
    let releaseSession!: () => void
    const sessionJson = vi.fn(() => Promise.resolve({
      expiresAt: Date.now() + 3600000,
      userId: 'user-1',
    }))
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/auth/logout') return new Promise<Response>((resolve) => {
        releaseLogout = () => {
          browserCookies.clear()
          resolve(Response.json({ success: true }))
        }
      })
      if (url === '/api/auth/session') return new Promise<Response>((resolve) => {
        releaseSession = () => resolve({ ok: true, status: 200, json: sessionJson } as unknown as Response)
      })
      throw new Error(`Unexpected auth endpoint: ${url}`)
    })
    useAuthStore.getState().setAuth(makeLoginResponse())

    const logout = useAuthStore.getState().logout()
    await vi.waitFor(() => expect(releaseLogout).toBeTypeOf('function'))
    useAuthStore.getState().adoptAccountFromSignal('user-1')
    await vi.waitFor(() => expect(releaseSession).toBeTypeOf('function'))
    releaseLogout()
    await logout
    releaseSession()
    await vi.waitFor(() => expect(sessionJson).toHaveBeenCalledOnce())
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(browserCookies.size).toBe(0)
    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: false, sessionInactive: true })
  })

  it.each(['user-1', 'user-2'])('does not revive logged-out memory from a late %s signal', async (signaledAccount) => {
    const browserCookies = new Map([['auth_token', 'old-access']])
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/auth/logout') {
        browserCookies.clear()
        return Promise.resolve(Response.json({ success: true }))
      }
      if (url === '/api/auth/session') return Promise.reject(new TypeError('Network request failed'))
      throw new Error(`Unexpected auth endpoint: ${url}`)
    })
    useAuthStore.getState().setAuth(makeLoginResponse())

    await useAuthStore.getState().logout()
    useAuthStore.getState().adoptAccountFromSignal(signaledAccount)
    await Promise.resolve()

    expect(browserCookies.size).toBe(0)
    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: false, sessionInactive: true })
  })

  it('keeps a confirmed replacement session when an older sign-out signal arrives late', async () => {
    useAuthStore.getState().setAuth(makeLoginResponse({ userId: 'user-2' }))
    mockFetch.mockImplementation(() => Promise.resolve(Response.json({
      expiresAt: Date.now() + 3600000,
      userId: 'user-2',
    })))

    useAuthStore.getState().adoptAccountFromSignal(null)
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/auth/session'))

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: true,
      sessionInactive: false,
      user: { userId: 'user-2' },
    })
  })

  it.each([
    { signal: null, session: { expiresAt: null }, authenticated: false, accountId: null },
    { signal: 'user-3', session: { expiresAt: Date.now() + 3600000, userId: 'user-3' }, authenticated: true, accountId: 'user-3' },
  ])('lets the latest $signal signal session result win over an older active response', async ({ signal, session, authenticated, accountId }) => {
    const reads: Array<(response: Response) => void> = []
    mockFetch.mockImplementation((url: string) => {
      if (url !== '/api/auth/session') throw new Error(`Unexpected auth endpoint: ${url}`)
      return new Promise<Response>((resolve) => { reads.push(resolve) })
    })
    useAuthStore.getState().setAuth(makeLoginResponse())

    useAuthStore.getState().adoptAccountFromSignal('user-2')
    useAuthStore.getState().adoptAccountFromSignal(signal)
    expect(reads).toHaveLength(2)
    reads[0]!(Response.json({ expiresAt: Date.now() + 3600000, userId: 'user-2' }))
    reads[1]!(Response.json(session))
    await vi.waitFor(() => expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: authenticated, sessionInactive: !authenticated, user: null,
    }))
    expect(getHeldAccountId()).toBe(accountId)
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

  it('removes the stored Astra draft when any account signs in', async () => {
    useAuthStore.getState().setAuth(makeLoginResponse())
    useChatStore.getState().setDraft('cancel my 9pm meds reminder')
    useChatStore.getState().hydrateDraft('cancel my 9pm meds reminder')
    globalThis.localStorage.setItem(CHAT_DRAFT_STORAGE_KEY, 'cancel my 9pm meds reminder')

    useAuthStore.getState().setAuth(makeLoginResponse())

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

  it('does not carry the support draft into a replacement account', async () => {
    useAuthStore.getState().setAuth(makeLoginResponse({ userId: 'account-a' }))
    globalThis.localStorage.setItem(SUPPORT_DRAFT_STORAGE_KEY, accountASupportDraft)

    await useAuthStore.getState().logout()

    expect(globalThis.localStorage.getItem(SUPPORT_DRAFT_STORAGE_KEY)).toBeNull()
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

    it.each(['network failure', 'retryable response'])(
      'resolves cold account ownership after a %s',
      async (firstResult) => {
        const expiresAt = Date.now() + 3600000
        if (firstResult === 'network failure') {
          mockFetch.mockRejectedValueOnce(new Error('offline'))
        } else {
          mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 503,
          })
        }
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ expiresAt, userId: 'user-1' }),
        })

        const cleanup = useAuthStore.getState().startExpiryMonitor()
        await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))
        expect(useAuthStore.getState().isAuthenticated).toBe(false)
        expect(useAuthStore.getState().sessionInactive).toBe(false)

        await vi.advanceTimersByTimeAsync(60000)

        expect(mockFetch).toHaveBeenCalledTimes(2)
        expect(useAuthStore.getState()).toMatchObject({
          isAuthenticated: true,
          sessionInactive: false,
          expiresAt,
        })
        cleanup()
      },
    )

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
      useAuthStore.setState({ sessionInactive: true })
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

    it('empties the support draft the replaced account left', async () => {
      useAuthStore.getState().setAuth(makeLoginResponse())
      globalThis.localStorage.setItem(SUPPORT_DRAFT_STORAGE_KEY, accountASupportDraft)
      respondWithAccount('user-2')

      await useAuthStore.getState().checkSession()

      expect(globalThis.localStorage.getItem(SUPPORT_DRAFT_STORAGE_KEY)).toBeNull()
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

    it('keeps the support draft when the same account recovers from a rejected refresh', async () => {
      useAuthStore.getState().setAuth(makeLoginResponse())
      globalThis.localStorage.setItem(SUPPORT_DRAFT_STORAGE_KEY, accountASupportDraft)
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ refreshFailed: true }),
      })

      await useAuthStore.getState().confirmSessionRefreshFailure()
      expect(useAuthStore.getState().sessionRefreshFailed).toBe(true)
      respondWithAccount('user-1')
      await useAuthStore.getState().recoverSessionRefreshFailure()

      expect(globalThis.localStorage.getItem(SUPPORT_DRAFT_STORAGE_KEY)).toBe(accountASupportDraft)
    })

    it('keeps the Astra draft when the same account recovers from a rejected refresh', async () => {
      useAuthStore.getState().setAuth(makeLoginResponse())
      useChatStore.getState().addMessage(makeChatMessage())
      useChatStore.getState().setDraft('cancel my 9pm meds reminder')
      useChatStore.getState().hydrateDraft('cancel my 9pm meds reminder')
      globalThis.localStorage.setItem(CHAT_DRAFT_STORAGE_KEY, 'cancel my 9pm meds reminder')
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ refreshFailed: true }),
      })

      await useAuthStore.getState().confirmSessionRefreshFailure()
      expect(useAuthStore.getState().sessionRefreshFailed).toBe(true)
      respondWithAccount('user-1')
      await useAuthStore.getState().recoverSessionRefreshFailure()

      expect(useChatStore.getState().draft).toBe('cancel my 9pm meds reminder')
      expect(useChatStore.getState().draftHydrated).toBe(true)
      expect(useChatStore.getState().messages).toHaveLength(1)
      expect(globalThis.localStorage.getItem(CHAT_DRAFT_STORAGE_KEY)).toBe(
        'cancel my 9pm meds reminder',
      )
    })
  })

  describe('a cross-tab account signal', () => {
    const ACCOUNT_SIGNAL_CHANNEL = 'orbit-account-signal'

    /**
     * Records every signal this tab receives, on the same channel the store listens on. Delivery
     * runs on the event loop rather than on a timer, so a fixed wait proves nothing under load.
     * Both listeners run in one dispatch, so a signal this one has seen the store has seen too.
     */
    let delivered: Array<string | null> = []
    let stopRecording: () => void = () => {}

    beforeEach(() => {
      delivered = []
      stopRecording = subscribeToAccountSignal((accountId) => delivered.push(accountId))
    })

    afterEach(async () => {
      stopRecording()
      vi.useRealTimers()
      otherTab?.close()
      otherTab = null
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

    /** Settles the work a real browser task would settle, with the poll interval still frozen. */
    function settle(): Promise<void> {
      return new Promise((resolve) => setTimeout(resolve, 0))
    }

    /**
     * Stands in for a second tab. Its channel stays open for the whole block, because a channel
     * closed in the turn it posted delivers nothing.
     */
    let otherTab: BroadcastChannel | null = null

    async function announceFromAnotherTab(accountId: string | null): Promise<void> {
      otherTab ??= new BroadcastChannel(ACCOUNT_SIGNAL_CHANNEL)
      const deliveredBefore = delivered.length
      otherTab.postMessage({ accountId })
      await vi.waitFor(() => expect(delivered.length).toBeGreaterThan(deliveredBefore))
    }

    /**
     * Freezes `setInterval` and leaves `setTimeout` real, so the 60-second poll cannot fire while
     * the signal is delivered. Anything the signal path achieves here is the signal's alone.
     */
    async function startTabHoldingAccountOne(): Promise<() => void> {
      vi.useFakeTimers({ toFake: ['setInterval'] })
      useAuthStore.getState().setAuth(makeLoginResponse())
      respondWithAccount('user-1')
      const stopMonitor = useAuthStore.getState().startExpiryMonitor()
      await settle()
      return stopMonitor
    }

    it('adopts the account another tab signed in as, before the poll comes round', async () => {
      const { getQueryClient } = await import('@/lib/query-client')
      const { notificationKeys } = await import('@orbit/shared/query')
      const queryClient = getQueryClient()
      const stopMonitor = await startTabHoldingAccountOne()
      queryClient.setQueryData(notificationKeys.lists(), accountANotificationList)
      queuePendingNotificationDelete('account-a-notification', () => Promise.resolve())
      const epochBeforeSignal = getSessionEpoch()
      respondWithAccount('user-2')

      await announceFromAnotherTab('user-2')

      expect(getSessionEpoch()).toBeGreaterThan(epochBeforeSignal)
      expect(getPendingNotificationDeleteIdsSnapshot()).toEqual([])
      expect(queryClient.getQueryData(notificationKeys.lists())).toBeUndefined()
      expect(useAuthStore.getState().user).toBeNull()
      expect(useAuthStore.getState().isAuthenticated).toBe(true)
      expect(vi.getTimerCount()).toBe(1)
      stopMonitor()
    })

    it('binds the step-up state to the account another tab signed in as', async () => {
      const stopMonitor = await startTabHoldingAccountOne()
      markStepUpVerified('keys')
      expect(isStepUpVerified('keys')).toBe(true)
      respondWithAccount('user-2')

      await announceFromAnotherTab('user-2')

      expect(isStepUpVerified('keys')).toBe(false)
      stopMonitor()
    })

    it('does nothing when the announced account is the one this tab already holds', async () => {
      const stopMonitor = await startTabHoldingAccountOne()
      queuePendingNotificationDelete('account-a-notification', () => Promise.resolve())
      const epochBeforeSignal = getSessionEpoch()

      await announceFromAnotherTab('user-1')

      expect(getSessionEpoch()).toBe(epochBeforeSignal)
      expect(getPendingNotificationDeleteIdsSnapshot()).toEqual(['account-a-notification'])
      expect(useAuthStore.getState().user?.userId).toBe('user-1')
      stopMonitor()
    })

    it('stops taking signals once the monitor is torn down', async () => {
      const stopMonitor = await startTabHoldingAccountOne()
      const epochBeforeSignal = getSessionEpoch()
      stopMonitor()
      respondWithAccount('user-2')

      await announceFromAnotherTab('user-2')

      expect(getSessionEpoch()).toBe(epochBeforeSignal)
      expect(useAuthStore.getState().user?.userId).toBe('user-1')
    })

    it('ends the session when another tab signs the browser out', async () => {
      const { getQueryClient } = await import('@/lib/query-client')
      const { notificationKeys } = await import('@orbit/shared/query')
      const queryClient = getQueryClient()
      const stopMonitor = await startTabHoldingAccountOne()
      queuePendingNotificationDelete('account-a-notification', () => Promise.resolve())
      globalThis.localStorage.setItem(SUPPORT_DRAFT_STORAGE_KEY, accountASupportDraft)
      queryClient.setQueryData(notificationKeys.lists(), accountANotificationList)
      const epochBeforeSignal = getSessionEpoch()

      mockFetch.mockResolvedValue(Response.json({ expiresAt: null }))

      await announceFromAnotherTab(null)

      await vi.waitFor(() => expect(useAuthStore.getState().isAuthenticated).toBe(false))

      expect(useAuthStore.getState().isAuthenticated).toBe(false)
      expect(useAuthStore.getState().user).toBeNull()
      expect(getSessionEpoch()).toBeGreaterThan(epochBeforeSignal)
      expect(getPendingNotificationDeleteIdsSnapshot()).toEqual([])
      expect(globalThis.localStorage.getItem(SUPPORT_DRAFT_STORAGE_KEY)).toBeNull()
      stopMonitor()
    })

    it('does not restore a signed-out account from an older refresh confirmation', async () => {
      const stopMonitor = await startTabHoldingAccountOne()
      let finishSession!: (response: Response) => void
      mockFetch.mockClear()
      mockFetch.mockImplementationOnce(() => new Promise((resolve) => { finishSession = resolve }))
      const confirming = useAuthStore.getState().confirmSessionRefreshFailure()
      await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))

      mockFetch.mockImplementation(() => Promise.resolve(Response.json({ expiresAt: null })))
      await announceFromAnotherTab(null)
      await vi.waitFor(() => expect(useAuthStore.getState().sessionInactive).toBe(true))
      finishSession({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ expiresAt: Date.now() + 3600000, userId: 'user-1' }),
      } as Response)
      await confirming

      expect(useAuthStore.getState().sessionInactive).toBe(true)
      expect(useAuthStore.getState().isAuthenticated).toBe(false)
      stopMonitor()
    })

    it('does not restore a signed-out account from an older refresh recovery', async () => {
      const stopMonitor = await startTabHoldingAccountOne()
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ refreshFailed: true }),
      })
      await useAuthStore.getState().confirmSessionRefreshFailure()
      expect(useAuthStore.getState().sessionRefreshFailed).toBe(true)

      let finishSession!: (response: Response) => void
      mockFetch.mockClear()
      mockFetch.mockImplementationOnce(() => new Promise((resolve) => { finishSession = resolve }))
      const recovering = useAuthStore.getState().recoverSessionRefreshFailure()
      await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))

      mockFetch.mockImplementation(() => Promise.resolve(Response.json({ expiresAt: null })))
      await announceFromAnotherTab(null)
      await vi.waitFor(() => expect(useAuthStore.getState().sessionInactive).toBe(true))
      finishSession({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ expiresAt: Date.now() + 3600000, userId: 'user-1' }),
      } as Response)
      await recovering

      expect(useAuthStore.getState().sessionInactive).toBe(true)
      expect(useAuthStore.getState().isAuthenticated).toBe(false)
      stopMonitor()
    })

    it('ignores a sign out reaching a tab that is already signed out', async () => {
      const stopMonitor = await startTabHoldingAccountOne()
      mockFetch.mockImplementation(() => Promise.resolve(Response.json({ expiresAt: null })))
      await announceFromAnotherTab(null)
      await vi.waitFor(() => expect(useAuthStore.getState().isAuthenticated).toBe(false))
      const epochAfterFirstSignOut = getSessionEpoch()

      await announceFromAnotherTab(null)

      expect(getSessionEpoch()).toBe(epochAfterFirstSignOut)
      expect(useAuthStore.getState().isAuthenticated).toBe(false)
      stopMonitor()
    })

    it('announces sign-out after the logout response clears cookies', async () => {
      const browserCookies = new Map([['auth_token', 'old-access']])
      let releaseLogout!: () => void
      const received: Array<string | null> = []
      otherTab = new BroadcastChannel(ACCOUNT_SIGNAL_CHANNEL)
      otherTab.addEventListener('message', (event: MessageEvent) => {
        received.push((event.data as { accountId: string | null }).accountId)
      })
      mockFetch.mockImplementation((url: string) => url === '/api/auth/logout'
        ? new Promise<Response>((resolve) => {
          releaseLogout = () => {
            browserCookies.clear()
            resolve(Response.json({ success: true }))
          }
        })
        : Promise.resolve(Response.json({ expiresAt: null })))
      useAuthStore.getState().setAuth(makeLoginResponse())
      await vi.waitFor(() => expect(received).toContain('user-1'))

      const logout = useAuthStore.getState().logout()
      await vi.waitFor(() => expect(releaseLogout).toBeTypeOf('function'))
      await settle()
      expect(received).not.toContain(null)
      releaseLogout()
      await logout
      await vi.waitFor(() => expect(received).toContain(null))

      expect(browserCookies.size).toBe(0)
    })

    it('still detects the change on the poll where BroadcastChannel is missing', async () => {
      vi.useFakeTimers()
      useAuthStore.getState().setAuth(makeLoginResponse())
      respondWithAccount('user-1')
      const realBroadcastChannel = globalThis.BroadcastChannel
      Reflect.deleteProperty(globalThis, 'BroadcastChannel')
      const stopMonitor = useAuthStore.getState().startExpiryMonitor()
      globalThis.BroadcastChannel = realBroadcastChannel
      await vi.runOnlyPendingTimersAsync()
      const epochBeforePoll = getSessionEpoch()
      respondWithAccount('user-2')

      await vi.advanceTimersByTimeAsync(60000)

      expect(getSessionEpoch()).toBeGreaterThan(epochBeforePoll)
      expect(useAuthStore.getState().user).toBeNull()
      stopMonitor()
    })
  })
})

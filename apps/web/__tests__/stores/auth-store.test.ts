import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getHeldAccountId, useAuthStore } from '@/stores/auth-store'
import { fetchAuthEndpoint } from '@/app/(auth)/login/login-form-helpers'
import type { LoginResponse } from '@orbit/shared/types/auth'
import { canPromptEngagement, MARKETING_CONSENT_MILESTONE_KEY } from '@orbit/shared/stores'
import { useEngagementPromptStore } from '@/stores/referral-prompt-store'
import { useUIStore } from '@/stores/ui-store'
import { useTourStore } from '@/stores/tour-store'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'
import { useChatStore } from '@/stores/chat-store'
import { readShowGeneralOnToday, writeShowGeneralOnToday } from '@/lib/show-general-on-today-storage'
import { readAppNavigationHistory, updateAppNavigationHistory } from '@/lib/app-navigation-history'
import { accountStorageKey } from '@/lib/account-storage-key'
import { QueryObserver } from '@tanstack/query-core'
import { profileKeys } from '@orbit/shared/query'
import { getQueryClient } from '@/lib/query-client'
import { sessionAwareFetch } from '@/lib/api-fetch'

const posthogMocks = vi.hoisted(() => ({
  identifyPostHogUser: vi.fn(),
  resetPostHogUser: vi.fn(),
}))

vi.mock('@/lib/posthog', () => posthogMocks)

const pushMocks = vi.hoisted(() => ({
  subscribePush: vi.fn(),
  unsubscribePush: vi.fn(),
  captureException: vi.fn(),
}))

vi.mock('@/lib/actions/notifications', () => ({
  subscribePush: pushMocks.subscribePush,
  unsubscribePush: pushMocks.unsubscribePush,
}))

vi.mock('@sentry/nextjs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sentry/nextjs')>()),
  captureException: pushMocks.captureException,
}))

/** The browser push stack, as far as the real subscribe flow and the account boundary touch it. */
function installBrowserPush(order: string[] = []) {
  let current: unknown = null
  const subscription = {
    endpoint: 'https://push.example.com/account',
    toJSON: () => ({ endpoint: 'https://push.example.com/account', keys: { p256dh: 'p256dh-key', auth: 'auth-key' } }),
    unsubscribe: vi.fn(async () => {
      order.push('browser-unsubscribe')
      current = null
      return true
    }),
  }
  const registration = {
    pushManager: {
      getSubscription: vi.fn(async () => current),
      subscribe: vi.fn(async () => {
        current = subscription
        return subscription
      }),
    },
  }
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      register: vi.fn(async () => registration),
      ready: Promise.resolve(registration),
      getRegistration: vi.fn(async () => registration),
    },
  })
  Object.defineProperty(globalThis, 'Notification', {
    configurable: true,
    value: { permission: 'granted', requestPermission: vi.fn() },
  })
  Object.defineProperty(globalThis, 'PushManager', { configurable: true, value: class {} })
  return subscription
}

/** Turns push on through the real subscribe flow as whichever account the store holds. */
async function enablePush() {
  const { subscribeToPushNotifications } = await import('@/hooks/use-push-notification-preferences')
  pushMocks.subscribePush.mockResolvedValue(undefined)
  await subscribeToPushNotifications('dGVzdA')
}

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)
let lockQueue: Promise<unknown>

describe('the first session check under a query in flight', () => {
  it('settles the mounted observer after the account boundary', async () => {
    const queryClient = getQueryClient()
    useAuthStore.setState({ heldAccountId: null })
    let answer: (profile: { name: string }) => void = () => {}
    const serverAnswer = new Promise<{ name: string }>((resolve) => { answer = resolve })
    const observer = new QueryObserver(queryClient, {
      queryKey: profileKeys.detail(),
      queryFn: () => serverAnswer,
    })
    const unsubscribe = observer.subscribe(() => {})
    try {
      await vi.waitFor(() => expect(observer.getCurrentResult().fetchStatus).toBe('fetching'))
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ expiresAt: Date.now() + 3600000, accountId: 'account-a' }),
      })

      await useAuthStore.getState().checkSession()
      answer({ name: 'answered' })

      await vi.waitFor(() => expect(observer.getCurrentResult()).toMatchObject({
        status: 'success', fetchStatus: 'idle', data: { name: 'answered' },
      }))
    } finally {
      unsubscribe()
      queryClient.clear()
    }
  })
})

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
    useAuthStore.setState({
      isAuthenticated: false,
      user: null,
      heldAccountId: null,
      expiresAt: null,
      sessionRefreshFailed: false,
    })
    mockFetch.mockReset()
    vi.clearAllMocks()
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ expiresAt: null }),
    })
  })

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'locks')
    Reflect.deleteProperty(navigator, 'serviceWorker')
    Reflect.deleteProperty(globalThis, 'Notification')
    Reflect.deleteProperty(globalThis, 'PushManager')
  })

  function makeLoginResponse(overrides: Partial<LoginResponse> = {}): LoginResponse {
    return {
      userId: 'user-1',
      name: 'Alex',
      email: 'thomas@example.com',
      ...overrides,
    }
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
        name: 'Alex',
        email: 'thomas@example.com',
      },
    })
    expect(posthogMocks.identifyPostHogUser).toHaveBeenCalledExactlyOnceWith('user-1')
  })

  it('asks the replacement account for marketing consent', () => {
    useAuthStore.getState().setAuth(makeLoginResponse({ userId: 'account-a' }))
    useEngagementPromptStore.getState().markEngagementPrompted(MARKETING_CONSENT_MILESTONE_KEY, '2026-09-01T00:00:00Z')
    useAuthStore.getState().setAuth(makeLoginResponse({ userId: 'account-b' }))

    expect(canPromptEngagement(useEngagementPromptStore.getState(), MARKETING_CONSENT_MILESTONE_KEY, '2026-09-26T00:00:00Z')).toBe(true)
  })

  it('resets account state and restores each account prompt record', () => {
    useAuthStore.getState().setAuth(makeLoginResponse({ userId: 'account-a' }))
    useEngagementPromptStore.getState().markEngagementPrompted(MARKETING_CONSENT_MILESTONE_KEY, '2026-09-01T00:00:00Z')
    useUIStore.getState().setSearchQuery('previous')
    useUIStore.getState().selectAllHabits(['habit-a'])
    useUIStore.getState().enqueueCelebration('streak', { streak: 7 })
    useOnboardingDraftStore.getState().bufferColorScheme('purple')
    useTourStore.getState().startFullTour()
    useChatStore.setState({ isTyping: true })
    writeShowGeneralOnToday(true)
    updateAppNavigationHistory('/habits/habit-a', 'init')

    useAuthStore.getState().setAuth(makeLoginResponse({ userId: 'account-b' }))

    expect(useUIStore.getState().selectedHabitIds.size).toBe(0)
    expect(useUIStore.getState().searchQuery).toBe('')
    expect(useUIStore.getState().activeCelebration).toBeNull()
    expect(useOnboardingDraftStore.getState().colorScheme).toBeNull()
    expect(useTourStore.getState().isActive).toBe(false)
    expect(useChatStore.getState().isTyping).toBe(false)
    expect(readShowGeneralOnToday()).toBe(false)
    expect(readAppNavigationHistory().entries).toEqual([])
    expect(canPromptEngagement(useEngagementPromptStore.getState(), MARKETING_CONSENT_MILESTONE_KEY, '2026-09-26T00:00:00Z')).toBe(true)

    useAuthStore.getState().setAuth(makeLoginResponse({ userId: 'account-a' }))
    expect(canPromptEngagement(useEngagementPromptStore.getState(), MARKETING_CONSENT_MILESTONE_KEY, '2026-09-26T00:00:00Z')).toBe(false)
    expect(readShowGeneralOnToday()).toBe(true)
  })

  it.each(['orbit_trial_expired_seen', 'orbit_wrapped_year_seen', 'orbit_tour_sections:v1', 'orbit_last_visit'])(
    'isolates %s when the account changes', (baseKey) => {
      useAuthStore.getState().setAuth(makeLoginResponse({ userId: 'account-a' }))
      localStorage.setItem(accountStorageKey(baseKey), '1')
      useAuthStore.getState().setAuth(makeLoginResponse({ userId: 'account-b' }))
      expect(localStorage.getItem(accountStorageKey(baseKey))).toBeNull()
    },
  )

  it('holds the account from a cold session read', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ expiresAt: Date.now() + 3600000, accountId: 'account-a' }),
    })

    await useAuthStore.getState().checkSession()

    expect(getHeldAccountId()).toBe('account-a')
    expect(posthogMocks.identifyPostHogUser).toHaveBeenCalledExactlyOnceWith('account-a')
  })

  it('drops a persisted draft from another account on a cold session', async () => {
    useOnboardingDraftStore.setState({ accountKey: 'account-a', colorScheme: 'purple' })
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ expiresAt: Date.now() + 3600000, accountId: 'account-b' }),
    })

    await useAuthStore.getState().checkSession()
    expect(useOnboardingDraftStore.getState().colorScheme).toBeNull()
  })

  it('keeps the previous account until a cross-tab replacement reloads the page', async () => {
    const previousLocation = globalThis.location
    const reload = vi.fn()
    vi.stubGlobal('location', { reload })
    useAuthStore.getState().setAuth(makeLoginResponse({ userId: 'account-a' }))
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ expiresAt: Date.now() + 3600000, accountId: 'account-b' }),
    })

    await useAuthStore.getState().checkSession()

    expect(getHeldAccountId()).toBe('account-a')
    expect(reload).toHaveBeenCalledTimes(1)
    vi.stubGlobal('location', previousLocation)
  })

  it('logs out and calls the BFF logout endpoint', async () => {
    mockFetch.mockResolvedValue({ ok: true })
    useAuthStore.getState().setAuth(makeLoginResponse())
    const resetAtSignedOut = vi.fn()
    const unsubscribe = useAuthStore.subscribe((state) => {
      if (!state.isAuthenticated) resetAtSignedOut(posthogMocks.resetPostHogUser.mock.calls.length)
    })

    await useAuthStore.getState().logout()
    unsubscribe()

    expect(mockFetch).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' })
    expect(posthogMocks.resetPostHogUser).toHaveBeenCalledOnce()
    expect(resetAtSignedOut).toHaveBeenCalledWith(1)
    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: false,
      user: null,
      expiresAt: null,
      sessionRefreshFailed: false,
    })
  })

  it('releases this browser push subscription on the API before logout clears the session cookie', async () => {
    const order: string[] = []
    const subscription = installBrowserPush(order)
    useAuthStore.getState().setAuth(makeLoginResponse())
    await enablePush()
    pushMocks.unsubscribePush.mockImplementation(async () => { order.push('api-unsubscribe') })
    mockFetch.mockImplementation(async (url: string) => {
      if (url === '/api/auth/logout') order.push('bff-logout')
      return { ok: true }
    })

    await useAuthStore.getState().logout()

    expect(pushMocks.unsubscribePush).toHaveBeenCalledWith(subscription.toJSON())
    expect(order).toEqual(['api-unsubscribe', 'browser-unsubscribe', 'bff-logout'])
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('signs out, and still ends the browser subscription, when the API release fails', async () => {
    const subscription = installBrowserPush()
    useAuthStore.getState().setAuth(makeLoginResponse())
    await enablePush()
    const failure = new Error('network down')
    pushMocks.unsubscribePush.mockRejectedValue(failure)
    mockFetch.mockResolvedValue({ ok: true })

    await useAuthStore.getState().logout()

    expect(subscription.unsubscribe).toHaveBeenCalledTimes(1)
    expect(pushMocks.captureException).toHaveBeenCalledWith(failure)
    expect(mockFetch).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' })
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('drops the push subscription a previous account turned on when another account signs in', async () => {
    const subscription = installBrowserPush()
    useAuthStore.getState().setAuth(makeLoginResponse({ userId: 'account-a' }))
    await enablePush()

    useAuthStore.getState().setAuth(makeLoginResponse({ userId: 'account-b', email: 'b@example.com' }))

    await vi.waitFor(() => expect(subscription.unsubscribe).toHaveBeenCalledTimes(1))
  })

  it('keeps the push subscription the returning account turned on across a page load', async () => {
    const subscription = installBrowserPush()
    useAuthStore.getState().setAuth(makeLoginResponse({ userId: 'account-a' }))
    await enablePush()
    useAuthStore.setState({ heldAccountId: null, isAuthenticated: false, user: null })
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ expiresAt: Date.now() + 3600000, accountId: 'account-a' }),
    })

    await useAuthStore.getState().checkSession()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(getHeldAccountId()).toBe('account-a')
    expect(subscription.unsubscribe).not.toHaveBeenCalled()
  })

  it('does not start a mounted API query after logout removes the session cookie', async () => {
    useAuthStore.getState().setAuth(makeLoginResponse())
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/auth/logout') return Promise.resolve({ ok: true })
      return Promise.resolve(new Response(null, { status: 401 }))
    })
    const queryClient = getQueryClient()
    let releaseInitial: (value: string) => void = () => {}
    const initialRequest = new Promise<string>((resolve) => { releaseInitial = resolve })
    const queryFn = vi.fn()
      .mockImplementationOnce(() => initialRequest)
      .mockImplementation(() => sessionAwareFetch('/api/profile'))
    const observer = new QueryObserver(queryClient, { queryKey: ['logout-401'], queryFn })
    const unsubscribe = observer.subscribe(() => {})
    try {
      await useAuthStore.getState().logout()
      releaseInitial('previous account')
      expect(queryFn).toHaveBeenCalledTimes(1)
      expect(mockFetch).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' })
      expect(mockFetch).not.toHaveBeenCalledWith('/api/profile')
    } finally {
      unsubscribe()
      queryClient.clear()
    }
  })

  it('keeps the session when browser cookie locking is unavailable', async () => {
    Reflect.deleteProperty(navigator, 'locks')
    useAuthStore.getState().setAuth(makeLoginResponse())

    await useAuthStore.getState().logout()
    await expect(fetchAuthEndpoint('/api/auth/verify-code', {
      email: 'thomas@example.com',
      code: '123456',
    })).rejects.toThrow('Web Locks API is required for session cookie changes')

    expect(mockFetch).not.toHaveBeenCalled()
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })

  it('keeps a replacement login when an older logout response arrives', async () => {
    let releaseLogout!: () => void
    const logoutResponse = new Promise<{ ok: boolean }>((resolve) => {
      releaseLogout = () => resolve({ ok: true })
    })
    mockFetch.mockReturnValue(logoutResponse)
    useAuthStore.getState().setAuth(makeLoginResponse())

    const oldLogout = useAuthStore.getState().logout()
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' }))
    useAuthStore.getState().setAuth(makeLoginResponse({ userId: 'user-2', email: 'new@example.com' }))
    releaseLogout()
    await oldLogout

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: true,
      user: { userId: 'user-2', email: 'new@example.com' },
    })
  })

  it('does not adopt a session response that completes after logout', async () => {
    let releaseSession!: () => void
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/auth/session') {
        return new Promise((resolve) => {
          releaseSession = () => resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ expiresAt: Date.now() + 60000 }),
          })
        })
      }
      if (url === '/api/auth/logout') return Promise.resolve({ ok: true })
      throw new Error(`Unexpected auth endpoint: ${url}`)
    })
    useAuthStore.getState().setAuth(makeLoginResponse())

    const staleSession = useAuthStore.getState().checkSession()
    await vi.waitFor(() => expect(releaseSession).toBeTypeOf('function'))
    await useAuthStore.getState().logout()
    releaseSession()
    await staleSession

    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('preserves replacement login cookies when an older logout response arrives', async () => {
    const browserCookies = new Map<string, string>([
      ['auth_token', 'old-access'],
      ['refresh_token', 'old-refresh'],
    ])
    let releaseLogout!: () => void
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/auth/logout') {
        return new Promise((resolve) => {
          releaseLogout = () => {
            browserCookies.clear()
            resolve({ ok: true })
          }
        })
      }
      if (url === '/api/auth/verify-code') {
        browserCookies.set('auth_token', 'new-access')
        browserCookies.set('refresh_token', 'new-refresh')
        return Promise.resolve({ ok: true, json: () => Promise.resolve(makeLoginResponse()) })
      }
      throw new Error(`Unexpected auth endpoint: ${url}`)
    })
    useAuthStore.getState().setAuth(makeLoginResponse())

    const oldLogout = useAuthStore.getState().logout()
    const replacementLogin = fetchAuthEndpoint('/api/auth/verify-code', {
      email: 'thomas@example.com',
      code: '123456',
    })
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' }))
    expect(mockFetch).not.toHaveBeenCalledWith('/api/auth/verify-code', expect.anything())
    releaseLogout()
    await Promise.all([oldLogout, replacementLogin])

    expect(browserCookies.get('auth_token')).toBe('new-access')
    expect(browserCookies.get('refresh_token')).toBe('new-refresh')
  })

  it('preserves replacement cookies when logout and login run in separate tabs', async () => {
    const browserCookies = new Map<string, string>([
      ['auth_token', 'old-access'],
      ['refresh_token', 'old-refresh'],
    ])
    let releaseLogout!: () => void
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/auth/logout') {
        return new Promise((resolve) => {
          releaseLogout = () => {
            browserCookies.clear()
            resolve({ ok: true })
          }
        })
      }
      if (url === '/api/auth/verify-code') {
        browserCookies.set('auth_token', 'new-access')
        browserCookies.set('refresh_token', 'new-refresh')
        return Promise.resolve({ ok: true, json: () => Promise.resolve(makeLoginResponse()) })
      }
      throw new Error(`Unexpected auth endpoint: ${url}`)
    })

    vi.resetModules()
    const firstTab = await import('@/stores/auth-store')
    firstTab.useAuthStore.getState().setAuth(makeLoginResponse())
    const oldLogout = firstTab.useAuthStore.getState().logout()
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' }))

    vi.resetModules()
    const secondTab = await import('@/app/(auth)/login/login-form-helpers')
    const replacementLogin = secondTab.fetchAuthEndpoint('/api/auth/verify-code', {
      email: 'thomas@example.com',
      code: '123456',
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    releaseLogout()
    await Promise.all([oldLogout, replacementLogin])

    expect(browserCookies.get('auth_token')).toBe('new-access')
    expect(browserCookies.get('refresh_token')).toBe('new-refresh')
  })

  it('marks the session as signed out after confirming a refresh rejection', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ expiresAt: null, refreshFailed: true }),
    })
    useAuthStore.getState().setAuth(makeLoginResponse())
    const resetAtSignedOut = vi.fn()
    const unsubscribe = useAuthStore.subscribe((state) => {
      if (!state.isAuthenticated) resetAtSignedOut(posthogMocks.resetPostHogUser.mock.calls.length)
    })

    await useAuthStore.getState().confirmSessionRefreshFailure()
    unsubscribe()
    expect(resetAtSignedOut).toHaveBeenCalledWith(1)

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: false,
      user: null,
      expiresAt: null,
      sessionRefreshFailed: true,
    })
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

    await useAuthStore.getState().checkSession()

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: false,
      user: null,
      expiresAt: null,
      sessionRefreshFailed: false,
    })
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

    await useAuthStore.getState().checkSession()

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: false,
      user: null,
      expiresAt: null,
      sessionRefreshFailed: true,
    })
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
})

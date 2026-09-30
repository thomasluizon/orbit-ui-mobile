import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { installWebLocks } from '../helpers/web-locks'

const mockSubscribePush = vi.fn()
const mockUnsubscribePush = vi.fn()
vi.mock('@/lib/actions/notifications', () => ({
  subscribePush: (...args: unknown[]) => mockSubscribePush(...args),
  unsubscribePush: (...args: unknown[]) => mockUnsubscribePush(...args),
  unsubscribePushForCleanup: (...args: unknown[]) => mockUnsubscribePush(...args),
}))

import {
  getPushStatusMessageKey,
  getPushStatusTone,
  loadPushNotificationState,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
  usePushNotificationPreferences,
} from '@/hooks/use-push-notification-preferences'
import * as pushPreferences from '@/hooks/use-push-notification-preferences'
import { setAccountId } from '@/lib/account-scope'
import { startAccountScopedSession } from '@/lib/account-scoped-state'
import { discardForeignPushSubscription, isPushSubscriptionOwner } from '@/lib/push-subscription-owner'

interface MockPushSubscription {
  endpoint: string
  toJSON: () => PushSubscriptionJSON
  unsubscribe: ReturnType<typeof vi.fn<() => Promise<boolean>>>
}

interface SetupPushEnvironmentOptions {
  permission?: NotificationPermission
  requestPermissionResult?: NotificationPermission
  existingSubscription?: MockPushSubscription | null
  subscribeResult?: MockPushSubscription
  fetchOk?: boolean
  fetchStatus?: number
  registerRejects?: boolean
}

interface MockRegistration {
  pushManager: {
    getSubscription: ReturnType<typeof vi.fn>
    subscribe: ReturnType<typeof vi.fn>
  }
}

/**
 * Mirrors the browser: `ready` never settles until something registers a worker for the page, and
 * `getRegistration` finds a registration only once one exists.
 */
function createServiceWorkerContainer(registration: MockRegistration, registerRejects: boolean) {
  let registered = false
  let activate: (value: MockRegistration) => void = () => undefined
  const ready = new Promise<MockRegistration>((resolve) => {
    activate = resolve
  })
  const register = registerRejects
    ? vi.fn().mockRejectedValue(new TypeError('Failed to register a ServiceWorker'))
    : vi.fn(async () => {
        registered = true
        activate(registration)
        return registration
      })
  const getRegistration = vi.fn(async () => (registered ? registration : undefined))
  return { ready, register, getRegistration }
}

function settleWithin<T>(promise: Promise<T>, milliseconds = 1000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`still pending after ${milliseconds}ms`)), milliseconds)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

function createMockSubscription(endpoint = 'https://example.com/push'): MockPushSubscription {
  return {
    endpoint,
    toJSON: () => ({
      endpoint,
      expirationTime: null,
      keys: {
        p256dh: 'p256dh-key',
        auth: 'auth-key',
      },
    }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  }
}

/**
 * Turns push on through the real subscribe flow as the given account, which is how a browser comes to
 * hold a subscription that belongs to one account, then forgets the calls it took to get there.
 */
async function enablePushAs(accountId: string, subscription = createMockSubscription()) {
  setAccountId(accountId)
  const environment = setupPushEnvironment({ permission: 'granted', subscribeResult: subscription })
  mockSubscribePush.mockResolvedValue(undefined)
  await settleWithin(subscribeToPushNotifications())
  vi.clearAllMocks()
  return { ...environment, subscription }
}

function setupPushEnvironment(options: SetupPushEnvironmentOptions = {}) {
  const permission = options.permission ?? 'granted'
  const requestPermissionResult = options.requestPermissionResult ?? permission
  const existingSubscription = options.existingSubscription ?? null
  const subscribeResult = options.subscribeResult ?? createMockSubscription()
  const fetchMock = vi.fn().mockResolvedValue({
    ok: options.fetchOk ?? true,
    status: options.fetchStatus ?? 200,
  })
  let currentSubscription = existingSubscription
  for (const subscription of [existingSubscription, subscribeResult]) {
    subscription?.unsubscribe.mockImplementation(async () => {
      if (currentSubscription === subscription) currentSubscription = null
      return true
    })
  }
  const getSubscription = vi.fn(async () => currentSubscription)
  const subscribe = vi.fn(async () => {
    currentSubscription = subscribeResult
    return subscribeResult
  })
  const container = createServiceWorkerContainer(
    { pushManager: { getSubscription, subscribe } },
    options.registerRejects ?? false,
  )
  const requestPermission = vi.fn().mockResolvedValue(requestPermissionResult)

  vi.stubGlobal('Notification', {
    permission,
    requestPermission,
  })
  vi.stubGlobal('PushManager', class PushManager {})
  vi.stubGlobal('fetch', fetchMock)

  Object.defineProperty(global.navigator, 'serviceWorker', {
    configurable: true,
    value: container,
  })

  return {
    fetchMock,
    getRegistration: container.getRegistration,
    getSubscription,
    register: container.register,
    requestPermission,
    subscribe,
    subscribeResult,
  }
}

describe('use-push-notification-preferences helpers', () => {
  const originalVapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

  beforeEach(() => {
    installWebLocks()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    mockSubscribePush.mockReset()
    mockUnsubscribePush.mockReset()
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'dGVzdA'
    setAccountId('account-a')
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    if (originalVapidKey === undefined) {
      delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      return
    }

    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = originalVapidKey
  })

  it('maps push statuses to the expected tone classes', () => {
    expect(getPushStatusTone('denied')).toBe('text-[var(--status-bad-text)]')
    expect(getPushStatusTone('sync-failed')).toBe('text-[var(--status-bad-text)]')
    expect(getPushStatusTone('registered')).toBe('text-[var(--primary)]')
    expect(getPushStatusTone('not-registered')).toBe('text-[var(--fg-3)]')
  })

  it('maps push statuses to the expected translation keys', () => {
    expect(getPushStatusMessageKey('denied', 'denied')).toBe('settings.notifications.denied')
    expect(getPushStatusMessageKey('requesting', 'default')).toBe('settings.notifications.requesting')
    expect(getPushStatusMessageKey('registered', 'granted')).toBe('settings.notifications.registered')
    expect(getPushStatusMessageKey('sync-failed', 'granted')).toBe('settings.notifications.syncFailed')
    expect(getPushStatusMessageKey('not-registered', 'granted')).toBe('settings.notifications.notRegistered')
    expect(getPushStatusMessageKey('not-registered', 'default')).toBe('settings.notifications.disabled')
  })

  it('reports unsupported when browser push APIs are unavailable', async () => {
    const result = await settleWithin(loadPushNotificationState('account-a'))

    expect(result).toEqual({
      supported: false,
      subscribed: false,
      permission: '',
      status: 'unsupported',
    })
  })

  it('loads a registered subscription when this account turned push on in this browser', async () => {
    await enablePushAs('account-a')

    const result = await settleWithin(loadPushNotificationState('account-a'))

    expect(result).toEqual({
      supported: true,
      subscribed: true,
      permission: 'granted',
      status: 'registered',
    })
  })

  it('does not report the subscription another account turned on in this browser as registered', async () => {
    await enablePushAs('account-a')

    const result = await settleWithin(loadPushNotificationState('account-b'))

    expect(result).toEqual({
      supported: true,
      subscribed: false,
      permission: 'granted',
      status: 'not-registered',
    })
  })

  it('does not report a subscription with no recorded account as registered', async () => {
    setupPushEnvironment({ permission: 'granted', existingSubscription: createMockSubscription() })

    const result = await settleWithin(loadPushNotificationState('account-a'))

    expect(result.status).toBe('not-registered')
  })

  it('registers the push worker for the whole origin before reading the subscription', async () => {
    const { register, getSubscription } = setupPushEnvironment({ permission: 'granted' })

    await settleWithin(loadPushNotificationState('account-a'))

    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/', updateViaCache: 'none' })
    expect(getSubscription).toHaveBeenCalledTimes(1)
  })

  it('returns sync-failed instead of hanging when the worker cannot register', async () => {
    setupPushEnvironment({
      permission: 'granted',
      registerRejects: true,
    })

    const result = await settleWithin(loadPushNotificationState('account-a'))

    expect(result).toEqual({
      supported: true,
      subscribed: false,
      permission: 'granted',
      status: 'sync-failed',
    })
  })

  it('returns denied when the user rejects the permission prompt', async () => {
    setupPushEnvironment({
      permission: 'default',
      requestPermissionResult: 'denied',
    })

    const result = await settleWithin(subscribeToPushNotifications())

    expect(result).toEqual({
      supported: true,
      subscribed: false,
      permission: 'denied',
      status: 'denied',
    })
  })

  it('subscribes and syncs the backend when the user grants permission', async () => {
    const staleSubscription = createMockSubscription('https://example.com/stale')
    const nextSubscription = createMockSubscription('https://example.com/current')
    const { subscribe } = setupPushEnvironment({
      permission: 'default',
      requestPermissionResult: 'granted',
      existingSubscription: staleSubscription,
      subscribeResult: nextSubscription,
    })
    mockSubscribePush.mockResolvedValue(undefined)

    const result = await settleWithin(subscribeToPushNotifications())

    expect(staleSubscription.unsubscribe).toHaveBeenCalledTimes(1)
    expect(subscribe).toHaveBeenCalledTimes(1)
    expect(mockSubscribePush).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      supported: true,
      subscribed: true,
      permission: 'granted',
      status: 'registered',
    })
  })

  it('cleans up the new subscription when the backend subscribe call fails', async () => {
    const subscription = createMockSubscription()
    setupPushEnvironment({
      permission: 'granted',
      subscribeResult: subscription,
    })
    mockSubscribePush.mockRejectedValue(new Error('Server error'))

    await expect(settleWithin(subscribeToPushNotifications())).rejects.toThrow('Failed to persist push subscription')
    expect(subscription.unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('releases the prior API row before rotating the browser endpoint at onboarding', async () => {
    const previous = createMockSubscription('https://example.com/account-a')
    const next = createMockSubscription('https://example.com/account-b')
    const owners = new Map([[previous.endpoint, 'account-a']])
    setupPushEnvironment({ existingSubscription: previous, subscribeResult: next })
    setAccountId('account-b')
    mockUnsubscribePush.mockImplementation(async (subscription: PushSubscriptionJSON) => {
      expect(previous.unsubscribe).not.toHaveBeenCalled()
      owners.delete(subscription.endpoint!)
    })
    mockSubscribePush.mockImplementation(async (subscription: PushSubscriptionJSON) => {
      owners.set(subscription.endpoint!, 'account-b')
    })

    expect((await settleWithin(subscribeToPushNotifications())).status).toBe('registered')
    expect(owners).toEqual(new Map([[next.endpoint, 'account-b']]))
    expect(previous.unsubscribe).toHaveBeenCalledOnce()
    expect(mockUnsubscribePush).toHaveBeenCalledWith(expect.objectContaining({
      ...previous.toJSON(), releaseOtherAccount: true,
    }))
  })

  it('finishes new registration when releasing the prior API endpoint fails', async () => {
    const previous = createMockSubscription('https://example.com/account-a')
    const next = createMockSubscription('https://example.com/account-b')
    setupPushEnvironment({ existingSubscription: previous, subscribeResult: next })
    mockUnsubscribePush.mockRejectedValue(new TypeError('Failed to fetch'))

    expect((await settleWithin(subscribeToPushNotifications())).status).toBe('registered')
    expect(mockUnsubscribePush).toHaveBeenCalledOnce()
    expect(previous.unsubscribe).toHaveBeenCalledOnce()
    expect(mockSubscribePush).toHaveBeenCalledWith(next.toJSON())
  })

  it('releases the foreign API row with device keys once the replacement session becomes active', async () => {
    const { subscription } = await enablePushAs('account-a')
    let owner: string | null = 'account-a'
    mockUnsubscribePush.mockImplementation(async (submitted: PushSubscriptionJSON & { releaseOtherAccount?: boolean }) => {
      if (submitted.releaseOtherAccount && submitted.endpoint === subscription.endpoint) owner = null
    })

    startAccountScopedSession('account-a', 'account-b')
    await vi.waitFor(() => expect(subscription.unsubscribe).toHaveBeenCalledOnce())
    expect(owner).toBeNull()
    expect(mockUnsubscribePush).toHaveBeenCalledWith({ ...subscription.toJSON(), releaseOtherAccount: true })
  })

  it('keeps the new account subscription when account-switch cleanup has a pending browser lookup', async () => {
    const { subscription: previousSubscription, getRegistration, getSubscription, subscribe } = await enablePushAs('account-a')
    const nextSubscription = createMockSubscription('https://example.com/account-b')
    subscribe.mockImplementationOnce(async () => {
      getSubscription.mockResolvedValue(nextSubscription)
      return nextSubscription
    })
    let finishLookup: (registration: MockRegistration) => void = () => undefined
    getRegistration.mockReturnValueOnce(new Promise<MockRegistration>((resolve) => { finishLookup = resolve }))
    let finishPersist: () => void = () => undefined
    mockSubscribePush.mockReturnValueOnce(new Promise<void>((resolve) => { finishPersist = resolve }))

    startAccountScopedSession('account-a', 'account-b')
    await vi.waitFor(() => expect(getRegistration).toHaveBeenCalledTimes(1))
    const { result } = renderHook(() => usePushNotificationPreferences())
    await waitFor(() => expect(result.current.status).toBe('not-registered'))
    await act(async () => {
      const optedIn = result.current.togglePush()
      await new Promise((resolve) => setTimeout(resolve, 0))
      finishLookup({ pushManager: { getSubscription, subscribe } })
      await vi.waitFor(() => expect(mockSubscribePush).toHaveBeenCalledTimes(1))
      finishPersist()
      await settleWithin(optedIn)
    })

    expect(previousSubscription.unsubscribe).toHaveBeenCalledTimes(1)
    expect(nextSubscription.unsubscribe).not.toHaveBeenCalled()
    expect(isPushSubscriptionOwner('account-b')).toBe(true)
    expect(result.current.status).toBe('registered')
    expect((await settleWithin(loadPushNotificationState('account-b'))).status).toBe('registered')
  })

  it('waits for persistence and ownership before cleanup inspects an opt-in already in progress', async () => {
    const subscription = createMockSubscription('https://example.com/account-b')
    setupPushEnvironment({ permission: 'granted', subscribeResult: subscription })
    setAccountId('account-b')
    let finishPersist: () => void = () => undefined
    mockSubscribePush.mockReturnValueOnce(new Promise<void>((resolve) => { finishPersist = resolve }))

    const optedIn = subscribeToPushNotifications()
    await vi.waitFor(() => expect(mockSubscribePush).toHaveBeenCalledTimes(1))
    const cleanedUp = discardForeignPushSubscription('account-b')
    await new Promise((resolve) => setTimeout(resolve, 0))
    finishPersist()
    await settleWithin(Promise.all([optedIn, cleanedUp]))

    expect(subscription.unsubscribe).not.toHaveBeenCalled()
    expect(isPushSubscriptionOwner('account-b')).toBe(true)
    expect((await settleWithin(loadPushNotificationState('account-b'))).status).toBe('registered')
  })

  it('refuses to subscribe without a VAPID key before prompting or dropping the current subscription', async () => {
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    const existingSubscription = createMockSubscription()
    const { requestPermission, subscribe } = setupPushEnvironment({
      permission: 'default',
      requestPermissionResult: 'granted',
      existingSubscription,
    })

    await expect(settleWithin(subscribeToPushNotifications())).rejects.toThrow('Missing VAPID public key')
    expect(requestPermission).not.toHaveBeenCalled()
    expect(existingSubscription.unsubscribe).not.toHaveBeenCalled()
    expect(subscribe).not.toHaveBeenCalled()
  })

  it('reports a failed worker registration when subscribing instead of hanging', async () => {
    const { subscribe } = setupPushEnvironment({ permission: 'granted', registerRejects: true })

    await expect(settleWithin(subscribeToPushNotifications())).rejects.toThrow(
      'Failed to register a ServiceWorker',
    )
    expect(subscribe).not.toHaveBeenCalled()
    expect(mockSubscribePush).not.toHaveBeenCalled()
  })

  it('unsubscribes the current subscription and reports not-registered', async () => {
    const subscription = createMockSubscription()
    setupPushEnvironment({
      permission: 'granted',
      existingSubscription: subscription,
    })
    mockUnsubscribePush.mockResolvedValue(undefined)

    const result = await settleWithin(unsubscribeFromPushNotifications('granted'))

    expect(mockUnsubscribePush).toHaveBeenCalledTimes(1)
    expect(subscription.unsubscribe).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      supported: true,
      subscribed: false,
      permission: 'granted',
      status: 'not-registered',
    })
  })

  it('keeps the browser subscription when account refusal blocks unsubscribe', async () => {
    const subscription = createMockSubscription()
    setupPushEnvironment({ permission: 'granted', existingSubscription: subscription })
    mockUnsubscribePush.mockRejectedValue(Object.assign(new Error('Account changed'), { code: 'ACCOUNT_CHANGED' }))

    await expect(settleWithin(unsubscribeFromPushNotifications('granted'))).rejects.toMatchObject({ code: 'ACCOUNT_CHANGED' })
    expect(subscription.unsubscribe).not.toHaveBeenCalled()
  })
})

describe('releasing this browser push subscription at logout', () => {
  beforeEach(() => {
    installWebLocks()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    mockSubscribePush.mockReset()
    mockUnsubscribePush.mockReset()
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'dGVzdA'
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('removes the subscription on the API while signed in, then in the browser', async () => {
    const { subscription } = await enablePushAs('account-a')
    let finishApiCall: () => void = () => undefined
    mockUnsubscribePush.mockReturnValue(new Promise<void>((resolve) => {
      finishApiCall = resolve
    }))

    const released = pushPreferences.releasePushSubscription('account-a')
    await vi.waitFor(() => expect(mockUnsubscribePush).toHaveBeenCalledTimes(1))
    expect(subscription.unsubscribe).not.toHaveBeenCalled()
    finishApiCall()
    await settleWithin(released)

    expect(mockUnsubscribePush).toHaveBeenCalledWith(subscription.toJSON())
    expect(subscription.unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('still ends the browser subscription when the API call fails, so the API drops it on its next send', async () => {
    const { subscription } = await enablePushAs('account-a')
    const failure = new Error('network down')
    mockUnsubscribePush.mockRejectedValue(failure)

    await expect(settleWithin(pushPreferences.releasePushSubscription('account-a'))).rejects.toBe(failure)

    expect(subscription.unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('never registers a worker just to find there is nothing to release', async () => {
    const { register, getSubscription } = setupPushEnvironment({ permission: 'granted' })

    await settleWithin(pushPreferences.releasePushSubscription('account-a'))

    expect(register).not.toHaveBeenCalled()
    expect(getSubscription).not.toHaveBeenCalled()
    expect(mockUnsubscribePush).not.toHaveBeenCalled()
  })
})

describe('usePushNotificationPreferences hook', () => {
  const originalVapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

  beforeEach(() => {
    installWebLocks()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    mockSubscribePush.mockReset()
    mockUnsubscribePush.mockReset()
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'dGVzdA'
    setAccountId('account-a')
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    if (originalVapidKey === undefined) {
      delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      return
    }
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = originalVapidKey
  })

  it('reports a checking state, never unsupported, until the browser answers', async () => {
    await enablePushAs('account-a')
    const statuses: string[] = []
    const { result } = renderHook(() => {
      const preferences = usePushNotificationPreferences()
      statuses.push(preferences.status)
      return preferences
    })

    expect(statuses[0]).toBe('checking')
    await waitFor(() => expect(result.current.status).toBe('registered'))
    expect(statuses).not.toContain('unsupported')
  })

  it('reports unsupported once checked in a browser without push', async () => {
    const { result } = renderHook(() => usePushNotificationPreferences())

    await waitFor(() => expect(result.current.status).toBe('unsupported'))
    expect(result.current.supported).toBe(false)
  })

  it('shows sync-failed on mount and on toggle when the worker cannot register', async () => {
    setupPushEnvironment({ permission: 'granted', registerRejects: true })
    const { result } = renderHook(() => usePushNotificationPreferences())
    await waitFor(() => expect(result.current.status).toBe('sync-failed'))

    await act(async () => {
      await settleWithin(result.current.togglePush())
    })

    expect(result.current.status).toBe('sync-failed')
    expect(result.current.loading).toBe(false)
  })

  it('loads the current subscription snapshot on mount', async () => {
    await enablePushAs('account-a')
    const { result } = renderHook(() => usePushNotificationPreferences())
    await waitFor(() => expect(result.current.status).toBe('registered'))
    expect(result.current.subscribed).toBe(true)
  })

  it('waits for the signed-in account before it reads the browser subscription', async () => {
    const { getSubscription } = await enablePushAs('account-a')
    setAccountId(null)
    const { result } = renderHook(() => usePushNotificationPreferences())
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })

    expect(result.current.status).toBe('checking')
    expect(getSubscription).not.toHaveBeenCalled()

    act(() => setAccountId('account-a'))
    await waitFor(() => expect(result.current.status).toBe('registered'))
  })

  it('stops reporting registered when another account takes over the page', async () => {
    await enablePushAs('account-a')
    const { result } = renderHook(() => usePushNotificationPreferences())
    await waitFor(() => expect(result.current.status).toBe('registered'))

    act(() => setAccountId('account-b'))

    await waitFor(() => expect(result.current.status).toBe('not-registered'))
    expect(result.current.subscribed).toBe(false)
  })

  it('subscribes when toggled while unsubscribed', async () => {
    setupPushEnvironment({ permission: 'granted', existingSubscription: null })
    mockSubscribePush.mockResolvedValue(undefined)
    const { result } = renderHook(() => usePushNotificationPreferences())
    await waitFor(() => expect(result.current.status).toBe('not-registered'))

    await act(async () => {
      await result.current.togglePush()
    })

    expect(mockSubscribePush).toHaveBeenCalledTimes(1)
    expect(result.current.subscribed).toBe(true)
    expect(result.current.loading).toBe(false)
  })

  it('unsubscribes when toggled while subscribed', async () => {
    await enablePushAs('account-a')
    mockUnsubscribePush.mockResolvedValue(undefined)
    const { result } = renderHook(() => usePushNotificationPreferences())
    await waitFor(() => expect(result.current.subscribed).toBe(true))

    await act(async () => {
      await result.current.togglePush()
    })

    expect(mockUnsubscribePush).toHaveBeenCalledTimes(1)
    expect(result.current.subscribed).toBe(false)
    expect(result.current.status).toBe('not-registered')
  })

  it('reports sync-failed when a toggle throws', async () => {
    setupPushEnvironment({ permission: 'granted', existingSubscription: null })
    mockSubscribePush.mockRejectedValue(new Error('backend down'))
    const { result } = renderHook(() => usePushNotificationPreferences())
    await waitFor(() => expect(result.current.status).toBe('not-registered'))

    await act(async () => {
      await result.current.togglePush()
    })

    expect(result.current.status).toBe('sync-failed')
    expect(result.current.loading).toBe(false)
  })

  it('keeps registered state when account refusal blocks unsubscribe', async () => {
    const { subscription } = await enablePushAs('account-a')
    mockUnsubscribePush.mockRejectedValue(Object.assign(new Error('Account changed'), { code: 'ACCOUNT_CHANGED' }))
    const { result } = renderHook(() => usePushNotificationPreferences())
    await waitFor(() => expect(result.current.subscribed).toBe(true))

    await act(async () => { await result.current.togglePush() })
    expect(result.current.status).toBe('registered')
    expect(result.current.subscribed).toBe(true)
    expect(subscription.unsubscribe).not.toHaveBeenCalled()
  })
})

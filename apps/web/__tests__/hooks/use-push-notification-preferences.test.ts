import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const mockSubscribePush = vi.fn()
const mockUnsubscribePush = vi.fn()
vi.mock('@/lib/actions/notifications', () => ({
  subscribePush: (...args: unknown[]) => mockSubscribePush(...args),
  unsubscribePush: (...args: unknown[]) => mockUnsubscribePush(...args),
}))

import {
  getPushStatusMessageKey,
  getPushStatusTone,
  loadPushNotificationState,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
  usePushNotificationPreferences,
} from '@/hooks/use-push-notification-preferences'

interface MockPushSubscription {
  endpoint: string
  toJSON: () => { keys: { p256dh: string; auth: string } }
  unsubscribe: ReturnType<typeof vi.fn>
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

/** Mirrors the browser: `ready` never settles until something registers a worker for the page. */
function createServiceWorkerContainer(registration: MockRegistration, registerRejects: boolean) {
  let activate: (value: MockRegistration) => void = () => undefined
  const ready = new Promise<MockRegistration>((resolve) => {
    activate = resolve
  })
  const register = registerRejects
    ? vi.fn().mockRejectedValue(new TypeError('Failed to register a ServiceWorker'))
    : vi.fn(async () => {
        activate(registration)
        return registration
      })
  return { ready, register }
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
      keys: {
        p256dh: 'p256dh-key',
        auth: 'auth-key',
      },
    }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  }
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
  const getSubscription = vi.fn().mockResolvedValue(existingSubscription)
  const subscribe = vi.fn().mockResolvedValue(subscribeResult)
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
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    mockSubscribePush.mockReset()
    mockUnsubscribePush.mockReset()
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'dGVzdA'
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
    const result = await settleWithin(loadPushNotificationState())

    expect(result).toEqual({
      supported: false,
      subscribed: false,
      permission: '',
      status: 'unsupported',
    })
  })

  it('loads a registered subscription when permission is granted and a subscription exists', async () => {
    const subscription = createMockSubscription()
    setupPushEnvironment({
      permission: 'granted',
      existingSubscription: subscription,
    })

    const result = await settleWithin(loadPushNotificationState())

    expect(result).toEqual({
      supported: true,
      subscribed: true,
      permission: 'granted',
      status: 'registered',
    })
  })

  it('registers the push worker for the whole origin before reading the subscription', async () => {
    const { register, getSubscription } = setupPushEnvironment({ permission: 'granted' })

    await settleWithin(loadPushNotificationState())

    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/', updateViaCache: 'none' })
    expect(getSubscription).toHaveBeenCalledTimes(1)
  })

  it('returns sync-failed instead of hanging when the worker cannot register', async () => {
    setupPushEnvironment({
      permission: 'granted',
      registerRejects: true,
    })

    const result = await settleWithin(loadPushNotificationState())

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

describe('usePushNotificationPreferences hook', () => {
  const originalVapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    mockSubscribePush.mockReset()
    mockUnsubscribePush.mockReset()
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'dGVzdA'
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
    setupPushEnvironment({ permission: 'granted', existingSubscription: createMockSubscription() })
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
    setupPushEnvironment({ permission: 'granted', existingSubscription: createMockSubscription() })
    const { result } = renderHook(() => usePushNotificationPreferences())
    await waitFor(() => expect(result.current.status).toBe('registered'))
    expect(result.current.subscribed).toBe(true)
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
    const subscription = createMockSubscription()
    setupPushEnvironment({ permission: 'granted', existingSubscription: subscription })
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
    const subscription = createMockSubscription()
    setupPushEnvironment({ permission: 'granted', existingSubscription: subscription })
    mockUnsubscribePush.mockRejectedValue(Object.assign(new Error('Account changed'), { code: 'ACCOUNT_CHANGED' }))
    const { result } = renderHook(() => usePushNotificationPreferences())
    await waitFor(() => expect(result.current.subscribed).toBe(true))

    await act(async () => { await result.current.togglePush() })
    expect(result.current.status).toBe('registered')
    expect(result.current.subscribed).toBe(true)
    expect(subscription.unsubscribe).not.toHaveBeenCalled()
  })
})

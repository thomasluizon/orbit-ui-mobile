import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the server actions before importing the module under test
const mockSubscribePush = vi.fn()
const mockUnsubscribePush = vi.fn()
vi.mock('@/app/actions/notifications', () => ({
  subscribePush: (...args: unknown[]) => mockSubscribePush(...args),
  unsubscribePush: (...args: unknown[]) => mockUnsubscribePush(...args),
}))

import {
  getPushStatusMessageKey,
  getPushStatusTone,
  loadPushNotificationState,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
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
  readyRejects?: boolean
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
  const ready = options.readyRejects
    ? Promise.reject(new Error('service worker unavailable'))
    : Promise.resolve({
        pushManager: {
          getSubscription,
          subscribe,
        },
      })

  vi.stubGlobal('Notification', {
    permission,
    requestPermission: vi.fn().mockResolvedValue(requestPermissionResult),
  })
  vi.stubGlobal('PushManager', class PushManager {})
  vi.stubGlobal('fetch', fetchMock)

  Object.defineProperty(global.navigator, 'serviceWorker', {
    configurable: true,
    value: { ready },
  })

  return {
    fetchMock,
    getSubscription,
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
    expect(getPushStatusTone('denied')).toBe('text-red-400')
    expect(getPushStatusTone('sync-failed')).toBe('text-red-400')
    expect(getPushStatusTone('registered')).toBe('text-primary')
    expect(getPushStatusTone('not-registered')).toBe('text-text-muted')
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
    const result = await loadPushNotificationState()

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

    const result = await loadPushNotificationState()

    expect(result).toEqual({
      supported: true,
      subscribed: true,
      permission: 'granted',
      status: 'registered',
    })
  })

  it('returns sync-failed when the service worker cannot be queried', async () => {
    setupPushEnvironment({
      permission: 'granted',
      readyRejects: true,
    })

    const result = await loadPushNotificationState()

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

    const result = await subscribeToPushNotifications()

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

    const result = await subscribeToPushNotifications()

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

    await expect(subscribeToPushNotifications()).rejects.toThrow('Failed to subscribe to push notifications')
    expect(subscription.unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('unsubscribes the current subscription and reports not-registered', async () => {
    const subscription = createMockSubscription()
    setupPushEnvironment({
      permission: 'granted',
      existingSubscription: subscription,
    })
    mockUnsubscribePush.mockResolvedValue(undefined)

    const result = await unsubscribeFromPushNotifications('granted')

    expect(mockUnsubscribePush).toHaveBeenCalledTimes(1)
    expect(subscription.unsubscribe).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      supported: true,
      subscribed: false,
      permission: 'granted',
      status: 'not-registered',
    })
  })
})

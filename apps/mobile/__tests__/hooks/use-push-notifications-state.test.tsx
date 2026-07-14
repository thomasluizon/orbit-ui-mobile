import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'

const TestRenderer = require('react-test-renderer')
const mocks = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  apiClient: vi.fn(async () => undefined),
  router: {
    push: vi.fn(),
  },
  appState: {
    listener: null as ((state: string) => void) | null,
  },
  constants: {
    appOwnership: 'standalone',
    expoGoConfig: null,
    expoConfig: {},
    easConfig: {},
  },
  device: {
    isDevice: true,
  },
  auth: {
    isAuthenticated: true,
    user: { userId: 'user-1' } as { userId: string } | null,
  },
}))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => mocks.storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      mocks.storage.set(key, value)
    }),
    removeItem: vi.fn(async (key: string) => {
      mocks.storage.delete(key)
    }),
  },
}))

vi.mock('react-native', async (importOriginal) => {
  const actual = await importOriginal() as typeof import('react-native')
  return {
    ...actual,
    Platform: {
      ...actual.Platform,
      OS: 'android',
    },
    AppState: {
      addEventListener: vi.fn((_eventName: string, listener: (state: string) => void) => {
        mocks.appState.listener = listener
        return {
          remove: vi.fn(() => {
            mocks.appState.listener = null
          }),
        }
      }),
    },
  }
})

vi.mock('expo-constants', () => ({
  __esModule: true,
  default: mocks.constants,
  appOwnership: mocks.constants.appOwnership,
  expoConfig: mocks.constants.expoConfig,
  easConfig: mocks.constants.easConfig,
}))

vi.mock('expo-device', () => ({
  __esModule: true,
  default: mocks.device,
  isDevice: mocks.device.isDevice,
}))

vi.mock('expo-router', () => ({
  useRouter: () => mocks.router,
}))

vi.mock('@/lib/api-client', () => ({
  apiClient: mocks.apiClient,
}))

vi.mock('@/stores/auth-store', () => {
  const useAuthStore = (
    selector: (state: { isAuthenticated: boolean; user: { userId: string } | null }) => unknown,
  ) => selector(mocks.auth)
  useAuthStore.getState = () => mocks.auth
  return { useAuthStore }
})

type NotificationsModule = typeof import('expo-notifications')
type PermissionResponse = Awaited<ReturnType<NotificationsModule['getPermissionsAsync']>>
type UsePushNotificationsHook = typeof import('@/hooks/use-push-notifications')['usePushNotifications']
type UsePushNotificationsModule = typeof import('@/hooks/use-push-notifications')
type PushNotificationsResult = ReturnType<UsePushNotificationsHook>

function createPermissionResponse(
  status: 'granted' | 'denied' | 'undetermined',
  canAskAgain = true,
): PermissionResponse {
  return {
    status: status as PermissionResponse['status'],
    granted: status === 'granted',
    canAskAgain,
  } as PermissionResponse
}

describe('usePushNotifications', () => {
  let latestResult: PushNotificationsResult | null = null
  let notificationsModule: NotificationsModule
  let usePushNotifications: UsePushNotificationsHook
  let pushNotificationsModule: UsePushNotificationsModule

  function Harness() {
    latestResult = usePushNotifications()
    return null
  }

  async function renderHarness() {
    await TestRenderer.act(async () => {
      TestRenderer.create(<Harness />)
      await Promise.resolve()
    })
  }

  async function flush() {
    await TestRenderer.act(async () => {
      for (let i = 0; i < 10; i++) await Promise.resolve()
    })
  }

  beforeEach(async () => {
    vi.resetModules()
    latestResult = null
    mocks.storage.clear()
    mocks.apiClient.mockClear()
    mocks.router.push.mockClear()
    mocks.appState.listener = null
    mocks.auth.isAuthenticated = true
    mocks.auth.user = { userId: 'user-1' }
    notificationsModule = await import('expo-notifications')
    vi.mocked(notificationsModule.setNotificationHandler).mockClear()
    vi.mocked(notificationsModule.setNotificationChannelAsync).mockReset()
    vi.mocked(notificationsModule.setNotificationChannelAsync).mockResolvedValue(null)
    vi.mocked(notificationsModule.getPermissionsAsync).mockReset()
    vi.mocked(notificationsModule.getPermissionsAsync).mockResolvedValue(
      createPermissionResponse('undetermined'),
    )
    vi.mocked(notificationsModule.requestPermissionsAsync).mockReset()
    vi.mocked(notificationsModule.requestPermissionsAsync).mockResolvedValue(
      createPermissionResponse('granted'),
    )
    vi.mocked(notificationsModule.getExpoPushTokenAsync).mockReset()
    vi.mocked(notificationsModule.getExpoPushTokenAsync).mockResolvedValue({
      type: 'expo',
      data: 'expo-token',
    })
    vi.mocked(notificationsModule.getDevicePushTokenAsync).mockReset()
    vi.mocked(notificationsModule.getDevicePushTokenAsync).mockResolvedValue({
      type: 'fcm',
      data: 'native-token',
    })
    vi.mocked(notificationsModule.addNotificationResponseReceivedListener).mockReset()
    vi.mocked(notificationsModule.addNotificationResponseReceivedListener).mockImplementation(() => ({
      remove: vi.fn(),
    }))
    pushNotificationsModule = await import('@/hooks/use-push-notifications')
    pushNotificationsModule.__setNotificationsModuleForTests(notificationsModule)
    usePushNotifications = pushNotificationsModule.usePushNotifications
  })

  it('keeps Orbit notifications disabled after the user opted out locally', async () => {
    mocks.storage.set('orbit_push_disabled:user-1', '1')
    vi.mocked(notificationsModule.getPermissionsAsync).mockResolvedValue(
      createPermissionResponse('granted'),
    )

    await renderHarness()

    expect(latestResult?.registrationStatus).toBe('disabled')
    expect(latestResult?.isEnabled).toBe(false)
    expect(mocks.apiClient).not.toHaveBeenCalled()
  })

  it('re-registers for the new account when it switches while a registration is in flight', async () => {
    vi.mocked(notificationsModule.getPermissionsAsync).mockResolvedValue(
      createPermissionResponse('granted'),
    )

    let resolveFirstSubscribe: (() => void) | null = null
    mocks.apiClient.mockImplementationOnce(
      () =>
        new Promise<undefined>((resolve) => {
          resolveFirstSubscribe = () => resolve(undefined)
        }),
    )

    await renderHarness()
    await TestRenderer.act(async () => {
      for (let i = 0; i < 10; i++) await Promise.resolve()
    })

    expect(typeof resolveFirstSubscribe).toBe('function')
    expect(mocks.apiClient).toHaveBeenCalledTimes(1)

    mocks.auth.user = { userId: 'user-2' }

    await TestRenderer.act(async () => {
      resolveFirstSubscribe?.()
      for (let i = 0; i < 10; i++) await Promise.resolve()
    })

    expect(mocks.apiClient).toHaveBeenCalledTimes(2)
    expect(latestResult?.registrationStatus).toBe('registered')
    expect(mocks.storage.get('orbit_push_disabled:user-1')).toBeUndefined()
    expect(mocks.storage.get('orbit_push_disabled:user-2')).toBeUndefined()
  })

  it('subscribes with the current payload shape and unsubscribes without re-registering on resume', async () => {
    vi.mocked(notificationsModule.getPermissionsAsync).mockResolvedValue(
      createPermissionResponse('granted'),
    )

    await renderHarness()

    expect(mocks.apiClient).toHaveBeenCalledWith(
      API.notifications.subscribe,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          endpoint: 'native-token',
          p256dh: 'fcm',
          auth: 'fcm',
        }),
      }),
    )
    expect(latestResult?.registrationStatus).toBe('registered')
    expect(latestResult?.isEnabled).toBe(true)

    await TestRenderer.act(async () => {
      await latestResult?.disablePushNotifications()
    })

    expect(mocks.apiClient).toHaveBeenCalledWith(
      API.notifications.unsubscribe,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          endpoint: 'native-token',
          p256dh: 'fcm',
          auth: 'fcm',
        }),
      }),
    )
    expect(latestResult?.registrationStatus).toBe('disabled')
    expect(latestResult?.isEnabled).toBe(false)
    expect(mocks.storage.get('orbit_push_disabled:user-1')).toBe('1')

    await TestRenderer.act(async () => {
      mocks.appState.listener?.('active')
      await Promise.resolve()
    })

    expect(mocks.apiClient).toHaveBeenCalledTimes(2)
    expect(latestResult?.registrationStatus).toBe('disabled')
  })

  it('leaves registration undetermined until the user is prompted', async () => {
    await renderHarness()
    await flush()

    expect(latestResult?.permissionStatus).toBe('undetermined')
    expect(latestResult?.registrationStatus).toBe('permission-undetermined')
    expect(latestResult?.isEnabled).toBe(false)
    expect(mocks.apiClient).not.toHaveBeenCalled()
  })

  it('reports a permanently denied permission from the initial sync', async () => {
    vi.mocked(notificationsModule.getPermissionsAsync).mockResolvedValue(
      createPermissionResponse('denied', false),
    )

    await renderHarness()
    await flush()

    expect(latestResult?.permissionStatus).toBe('denied')
    expect(latestResult?.registrationStatus).toBe('permission-denied')
    expect(latestResult?.permissionCanAskAgain).toBe(false)
    expect(mocks.apiClient).not.toHaveBeenCalled()
  })

  it('prompts for permission and registers once the user grants it', async () => {
    vi.mocked(notificationsModule.getPermissionsAsync).mockResolvedValue(
      createPermissionResponse('undetermined'),
    )
    vi.mocked(notificationsModule.requestPermissionsAsync).mockResolvedValue(
      createPermissionResponse('granted'),
    )

    await renderHarness()
    await flush()

    let outcome = false
    await TestRenderer.act(async () => {
      outcome = (await latestResult?.requestPermission()) ?? false
    })

    expect(outcome).toBe(true)
    expect(notificationsModule.requestPermissionsAsync).toHaveBeenCalled()
    expect(mocks.apiClient).toHaveBeenCalledWith(
      API.notifications.subscribe,
      expect.objectContaining({ method: 'POST' }),
    )
    expect(latestResult?.registrationStatus).toBe('registered')
    expect(latestResult?.isEnabled).toBe(true)
  })

  it('does not re-prompt when permission is permanently denied', async () => {
    vi.mocked(notificationsModule.getPermissionsAsync).mockResolvedValue(
      createPermissionResponse('denied', false),
    )

    await renderHarness()
    await flush()

    let outcome = true
    await TestRenderer.act(async () => {
      outcome = (await latestResult?.requestPermission()) ?? true
    })

    expect(outcome).toBe(false)
    expect(notificationsModule.requestPermissionsAsync).not.toHaveBeenCalled()
    expect(latestResult?.registrationStatus).toBe('permission-denied')
  })

  it('refuses to disable push notifications while unauthenticated', async () => {
    mocks.auth.isAuthenticated = false
    vi.mocked(notificationsModule.getPermissionsAsync).mockResolvedValue(
      createPermissionResponse('granted'),
    )

    await renderHarness()
    await flush()

    let outcome = true
    await TestRenderer.act(async () => {
      outcome = (await latestResult?.disablePushNotifications()) ?? true
    })

    expect(outcome).toBe(false)
    expect(latestResult?.registrationStatus).toBe('sync-failed')
    expect(mocks.apiClient).not.toHaveBeenCalledWith(
      API.notifications.unsubscribe,
      expect.anything(),
    )
  })

  it('routes a tapped notification to a safe in-app path and ignores external URLs', async () => {
    let responseListener: ((response: unknown) => void) | null = null
    vi.mocked(notificationsModule.addNotificationResponseReceivedListener).mockImplementation(
      (listener) => {
        responseListener = listener as unknown as (response: unknown) => void
        return { remove: vi.fn() }
      },
    )

    await renderHarness()
    await flush()

    const notify = responseListener as unknown as (response: unknown) => void
    expect(notify).toBeTypeOf('function')

    const buildResponse = (url: unknown) => ({
      notification: { request: { content: { data: { url } } } },
    })

    await TestRenderer.act(async () => {
      notify(buildResponse('/social'))
    })
    expect(mocks.router.push).toHaveBeenCalledWith('/social')

    mocks.router.push.mockClear()
    await TestRenderer.act(async () => {
      notify(buildResponse('https://evil.example'))
      notify(buildResponse('//evil.example'))
      notify({ notification: { request: { content: {} } } })
    })
    expect(mocks.router.push).not.toHaveBeenCalled()
  })

  it('reports unsupported and no-ops the actions when the module is unavailable', async () => {
    pushNotificationsModule.__setNotificationsModuleForTests(null)

    await renderHarness()
    await flush()

    expect(latestResult?.isSupported).toBe(false)
    expect(latestResult?.registrationStatus).toBe('unsupported')

    let requestOutcome = true
    let disableOutcome = true
    await TestRenderer.act(async () => {
      requestOutcome = (await latestResult?.requestPermission()) ?? true
      disableOutcome = (await latestResult?.disablePushNotifications()) ?? true
    })

    expect(requestOutcome).toBe(false)
    expect(disableOutcome).toBe(false)
    expect(mocks.apiClient).not.toHaveBeenCalled()
  })

  it('best-effort unsubscribes the current device token during logout', async () => {
    await pushNotificationsModule.unsubscribePushToken()

    expect(mocks.apiClient).toHaveBeenCalledWith(
      API.notifications.unsubscribe,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ endpoint: 'native-token', p256dh: 'fcm', auth: 'fcm' }),
      }),
    )
  })

  it('retries a transient native-token failure before unsubscribing', async () => {
    vi.mocked(notificationsModule.getDevicePushTokenAsync).mockReset()
    vi.mocked(notificationsModule.getDevicePushTokenAsync)
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValue({ type: 'fcm', data: 'native-token' })

    await pushNotificationsModule.unsubscribePushToken()

    expect(notificationsModule.getDevicePushTokenAsync).toHaveBeenCalledTimes(2)
    expect(mocks.apiClient).toHaveBeenCalledWith(
      API.notifications.unsubscribe,
      expect.anything(),
    )
  })

  it('swallows a token lookup failure during logout without calling the backend', async () => {
    vi.mocked(notificationsModule.getDevicePushTokenAsync).mockReset()
    vi.mocked(notificationsModule.getDevicePushTokenAsync).mockRejectedValue(new Error('no token'))

    await expect(pushNotificationsModule.unsubscribePushToken()).resolves.toBeUndefined()

    expect(mocks.apiClient).not.toHaveBeenCalledWith(
      API.notifications.unsubscribe,
      expect.anything(),
    )
  })
})

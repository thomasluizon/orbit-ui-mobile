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
    expoConfig: {},
    easConfig: {},
  },
  device: {
    isDevice: true,
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

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: { isAuthenticated: boolean; user: { userId: string } | null }) => unknown) =>
    selector({
      isAuthenticated: true,
      user: { userId: 'user-1' },
    }),
}))

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

  beforeEach(async () => {
    vi.resetModules()
    latestResult = null
    mocks.storage.clear()
    mocks.apiClient.mockClear()
    mocks.router.push.mockClear()
    mocks.appState.listener = null
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
})

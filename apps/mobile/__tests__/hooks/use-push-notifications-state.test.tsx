import React from 'react'
import type { ReactTestRenderer } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'

const TestRenderer = require('react-test-renderer')
const mocks = vi.hoisted(() => {
  const auth: { isAuthenticated: boolean; user: { userId: string } | null } = {
    isAuthenticated: true,
    user: { userId: 'user-1' },
  }
  return {
    storage: new Map<string, string>(),
    setAstraConversationOpen: vi.fn(),
    apiClient: vi.fn((_path: string, _options?: { isCurrent?: () => boolean }) => Promise.resolve(undefined)),
    router: {
      push: vi.fn(),
    },
    appState: {
      listener: null as ((state: string) => void) | null,
    },
    constants: {
      appOwnership: 'standalone',
      executionEnvironment: 'standalone',
      expoGoConfig: { name: 'Orbit' },
      expoConfig: {},
      easConfig: {},
    },
    device: {
      isDevice: true,
    },
    expoGo: false,
    auth,
  }
})

vi.mock('expo', () => ({
  isRunningInExpoGo: () => mocks.expoGo,
}))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn((key: string) => Promise.resolve(mocks.storage.get(key) ?? null)),
    setItem: vi.fn((key: string, value: string) => {
      mocks.storage.set(key, value)
      return Promise.resolve()
    }),
    removeItem: vi.fn((key: string) => {
      mocks.storage.delete(key)
      return Promise.resolve()
    }),
  },
}))

vi.mock('react-native', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-native')>()
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

vi.mock('@/stores/ui-store', () => ({
  useUIStore: (selector: (state: { setAstraConversationOpen: typeof mocks.setAstraConversationOpen }) => unknown) => selector(mocks),
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
type NotificationResponse = NonNullable<ReturnType<NotificationsModule['getLastNotificationResponse']>>
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

function createNotificationResponse(identifier: string, url: string): NotificationResponse {
  return {
    actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
    notification: {
      date: 1788670800000,
      request: {
        identifier,
        trigger: { type: 'push', channelId: null },
        content: { title: 'Reminder', data: { url } },
      },
    },
  } as unknown as NotificationResponse
}

describe('usePushNotifications', () => {
  let latestResult: PushNotificationsResult | null = null
  let globalPromptResult: PushNotificationsResult | null = null
  let profileSurfaceResult: PushNotificationsResult | null = null
  let notificationsModule: NotificationsModule
  let usePushNotifications: UsePushNotificationsHook
  let pushNotificationsModule: UsePushNotificationsModule
  let PushNotificationsProvider: UsePushNotificationsModule['PushNotificationsProvider']

  function Harness() {
    latestResult = usePushNotifications()
    return null
  }

  function GlobalPromptSurface() {
    globalPromptResult = usePushNotifications()
    return null
  }

  function ProfileNotificationSurface() {
    profileSurfaceResult = usePushNotifications()
    return null
  }

  function MountedPushSurfaces() {
    return (
      <>
        <GlobalPromptSurface />
        <ProfileNotificationSurface />
      </>
    )
  }

  async function renderHarness() {
    let renderer: ReactTestRenderer | undefined
    await TestRenderer.act(async () => {
      renderer = TestRenderer.create(
        <PushNotificationsProvider>
          <Harness />
        </PushNotificationsProvider>,
      )
      await Promise.resolve()
    })
    return renderer!
  }

  async function flush() {
    await TestRenderer.act(async () => {
      for (let i = 0; i < 10; i++) await Promise.resolve()
    })
  }

  beforeEach(async () => {
    vi.resetModules()
    latestResult = null
    globalPromptResult = null
    profileSurfaceResult = null
    mocks.storage.clear()
    mocks.apiClient.mockClear()
    mocks.router.push.mockClear()
    mocks.setAstraConversationOpen.mockClear()
    mocks.appState.listener = null
    mocks.auth.isAuthenticated = true
    mocks.auth.user = { userId: 'user-1' }
    mocks.expoGo = false
    mocks.constants.executionEnvironment = 'standalone'
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
    vi.mocked(notificationsModule.getLastNotificationResponse).mockReset()
    vi.mocked(notificationsModule.getLastNotificationResponse).mockReturnValue(null)
    vi.mocked(notificationsModule.clearLastNotificationResponse).mockReset()
    vi.mocked(notificationsModule.addNotificationResponseReceivedListener).mockReset()
    vi.mocked(notificationsModule.addNotificationResponseReceivedListener).mockImplementation(() => ({
      remove: vi.fn(),
    }))
    pushNotificationsModule = await import('@/hooks/use-push-notifications')
    pushNotificationsModule.__setNotificationsModuleForTests(notificationsModule)
    usePushNotifications = pushNotificationsModule.usePushNotifications
    PushNotificationsProvider = pushNotificationsModule.PushNotificationsProvider
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

  it('loads native notifications in a standalone embedded-manifest build', async () => {
    const moduleLoader = require('node:module') as {
      _load: (request: string, ...args: unknown[]) => unknown
    }
    const originalLoad = moduleLoader._load
    moduleLoader._load = (request, ...args) =>
      request === 'expo-notifications' ? notificationsModule : originalLoad(request, ...args)

    try {
      vi.resetModules()
      pushNotificationsModule = await import('@/hooks/use-push-notifications')
      usePushNotifications = pushNotificationsModule.usePushNotifications
      PushNotificationsProvider = pushNotificationsModule.PushNotificationsProvider
    } finally {
      moduleLoader._load = originalLoad
    }

    await renderHarness()

    expect(latestResult?.isSupported).toBe(true)
    expect(latestResult?.registrationStatus).toBe('permission-undetermined')
    expect(notificationsModule.getPermissionsAsync).toHaveBeenCalled()
    expect(notificationsModule.requestPermissionsAsync).not.toHaveBeenCalled()

    await pushNotificationsModule.unsubscribePushToken()
    expect(mocks.apiClient).toHaveBeenCalledWith(API.notifications.unsubscribe, expect.anything())
  })

  it('loads native notifications in a development client', async () => {
    mocks.constants.executionEnvironment = 'storeClient'
    const moduleLoader = require('node:module') as {
      _load: (request: string, ...args: unknown[]) => unknown
    }
    const originalLoad = moduleLoader._load
    moduleLoader._load = (request, ...args) =>
      request === 'expo-notifications' ? notificationsModule : originalLoad(request, ...args)

    try {
      vi.resetModules()
      pushNotificationsModule = await import('@/hooks/use-push-notifications')
      usePushNotifications = pushNotificationsModule.usePushNotifications
      PushNotificationsProvider = pushNotificationsModule.PushNotificationsProvider
    } finally {
      moduleLoader._load = originalLoad
    }

    await renderHarness()

    expect(latestResult?.isSupported).toBe(true)
    expect(notificationsModule.getPermissionsAsync).toHaveBeenCalled()
  })

  it('keeps Expo Go unsupported without loading native notifications', async () => {
    mocks.constants.executionEnvironment = 'storeClient'
    mocks.expoGo = true
    const moduleLoader = require('node:module') as {
      _load: (request: string, ...args: unknown[]) => unknown
    }
    const originalLoad = moduleLoader._load
    const loadNotifications = vi.fn(() => notificationsModule)
    moduleLoader._load = (request, ...args) =>
      request === 'expo-notifications' ? loadNotifications() : originalLoad(request, ...args)

    try {
      vi.resetModules()
      pushNotificationsModule = await import('@/hooks/use-push-notifications')
      usePushNotifications = pushNotificationsModule.usePushNotifications
      PushNotificationsProvider = pushNotificationsModule.PushNotificationsProvider
    } finally {
      moduleLoader._load = originalLoad
    }

    await renderHarness()

    expect(latestResult?.isSupported).toBe(false)
    expect(latestResult?.registrationStatus).toBe('unsupported')
    expect(loadNotifications).not.toHaveBeenCalled()
    expect(notificationsModule.getPermissionsAsync).not.toHaveBeenCalled()
    expect(mocks.apiClient).not.toHaveBeenCalled()
  })

  it('re-registers for the new account when it switches while a registration is in flight', async () => {
    const { setAccountId } = await import('@/lib/account-scope')
    const { advanceSessionEpoch } = await import('@/lib/session-epoch')
    setAccountId('user-1')
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

    const renderer = await renderHarness()
    await TestRenderer.act(async () => {
      for (let i = 0; i < 10; i++) await Promise.resolve()
    })

    expect(typeof resolveFirstSubscribe).toBe('function')
    expect(mocks.apiClient).toHaveBeenCalledTimes(1)

    mocks.auth.user = { userId: 'user-2' }
    setAccountId('user-2')
    advanceSessionEpoch()

    await TestRenderer.act(async () => {
      renderer.update(<PushNotificationsProvider><Harness /></PushNotificationsProvider>)
      resolveFirstSubscribe?.()
      for (let i = 0; i < 10; i++) await Promise.resolve()
    })

    expect(mocks.apiClient).toHaveBeenCalledTimes(2)
    expect(latestResult?.registrationStatus).toBe('registered')
    expect(mocks.storage.get('orbit_push_disabled:user-1')).toBeUndefined()
    expect(mocks.storage.get('orbit_push_disabled:user-2')).toBeUndefined()
  })

  it('does not register a token when there is no authenticated account', async () => {
    mocks.auth.isAuthenticated = false
    mocks.auth.user = null
    vi.mocked(notificationsModule.getPermissionsAsync).mockResolvedValue(
      createPermissionResponse('granted'),
    )

    await renderHarness()
    await flush()

    expect(notificationsModule.getDevicePushTokenAsync).toHaveBeenCalled()
    expect(mocks.apiClient).not.toHaveBeenCalled()
    expect(latestResult?.registrationStatus).toBe('idle')
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

  it('refreshes permission and registration after returning from Android Settings', async () => {
    vi.mocked(notificationsModule.getPermissionsAsync).mockResolvedValue(
      createPermissionResponse('denied', false),
    )

    await renderHarness()
    expect(latestResult?.isSupported).toBe(true)
    expect(latestResult?.registrationStatus).toBe('permission-denied')

    vi.mocked(notificationsModule.getPermissionsAsync).mockResolvedValue(
      createPermissionResponse('granted'),
    )
    await TestRenderer.act(async () => {
      mocks.appState.listener?.('active')
      await Promise.resolve()
    })

    expect(latestResult?.isSupported).toBe(true)
    expect(latestResult?.registrationStatus).toBe('registered')
    expect(latestResult?.isEnabled).toBe(true)
    expect(mocks.apiClient).toHaveBeenCalledWith(API.notifications.subscribe, expect.anything())
  })

  it('reports token and backend failures as supported retryable states', async () => {
    vi.mocked(notificationsModule.getPermissionsAsync).mockResolvedValue(
      createPermissionResponse('granted'),
    )
    vi.mocked(notificationsModule.getDevicePushTokenAsync).mockResolvedValue({
      type: 'fcm',
      data: '',
    })

    await renderHarness()
    await TestRenderer.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1600))
    })
    expect(latestResult?.isSupported).toBe(true)
    expect(latestResult?.registrationStatus).toBe('token-missing')
    expect(latestResult?.isEnabled).toBe(false)

    vi.mocked(notificationsModule.getDevicePushTokenAsync).mockResolvedValue({
      type: 'fcm',
      data: 'native-token',
    })
    mocks.apiClient.mockRejectedValue(new Error('offline'))
    await TestRenderer.act(async () => {
      await latestResult?.refreshPermissionStatus()
    })
    expect(latestResult?.registrationStatus).toBe('sync-failed')
    expect(latestResult?.isSupported).toBe(true)
    expect(latestResult?.isEnabled).toBe(false)

    mocks.apiClient.mockResolvedValue(undefined)
    await TestRenderer.act(async () => {
      await latestResult?.refreshPermissionStatus()
    })
    expect(latestResult?.registrationStatus).toBe('registered')
    expect(latestResult?.isEnabled).toBe(true)
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

  it('drops registration when the account changes while the API loads its token', async () => {
    const { setAccountId } = await import('@/lib/account-scope')
    setAccountId('user-1')
    let finishTokenLoad!: () => void
    let backendPostSent = false
    mocks.apiClient.mockImplementationOnce(async (_path: string, options?: { isCurrent?: () => boolean }) => {
      await new Promise<void>((resolve) => { finishTokenLoad = resolve })
      if (options?.isCurrent?.() === false) throw new Error('Account changed')
      backendPostSent = true
    })
    await renderHarness()
    await flush()

    let registration!: Promise<unknown>
    await TestRenderer.act(async () => {
      registration = latestResult!.requestPermissionOutcome()
      await Promise.resolve()
      await Promise.resolve()
    })
    await vi.waitFor(() => expect(mocks.apiClient).toHaveBeenCalledTimes(1))
    mocks.auth.user = { userId: 'user-2' }
    setAccountId('user-2')
    await TestRenderer.act(async () => {
      finishTokenLoad()
      await registration
    })

    expect(backendPostSent).toBe(false)
  })

  it('registers again for the same user after the session changes mid-registration', async () => {
    const { setAccountId } = await import('@/lib/account-scope')
    const { advanceSessionEpoch } = await import('@/lib/session-epoch')
    setAccountId('user-1')
    let finishFirstToken!: () => void
    vi.mocked(notificationsModule.getDevicePushTokenAsync).mockReturnValueOnce(
      new Promise((resolve) => { finishFirstToken = () => resolve({ type: 'fcm', data: 'old-token' }) }),
    )
    await renderHarness()
    await flush()

    let firstRegistration!: Promise<unknown>
    await TestRenderer.act(async () => {
      firstRegistration = latestResult!.requestPermissionOutcome()
      await Promise.resolve()
      await Promise.resolve()
    })
    await vi.waitFor(() => expect(notificationsModule.getDevicePushTokenAsync).toHaveBeenCalledTimes(1))

    advanceSessionEpoch()
    let secondRegistration!: Promise<unknown>
    await TestRenderer.act(async () => {
      secondRegistration = latestResult!.requestPermissionOutcome()
      await Promise.resolve()
      await Promise.resolve()
    })
    await vi.waitFor(() => expect(notificationsModule.getDevicePushTokenAsync).toHaveBeenCalledTimes(2))
    await TestRenderer.act(async () => { expect(await secondRegistration).toBe('granted') })
    expect(mocks.apiClient).toHaveBeenCalledTimes(1)

    await TestRenderer.act(async () => {
      finishFirstToken()
      expect(await firstRegistration).toBe('failed')
    })
    expect(mocks.apiClient).toHaveBeenCalledTimes(1)
    expect(latestResult?.registrationStatus).toBe('registered')
  })

  it('keeps the replacement registration loading when the obsolete request finishes first', async () => {
    const { setAccountId } = await import('@/lib/account-scope')
    const { advanceSessionEpoch } = await import('@/lib/session-epoch')
    setAccountId('user-1')
    let finishFirstToken!: () => void
    let finishSecondToken!: () => void
    vi.mocked(notificationsModule.getDevicePushTokenAsync)
      .mockReturnValueOnce(new Promise((resolve) => {
        finishFirstToken = () => resolve({ type: 'fcm', data: 'old-token' })
      }))
      .mockReturnValueOnce(new Promise((resolve) => {
        finishSecondToken = () => resolve({ type: 'fcm', data: 'new-token' })
      }))
    await renderHarness()
    await flush()

    let firstRegistration!: Promise<unknown>
    await TestRenderer.act(async () => {
      firstRegistration = latestResult!.requestPermissionOutcome()
      await Promise.resolve()
      await Promise.resolve()
    })
    await vi.waitFor(() => expect(notificationsModule.getDevicePushTokenAsync).toHaveBeenCalledTimes(1))

    advanceSessionEpoch()
    let secondRegistration!: Promise<unknown>
    await TestRenderer.act(async () => {
      secondRegistration = latestResult!.requestPermissionOutcome()
      await Promise.resolve()
      await Promise.resolve()
    })
    await vi.waitFor(() => expect(notificationsModule.getDevicePushTokenAsync).toHaveBeenCalledTimes(2))

    await TestRenderer.act(async () => {
      finishFirstToken()
      expect(await firstRegistration).toBe('failed')
    })
    expect(latestResult?.isLoading).toBe(true)
    expect(mocks.apiClient).not.toHaveBeenCalled()

    await TestRenderer.act(async () => {
      finishSecondToken()
      expect(await secondRegistration).toBe('granted')
    })
    expect(latestResult?.isLoading).toBe(false)
    expect(latestResult?.registrationStatus).toBe('registered')
    expect(mocks.apiClient).toHaveBeenCalledTimes(1)
  })

  it('requests signed-out permission without registering the device', async () => {
    vi.mocked(notificationsModule.getPermissionsAsync).mockResolvedValue(
      createPermissionResponse('undetermined'),
    )
    vi.mocked(notificationsModule.requestPermissionsAsync).mockResolvedValue(
      createPermissionResponse('granted'),
    )

    await renderHarness()
    await flush()

    let outcome = 'failed'
    await TestRenderer.act(async () => {
      outcome = (await latestResult?.requestPermissionOutcome(false)) ?? 'failed'
    })

    expect(outcome).toBe('granted')
    expect(notificationsModule.requestPermissionsAsync).toHaveBeenCalled()
    expect(mocks.apiClient).not.toHaveBeenCalled()
  })

  it('reports denial and registration failure as different outcomes', async () => {
    vi.mocked(notificationsModule.getPermissionsAsync).mockResolvedValue(
      createPermissionResponse('undetermined'),
    )
    vi.mocked(notificationsModule.requestPermissionsAsync)
      .mockResolvedValueOnce(createPermissionResponse('denied', true))

    await renderHarness()
    await flush()

    let outcome = 'granted'
    await TestRenderer.act(async () => {
      outcome = (await latestResult?.requestPermissionOutcome()) ?? 'granted'
    })
    expect(outcome).toBe('denied')

    vi.mocked(notificationsModule.requestPermissionsAsync)
      .mockResolvedValueOnce(createPermissionResponse('granted'))
    mocks.apiClient.mockRejectedValueOnce(new Error('registration failed'))
    await TestRenderer.act(async () => {
      outcome = (await latestResult?.requestPermissionOutcome()) ?? 'granted'
    })
    expect(outcome).toBe('failed')
  })

  it('updates the mounted Profile surface when the global prompt registers push', async () => {
    vi.mocked(notificationsModule.getPermissionsAsync).mockResolvedValue(
      createPermissionResponse('undetermined'),
    )
    vi.mocked(notificationsModule.requestPermissionsAsync).mockResolvedValue(
      createPermissionResponse('granted'),
    )

    await TestRenderer.act(async () => {
      TestRenderer.create(
        <PushNotificationsProvider>
          <MountedPushSurfaces />
        </PushNotificationsProvider>,
      )
      await Promise.resolve()
    })
    await flush()

    await TestRenderer.act(async () => {
      await globalPromptResult?.requestPermission()
    })

    expect(profileSurfaceResult?.permissionStatus).toBe('granted')
    expect(profileSurfaceResult?.registrationStatus).toBe('registered')
    expect(profileSurfaceResult?.isEnabled).toBe(true)
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

    await TestRenderer.act(() => {
      notify(buildResponse('/social'))
    })
    expect(mocks.router.push).not.toHaveBeenCalled()

    await TestRenderer.act(() => {
      notify(buildResponse('https://evil.example'))
      notify(buildResponse('//evil.example'))
      notify({ notification: { request: { content: {} } } })
    })
    expect(mocks.router.push).not.toHaveBeenCalled()
  })

  it.each([
    ['/chat', '/', true],
    ['/calendar-sync', '/calendar', false],
    ['/calendar-sync?mode=review', '/calendar', false],
    ['/streak', '/progress', false],
    ['/achievements?earned=latest', '/progress', false],
    ['/insights?range=year', '/progress', false],
    ['/retrospective/year', '/progress', false],
    ['/', '/', false],
    ['/calendar', '/calendar', false],
    ['/progress?wrapped=month&year=2026&month=8', '/wrapped?period=month&year=2026&month=8', false],
    ['/profile', '/profile', false],
  ])('routes the accepted push %s and applies its Astra overlay intent', async (url, destination, opensAstra) => {
    await renderHarness()
    await flush()
    const listener = vi.mocked(notificationsModule.addNotificationResponseReceivedListener).mock.calls.at(-1)![0]
    await TestRenderer.act(() => {
      listener({
        actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
        notification: {
          date: 1788670800000,
          request: {
            identifier: 'message-1', trigger: { type: 'push', channelId: null },
            content: { title: 'Reminder', data: { url } },
          },
        },
      } as unknown as Parameters<typeof listener>[0])
    })
    expect(mocks.router.push).toHaveBeenCalledWith(destination)
    if (opensAstra) expect(mocks.setAstraConversationOpen).toHaveBeenCalledWith(true)
    else expect(mocks.setAstraConversationOpen).not.toHaveBeenCalled()
  })

  it('routes the Wrapped response that launched the app before listener registration', async () => {
    vi.mocked(notificationsModule.getLastNotificationResponse).mockReturnValue(
      createNotificationResponse('wrapped-startup', '/progress?wrapped=month&year=2026&month=8'),
    )

    await renderHarness()
    await flush()

    expect(mocks.router.push).toHaveBeenCalledWith('/wrapped?period=month&year=2026&month=8')
  })

  it('navigates once when startup recovery and the live listener receive the same response', async () => {
    const response = createNotificationResponse(
      'wrapped-duplicate',
      '/progress?wrapped=month&year=2026&month=8',
    )
    vi.mocked(notificationsModule.getLastNotificationResponse).mockReturnValue(response)

    await renderHarness()
    await flush()
    const listener = vi.mocked(
      notificationsModule.addNotificationResponseReceivedListener,
    ).mock.calls.at(-1)![0]
    await TestRenderer.act(() => listener(response))

    expect(notificationsModule.getLastNotificationResponse).toHaveBeenCalledTimes(1)
    expect(mocks.router.push).toHaveBeenCalledTimes(1)
    expect(mocks.router.push).toHaveBeenCalledWith('/wrapped?period=month&year=2026&month=8')
  })

  it('does not replay a handled startup response after the provider remounts', async () => {
    const response = createNotificationResponse(
      'wrapped-retry',
      '/progress?wrapped=month&year=2026&month=8',
    )
    vi.mocked(notificationsModule.getLastNotificationResponse).mockReturnValue(response)
    vi.mocked(notificationsModule.clearLastNotificationResponse).mockImplementation(() => {
      vi.mocked(notificationsModule.getLastNotificationResponse).mockReturnValue(null)
    })

    const firstRenderer = await renderHarness()
    await flush()
    await TestRenderer.act(() => firstRenderer.update(
      <PushNotificationsProvider key="retry">
        <Harness />
      </PushNotificationsProvider>,
    ))
    await flush()

    expect(notificationsModule.clearLastNotificationResponse).toHaveBeenCalledTimes(1)
    expect(mocks.router.push).toHaveBeenCalledTimes(1)
    expect(mocks.router.push).toHaveBeenCalledWith('/wrapped?period=month&year=2026&month=8')
  })

  it('navigates for a startup response followed by a different live response', async () => {
    const startupResponse = createNotificationResponse(
      'wrapped-startup',
      '/progress?wrapped=month&year=2026&month=8',
    )
    vi.mocked(notificationsModule.getLastNotificationResponse).mockReturnValue(startupResponse)

    await renderHarness()
    await flush()
    const listener = vi.mocked(
      notificationsModule.addNotificationResponseReceivedListener,
    ).mock.calls.at(-1)![0]
    await TestRenderer.act(() => listener(createNotificationResponse('chat-live', '/chat')))

    expect(mocks.router.push).toHaveBeenNthCalledWith(
      1,
      '/wrapped?period=month&year=2026&month=8',
    )
    expect(mocks.router.push).toHaveBeenNthCalledWith(2, '/')
    expect(mocks.setAstraConversationOpen).toHaveBeenCalledWith(true)
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

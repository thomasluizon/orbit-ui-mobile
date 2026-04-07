import { useCallback, useEffect, useState } from 'react'
import { AppState, Platform } from 'react-native'
import Constants from 'expo-constants'
import * as Device from 'expo-device'
import { useRouter } from 'expo-router'
import type { Href } from 'expo-router'
import { API } from '@orbit/shared/api'
import { apiClient } from '@/lib/api-client'
import {
  normalizePermissionStatus,
  type NotificationPermissionStatus,
  type NotificationPermissionsResponse,
} from '@/lib/push-notification-permissions'
import { useAuthStore } from '@/stores/auth-store'

interface ExpoNotificationsModule {
  AndroidImportance: {
    MAX: number
  }
  setBadgeCountAsync?: (badgeCount: number) => Promise<boolean>
  setNotificationHandler: (handler: {
    handleNotification: () => Promise<{
      shouldShowAlert: boolean
      shouldPlaySound: boolean
      shouldSetBadge: boolean
      shouldShowBanner: boolean
      shouldShowList: boolean
    }>
  }) => void
  setNotificationChannelAsync: (
    channelId: string,
    options: Record<string, unknown>,
  ) => Promise<void>
  getPermissionsAsync: () => Promise<NotificationPermissionsResponse>
  requestPermissionsAsync: () => Promise<NotificationPermissionsResponse>
  getExpoPushTokenAsync: (options: { projectId: string }) => Promise<{ data: string }>
  getDevicePushTokenAsync: () => Promise<{ type?: string; data: string }>
  addNotificationResponseReceivedListener: (
    listener: (response: {
      notification: {
        request: {
          content?: {
            data?: Record<string, unknown>
          }
        }
      }
    }) => void,
  ) => { remove: () => void }
}
type PushRegistrationStatus =
  | 'unsupported'
  | 'idle'
  | 'permission-undetermined'
  | 'permission-denied'
  | 'registering'
  | 'token-missing'
  | 'sync-failed'
  | 'registered'
interface UsePushNotificationsReturn {
  expoPushToken: string | null
  error: string | null
  isEnabled: boolean
  isRegistered: boolean
  isLoading: boolean
  isSupported: boolean
  permissionStatus: NotificationPermissionStatus | null
  permissionCanAskAgain: boolean
  registrationStatus: PushRegistrationStatus
  requestPermission: () => Promise<boolean>
  refreshPermissionStatus: () => Promise<void>
}

let activeRegistrationPromise: Promise<boolean> | null = null

function isExpoGo(): boolean {
  return Constants.appOwnership === 'expo'
}

function getNotificationsModule(): ExpoNotificationsModule | null {
  if (isExpoGo()) return null

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy load keeps Expo Go from importing unsupported notifications code
    return require('expo-notifications') as ExpoNotificationsModule
  } catch {
    return null
  }
}

const notificationsModule = getNotificationsModule()

function isGrantedStatus(status: string): status is 'granted' {
  return status === 'granted'
}

function isSafeInternalUrl(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
}

function getProjectIdFromExpoConfig(): string | null {
  const extra = Constants.expoConfig?.extra
  if (!extra || typeof extra !== 'object' || !('eas' in extra)) {
    return null
  }

  const eas = extra.eas
  if (!eas || typeof eas !== 'object' || !('projectId' in eas)) {
    return null
  }

  const projectId = eas.projectId
  return typeof projectId === 'string' ? projectId : null
}

if (notificationsModule) {
  notificationsModule.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  })
}

async function ensureAndroidChannel(): Promise<void> {
  if (!notificationsModule || Platform.OS !== 'android') return
  await notificationsModule.setNotificationChannelAsync('default', {
    name: 'Default',
    importance: notificationsModule.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#8b5cf6',
  })
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function getPushToken(): Promise<string | null> {
  if (!notificationsModule || !Device.isDevice) return null

  await ensureAndroidChannel()
  const projectId =
    process.env.EXPO_PUBLIC_PROJECT_ID ??
    Constants.easConfig?.projectId ??
    getProjectIdFromExpoConfig()

  if (!projectId) return null
  const tokenData = await notificationsModule.getExpoPushTokenAsync({
    projectId,
  })

  return tokenData.data
}

async function getNativeAndroidPushToken(): Promise<string | null> {
  if (!notificationsModule || !Device.isDevice || Platform.OS !== 'android') return null

  await ensureAndroidChannel()
  let lastError: unknown = null

  for (const retryDelayMs of [0, 750]) {
    if (retryDelayMs > 0) {
      await delay(retryDelayMs)
    }

    try {
      const tokenData = await notificationsModule.getDevicePushTokenAsync()
      if (!tokenData.data) continue
      // Expo can report Android native tokens with service labels like `fcm`
      // or platform labels like `android`. The backend only needs the token string.
      return tokenData.data
    } catch (err: unknown) {
      lastError = err
    }
  }

  if (lastError instanceof Error) {
    throw lastError
  }

  return null
}

async function sendTokenToBackend(token: string): Promise<void> {
  await apiClient(API.notifications.subscribe, {
    method: 'POST',
    body: JSON.stringify({
      endpoint: token,
      p256dh: Platform.OS === 'android' ? 'fcm' : 'native',
      auth: Platform.OS === 'android' ? 'fcm' : 'native',
    }),
  })
}

export function usePushNotifications(): UsePushNotificationsReturn {
  const router = useRouter()
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermissionStatus | null>(null)
  const [permissionCanAskAgain, setPermissionCanAskAgain] = useState(true)
  const [registrationStatus, setRegistrationStatus] = useState<PushRegistrationStatus>('idle')
  const [isRegistered, setIsRegistered] = useState(false)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isSupported = !!notificationsModule && Device.isDevice

  const registerAndSync = useCallback(async (): Promise<boolean> => {
    if (activeRegistrationPromise) {
      return activeRegistrationPromise
    }

    const registrationPromise = (async () => {
      setRegistrationStatus('registering')
      setError(null)
      setIsRegistered(false)

      let token: string | null = null
      try {
        token =
          Platform.OS === 'android'
            ? await getNativeAndroidPushToken()
            : await getPushToken()
      } catch (err: unknown) {
        setExpoPushToken(null)
        setRegistrationStatus('token-missing')
        setError(err instanceof Error ? err.message : 'Push token is unavailable on this device.')
        return false
      }
      setExpoPushToken(token)

      if (!token) {
        setRegistrationStatus('token-missing')
        setError('Push token is unavailable on this device.')
        return false
      }

      if (!isAuthenticated) {
        setRegistrationStatus('idle')
        return false
      }

      try {
        await sendTokenToBackend(token)
        setRegistrationStatus('registered')
        setIsRegistered(true)
        setError(null)
        return true
      } catch (err: unknown) {
        setRegistrationStatus('sync-failed')
        setError(err instanceof Error ? err.message : 'Failed to sync push subscription.')
        return false
      }
    })()

    activeRegistrationPromise = registrationPromise

    try {
      return await registrationPromise
    } finally {
      if (activeRegistrationPromise === registrationPromise) {
        activeRegistrationPromise = null
      }
    }
  }, [isAuthenticated])

  const syncGrantedPermission = useCallback(async (): Promise<void> => {
    if (!isSupported) {
      setPermissionStatus(null)
      setPermissionCanAskAgain(false)
      setExpoPushToken(null)
      setRegistrationStatus('unsupported')
      setIsRegistered(false)
      return
    }

    try {
      await ensureAndroidChannel()
      const permissions = await notificationsModule.getPermissionsAsync()
      const status = normalizePermissionStatus(permissions)
      setPermissionStatus(status)
      setPermissionCanAskAgain(permissions.canAskAgain !== false)
      setError(null)

      if (status === 'denied') {
        setExpoPushToken(null)
        setRegistrationStatus('permission-denied')
        setIsRegistered(false)
        return
      }

      if (status !== 'granted') {
        setExpoPushToken(null)
        setRegistrationStatus('permission-undetermined')
        setIsRegistered(false)
        return
      }

      await registerAndSync()
    } catch (err: unknown) {
      setPermissionStatus(null)
      setPermissionCanAskAgain(false)
      setExpoPushToken(null)
      setRegistrationStatus('sync-failed')
      setIsRegistered(false)
      setError(err instanceof Error ? err.message : 'Failed to refresh push notification state.')
    }
  }, [isSupported, registerAndSync])

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      setPermissionStatus(null)
      setPermissionCanAskAgain(false)
      setRegistrationStatus('unsupported')
      setIsRegistered(false)
      return false
    }

    setIsLoading(true)
    setError(null)
    try {
      await ensureAndroidChannel()
      let permissions = await notificationsModule.getPermissionsAsync()
      let status = normalizePermissionStatus(permissions)

      if (status !== 'granted' && permissions.canAskAgain !== false) {
        permissions = await notificationsModule.requestPermissionsAsync()
        status = normalizePermissionStatus(permissions)
      }

      setPermissionStatus(status)
      setPermissionCanAskAgain(permissions.canAskAgain !== false)
      if (status !== 'granted') {
        setExpoPushToken(null)
        setRegistrationStatus(status === 'denied' ? 'permission-denied' : 'permission-undetermined')
        setIsRegistered(false)
        return false
      }

      return registerAndSync()
    } catch (err: unknown) {
      setRegistrationStatus('sync-failed')
      setIsRegistered(false)
      setError(err instanceof Error ? err.message : 'Failed to register for push notifications.')
      return false
    } finally {
      setIsLoading(false)
    }
  }, [isSupported, registerAndSync])

  useEffect(() => {
    void syncGrantedPermission()
  }, [syncGrantedPermission])

  useEffect(() => {
    if (isAuthenticated && isGrantedStatus(permissionStatus ?? '') && !isRegistered) {
      void registerAndSync()
    }
  }, [isAuthenticated, isRegistered, permissionStatus, registerAndSync])

  useEffect(() => {
    if (!isSupported || !notificationsModule) return undefined

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void syncGrantedPermission()
      }
    })

    const responseSubscription = notificationsModule.addNotificationResponseReceivedListener(
      (response) => {
        const maybeUrl = response.notification.request.content?.data?.url
        if (isSafeInternalUrl(maybeUrl)) {
          router.push(maybeUrl as Href)
        }
      },
    )

    return () => {
      appStateSubscription.remove()
      responseSubscription.remove()
    }
  }, [isSupported, router, syncGrantedPermission])

  return {
    expoPushToken,
    error,
    isEnabled: isRegistered,
    isRegistered,
    isLoading,
    isSupported,
    permissionStatus,
    permissionCanAskAgain,
    registrationStatus,
    requestPermission,
    refreshPermissionStatus: syncGrantedPermission,
  }
}

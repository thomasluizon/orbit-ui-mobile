import { useCallback, useEffect, useState } from 'react'
import { Platform } from 'react-native'
import Constants, { ExecutionEnvironment } from 'expo-constants'
import * as Device from 'expo-device'
import { API } from '@orbit/shared/api'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/stores/auth-store'

interface ExpoNotificationsModule {
  PermissionStatus: Record<string, string>
  PermissionResponse: {
    status: string
  }
  AndroidImportance: {
    MAX: number
  }
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
  getPermissionsAsync: () => Promise<{ status: string }>
  requestPermissionsAsync: () => Promise<{ status: string }>
  getExpoPushTokenAsync: (options: { projectId: string }) => Promise<{ data: string }>
  getDevicePushTokenAsync: () => Promise<{ type?: string; data: string }>
}

type NotificationPermissionStatus = 'granted' | 'denied' | 'undetermined'
interface UsePushNotificationsReturn {
  expoPushToken: string | null
  error: string | null
  isEnabled: boolean
  isLoading: boolean
  isSupported: boolean
  permissionStatus: NotificationPermissionStatus | null
  requestPermission: () => Promise<boolean>
  refreshPermissionStatus: () => Promise<void>
}

function getNotificationsModule(): ExpoNotificationsModule | null {
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return null

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
  const tokenData = await notificationsModule.getDevicePushTokenAsync()
  if (!tokenData.data) return null
  if (tokenData.type && tokenData.type !== 'fcm') return null
  return tokenData.data
}

async function sendTokenToBackend(token: string): Promise<void> {
  try {
    await apiClient(API.notifications.subscribe, {
      method: 'POST',
      body: JSON.stringify({
        endpoint: token,
        p256dh: Platform.OS === 'android' ? 'fcm' : 'native',
        auth: 'native',
      }),
    })
  } catch {
    // Best-effort - token registration can retry next launch
  }
}

export function usePushNotifications(): UsePushNotificationsReturn {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermissionStatus | null>(null)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isSupported = !!notificationsModule && Device.isDevice

  const syncGrantedPermission = useCallback(async (): Promise<void> => {
    if (!isSupported) {
      setPermissionStatus(null)
      setExpoPushToken(null)
      return
    }
    try {
      const permissions = await notificationsModule.getPermissionsAsync()
      setPermissionStatus(permissions.status as NotificationPermissionStatus)

      if (permissions.status !== 'granted') {
        setExpoPushToken(null)
        return
      }

      const nativeToken = await getNativeAndroidPushToken()
      const expoToken = await getPushToken()
      const tokenToSend = nativeToken ?? expoToken
      setExpoPushToken(tokenToSend)
      if (tokenToSend && isAuthenticated) {
        await sendTokenToBackend(tokenToSend)
      }
    } catch {
      setPermissionStatus(null)
      setExpoPushToken(null)
    }
  }, [isAuthenticated, isSupported])

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      setPermissionStatus(null)
      return false
    }

    setIsLoading(true)
    setError(null)
    try {
      const existing = await notificationsModule.getPermissionsAsync()
      let status = existing.status

      if (status !== 'granted') {
        const requested = await notificationsModule.requestPermissionsAsync()
        status = requested.status
      }

      setPermissionStatus(status as NotificationPermissionStatus)
      if (status !== 'granted') {
        setExpoPushToken(null)
        return false
      }

      const nativeToken = await getNativeAndroidPushToken()
      const expoToken = await getPushToken()
      const tokenToSend = nativeToken ?? expoToken
      setExpoPushToken(tokenToSend)
      if (tokenToSend && isAuthenticated) {
        await sendTokenToBackend(tokenToSend)
      }
      return true
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to register for push notifications')
      return false
    } finally {
      setIsLoading(false)
    }
  }, [isAuthenticated, isSupported])

  useEffect(() => {
    void syncGrantedPermission()
  }, [syncGrantedPermission])

  useEffect(() => {
    if (isAuthenticated && expoPushToken && isGrantedStatus(permissionStatus ?? '')) {
      void sendTokenToBackend(expoPushToken)
    }
  }, [expoPushToken, isAuthenticated, permissionStatus])

  return {
    expoPushToken,
    error,
    isEnabled: isGrantedStatus(permissionStatus || ''),
    isLoading,
    isSupported,
    permissionStatus,
    requestPermission,
    refreshPermissionStatus: syncGrantedPermission,
  }
}

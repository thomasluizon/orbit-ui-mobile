import { useCallback, useEffect, useState } from 'react'
import { Platform } from 'react-native'
import Constants from 'expo-constants'
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
  if (Constants.executionEnvironment === 'storeClient') return null

  try {
    return require('expo-notifications') as ExpoNotificationsModule
  } catch {
    return null
  }
}

const notificationsModule = getNotificationsModule()

function isGrantedStatus(status: string): status is 'granted' {
  return status === 'granted'
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
  const tokenData = await notificationsModule.getExpoPushTokenAsync({
    projectId: process.env.EXPO_PUBLIC_PROJECT_ID,
  })

  return tokenData.data
}

async function sendTokenToBackend(token: string): Promise<void> {
  try {
    await apiClient(API.notifications.pushToken, {
      method: 'POST',
      body: JSON.stringify({
        token,
        platform: Platform.OS,
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

    const permissions = await notificationsModule.getPermissionsAsync()
    setPermissionStatus(permissions.status as NotificationPermissionStatus)

    if (permissions.status !== 'granted') {
      setExpoPushToken(null)
      return
    }

    const token = await getPushToken()
    setExpoPushToken(token)
    if (token && isAuthenticated) {
      await sendTokenToBackend(token)
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

      const token = await getPushToken()
      setExpoPushToken(token)
      if (token && isAuthenticated) {
        await sendTokenToBackend(token)
      }
      return !!token
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
    isEnabled: isGrantedStatus(permissionStatus || '') && expoPushToken !== null,
    isLoading,
    isSupported,
    permissionStatus,
    requestPermission,
    refreshPermissionStatus: syncGrantedPermission,
  }
}

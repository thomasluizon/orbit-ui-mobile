import { useState, useEffect, useRef, useCallback } from 'react'
import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/stores/auth-store'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

interface UsePushNotificationsReturn {
  expoPushToken: string | null
  notification: Notifications.Notification | null
  error: string | null
  requestPermission: () => Promise<boolean>
}

async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    // Push notifications only work on physical devices
    return null
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync()
  let finalStatus = existingStatus

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }

  if (finalStatus !== 'granted') {
    return null
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#8b5cf6',
    })
  }

  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId: process.env.EXPO_PUBLIC_PROJECT_ID,
  })

  return tokenData.data
}

async function sendTokenToBackend(token: string): Promise<void> {
  try {
    await apiClient('/api/notifications/push-token', {
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
  const [notification, setNotification] = useState<Notifications.Notification | null>(null)
  const [error, setError] = useState<string | null>(null)
  const notificationListener = useRef<Notifications.EventSubscription>()
  const responseListener = useRef<Notifications.EventSubscription>()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      const token = await registerForPushNotifications()
      if (token) {
        setExpoPushToken(token)
        if (isAuthenticated) {
          await sendTokenToBackend(token)
        }
        return true
      }
      return false
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to register for push notifications')
      return false
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (isAuthenticated) {
      requestPermission()
    }
  }, [isAuthenticated, requestPermission])

  // Send token to backend whenever auth state changes and we have a token
  useEffect(() => {
    if (isAuthenticated && expoPushToken) {
      sendTokenToBackend(expoPushToken)
    }
  }, [isAuthenticated, expoPushToken])

  // Listen for incoming notifications
  useEffect(() => {
    notificationListener.current = Notifications.addNotificationReceivedListener(
      (notif) => {
        setNotification(notif)
      },
    )

    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (_response) => {
        // Handle notification tap - navigation can be added here
      },
    )

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current)
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current)
      }
    }
  }, [])

  return { expoPushToken, notification, error, requestPermission }
}

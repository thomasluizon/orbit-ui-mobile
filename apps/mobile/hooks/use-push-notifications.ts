import { useCallback, useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { AppState, Platform } from 'react-native'
import Constants from 'expo-constants'
import * as Device from 'expo-device'
import { useRouter } from 'expo-router'
import type { Href } from 'expo-router'
import { API } from '@orbit/shared/api'
import { schemes } from '@orbit/shared/theme'
import type { NativePushRegistrationStatus } from '@orbit/shared/utils'
import { i18n } from '@/lib/i18n'
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
type PushRegistrationStatus = NativePushRegistrationStatus

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
  disablePushNotifications: () => Promise<boolean>
  requestPermission: () => Promise<boolean>
  refreshPermissionStatus: () => Promise<void>
}

let activeRegistration: { userId: string | null; promise: Promise<boolean> } | null = null
const PUSH_DISABLED_STORAGE_KEY_PREFIX = 'orbit_push_disabled'

function isExpoGo(): boolean {
  return Constants.appOwnership === 'expo'
}

function hasFunctionProperty(value: object, key: string): boolean {
  return key in value && typeof Reflect.get(value, key) === 'function'
}

function isExpoNotificationsModule(value: unknown): value is ExpoNotificationsModule {
  if (!value || typeof value !== 'object') return false

  return (
    hasFunctionProperty(value, 'setNotificationHandler') &&
    hasFunctionProperty(value, 'setNotificationChannelAsync') &&
    hasFunctionProperty(value, 'getPermissionsAsync') &&
    hasFunctionProperty(value, 'requestPermissionsAsync') &&
    hasFunctionProperty(value, 'getExpoPushTokenAsync') &&
    hasFunctionProperty(value, 'getDevicePushTokenAsync') &&
    hasFunctionProperty(value, 'addNotificationResponseReceivedListener')
  )
}

function getModuleDefaultExport(value: object): unknown {
  if (!('default' in value)) return null
  return Reflect.get(value, 'default')
}

declare const require: (id: string) => unknown

function getNotificationsModule(): ExpoNotificationsModule | null {
  if (isExpoGo()) return null

  try {
    const requiredModule = require('expo-notifications')
    if (isExpoNotificationsModule(requiredModule)) {
      return requiredModule
    }

    if (requiredModule && typeof requiredModule === 'object') {
      const defaultExport = getModuleDefaultExport(requiredModule)
      if (isExpoNotificationsModule(defaultExport)) {
        return defaultExport
      }
    }

    return null
  } catch {
    return null
  }
}

let notificationsModule: ExpoNotificationsModule | null = getNotificationsModule()

export function __setNotificationsModuleForTests(nextModule: unknown): void {
  notificationsModule = isExpoNotificationsModule(nextModule) ? nextModule : null
}

function isPhysicalDevice(): boolean {
  if (typeof Device.isDevice === 'boolean') {
    return Device.isDevice
  }

  if (!('default' in Device)) return false
  const defaultExport = Reflect.get(Device, 'default')
  if (!defaultExport || typeof defaultExport !== 'object') return false
  return Reflect.get(defaultExport, 'isDevice') === true
}

function isGrantedStatus(status: string): status is 'granted' {
  return status === 'granted'
}

function isSafeInternalUrl(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
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
    name: i18n.t('notifications.channel.default'),
    importance: notificationsModule.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: schemes.purple.accent.dark.primary,
  })
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function getNativeAndroidPushToken(): Promise<string | null> {
  if (!notificationsModule || !isPhysicalDevice() || Platform.OS !== 'android') return null

  await ensureAndroidChannel()
  let lastError: unknown = null

  for (const retryDelayMs of [0, 750]) {
    if (retryDelayMs > 0) {
      await delay(retryDelayMs)
    }

    try {
      const tokenData = await notificationsModule.getDevicePushTokenAsync()
      if (!tokenData.data) continue
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

async function getCurrentPushToken(): Promise<string | null> {
  return getNativeAndroidPushToken()
}

function buildNativePushPayload(token: string) {
  return {
    endpoint: token,
    p256dh: 'fcm',
    auth: 'fcm',
  }
}

async function sendTokenToBackend(token: string): Promise<void> {
  await apiClient(API.notifications.subscribe, {
    method: 'POST',
    body: JSON.stringify(buildNativePushPayload(token)),
  })
}

async function removeTokenFromBackend(token: string): Promise<void> {
  await apiClient(API.notifications.unsubscribe, {
    method: 'POST',
    body: JSON.stringify(buildNativePushPayload(token)),
  })
}

/**
 * Best-effort unsubscribe of this device's current push token from the backend.
 * Called during logout while the auth token is still present, so a shared device
 * stops receiving the prior user's pushes. Never throws — a failure must not
 * block sign-out.
 */
export async function unsubscribePushToken(): Promise<void> {
  let token: string | null = null
  try {
    token = await getCurrentPushToken()
  } catch {
    return
  }

  if (!token) return
  await removeTokenFromBackend(token)
}

function getPushDisabledStorageKey(userId: string | null): string {
  return userId
    ? `${PUSH_DISABLED_STORAGE_KEY_PREFIX}:${userId}`
    : PUSH_DISABLED_STORAGE_KEY_PREFIX
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
  const userId = useAuthStore((s) => s.user?.userId ?? null)
  const isSupported = !!notificationsModule && isPhysicalDevice()
  const disabledStorageKey = getPushDisabledStorageKey(userId)

  const readDisabledPreference = useCallback(async (): Promise<boolean> => {
    try {
      return (await AsyncStorage.getItem(disabledStorageKey)) === '1'
    } catch {
      return false
    }
  }, [disabledStorageKey])

  const writeDisabledPreference = useCallback(async (disabled: boolean): Promise<void> => {
    try {
      if (disabled) {
        await AsyncStorage.setItem(disabledStorageKey, '1')
        return
      }
      await AsyncStorage.removeItem(disabledStorageKey)
    } catch {
    }
  }, [disabledStorageKey])

  const registerAndSync = useCallback(async (): Promise<boolean> => {
    if (activeRegistration && activeRegistration.userId === userId) {
      return activeRegistration.promise
    }

    const registrationPromise = (async () => {
      setRegistrationStatus('registering')
      setError(null)
      setIsRegistered(false)

      let token: string | null = null
      try {
        token = await getCurrentPushToken()
      } catch (err: unknown) {
        setExpoPushToken(null)
        setRegistrationStatus('token-missing')
        setError(err instanceof Error ? err.message : i18n.t('settings.notifications.tokenMissing'))
        return false
      }
      setExpoPushToken(token)

      if (!token) {
        setRegistrationStatus('token-missing')
        setError(i18n.t('settings.notifications.tokenMissing'))
        return false
      }

      if (!isAuthenticated || useAuthStore.getState().user?.userId !== userId) {
        setRegistrationStatus('idle')
        return false
      }

      try {
        await sendTokenToBackend(token)
        if (useAuthStore.getState().user?.userId !== userId) {
          setRegistrationStatus('idle')
          return false
        }
        await writeDisabledPreference(false)
        setRegistrationStatus('registered')
        setIsRegistered(true)
        setError(null)
        return true
      } catch (err: unknown) {
        setRegistrationStatus('sync-failed')
        setError(err instanceof Error ? err.message : i18n.t('settings.notifications.syncFailed'))
        return false
      }
    })()

    const registration = { userId, promise: registrationPromise }
    activeRegistration = registration

    try {
      return await registrationPromise
    } finally {
      if (activeRegistration === registration) {
        activeRegistration = null
      }
    }
  }, [isAuthenticated, userId, writeDisabledPreference])

  const enablePushNotifications = useCallback(async (): Promise<boolean> => {
    await writeDisabledPreference(false)
    return registerAndSync()
  }, [registerAndSync, writeDisabledPreference])

  const syncGrantedPermission = useCallback(async (): Promise<void> => {
    const activeNotificationsModule = notificationsModule
    if (!isSupported || !activeNotificationsModule) {
      setPermissionStatus(null)
      setPermissionCanAskAgain(false)
      setExpoPushToken(null)
      setRegistrationStatus('unsupported')
      setIsRegistered(false)
      return
    }

    try {
      await ensureAndroidChannel()
      const permissions = await activeNotificationsModule.getPermissionsAsync()
      const status = normalizePermissionStatus(permissions)
      const isDisabledInOrbit = await readDisabledPreference()
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

      if (isDisabledInOrbit) {
        setRegistrationStatus('disabled')
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
      setError(err instanceof Error ? err.message : i18n.t('settings.notifications.syncFailed'))
    }
  }, [isSupported, readDisabledPreference, registerAndSync])

  const requestPermission = useCallback(async (): Promise<boolean> => {
    const activeNotificationsModule = notificationsModule
    if (!isSupported || !activeNotificationsModule) {
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
      let permissions = await activeNotificationsModule.getPermissionsAsync()
      let status = normalizePermissionStatus(permissions)

      if (status !== 'granted' && permissions.canAskAgain !== false) {
        permissions = await activeNotificationsModule.requestPermissionsAsync()
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

      return enablePushNotifications()
    } catch (err: unknown) {
      setRegistrationStatus('sync-failed')
      setIsRegistered(false)
      setError(err instanceof Error ? err.message : i18n.t('settings.notifications.syncFailed'))
      return false
    } finally {
      setIsLoading(false)
    }
  }, [enablePushNotifications, isSupported])

  const disablePushNotifications = useCallback(async (): Promise<boolean> => {
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
      let token = expoPushToken

      if (!token) {
        try {
          token = await getCurrentPushToken()
        } catch (err: unknown) {
          setRegistrationStatus('token-missing')
          setError(err instanceof Error ? err.message : i18n.t('settings.notifications.tokenMissing'))
          return false
        }

        setExpoPushToken(token)
      }

      if (!token) {
        setRegistrationStatus('token-missing')
        setError(i18n.t('settings.notifications.tokenMissing'))
        return false
      }

      if (!isAuthenticated) {
        setRegistrationStatus('sync-failed')
        setError(i18n.t('settings.notifications.syncFailed'))
        return false
      }

      await removeTokenFromBackend(token)
      await writeDisabledPreference(true)
      setRegistrationStatus(permissionStatus === 'granted' ? 'disabled' : 'idle')
      setIsRegistered(false)
      setError(null)
      return true
    } catch (err: unknown) {
      setRegistrationStatus('sync-failed')
      setError(err instanceof Error ? err.message : i18n.t('settings.notifications.syncFailed'))
      return false
    } finally {
      setIsLoading(false)
    }
  }, [expoPushToken, isAuthenticated, isSupported, permissionStatus, writeDisabledPreference])

  useEffect(() => {
    void Promise.resolve().then(() => syncGrantedPermission())
  }, [syncGrantedPermission])

  useEffect(() => {
    if (isAuthenticated && isGrantedStatus(permissionStatus ?? '') && !isRegistered) {
      void Promise.resolve().then(() => syncGrantedPermission())
    }
  }, [isAuthenticated, isRegistered, permissionStatus, syncGrantedPermission])

  useEffect(() => {
    const activeNotificationsModule = notificationsModule
    if (!isSupported || !activeNotificationsModule) return undefined

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void syncGrantedPermission()
      }
    })

    const responseSubscription = activeNotificationsModule.addNotificationResponseReceivedListener(
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
    disablePushNotifications,
    requestPermission,
    refreshPermissionStatus: syncGrantedPermission,
  }
}

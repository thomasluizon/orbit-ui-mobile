import {
  getNativePushStatusTone,
  getPushStatusToneClass,
  type NativePushPermissionStatus,
  type NativePushRegistrationStatus,
} from '@orbit/shared/utils'
import { usePushNotifications } from './use-push-notifications'

/**
 * Mobile parity port of `apps/web/hooks/use-push-notification-preferences.ts`.
 *
 * The web hook deals with the browser Notification + PushManager APIs.
 * The mobile equivalent already exists as `use-push-notifications.ts`
 * (expo-notifications, expo-device, AsyncStorage). This file aligns
 * the public surface so call sites can be moved across platforms with
 * the same name.
 *
 * Returned shape mirrors the web hook's `{ supported, subscribed,
 * permission, status, loading, togglePush }` so chat + profile screens
 * can consume the same identifier on either platform.
 */
export interface PushPreferenceSnapshot {
  supported: boolean
  subscribed: boolean
  permission: NativePushPermissionStatus
  status: NativePushRegistrationStatus
}

export interface UsePushNotificationPreferencesResult extends PushPreferenceSnapshot {
  loading: boolean
  togglePush: () => Promise<void>
}

export function getPushStatusTone(
  status: NativePushRegistrationStatus,
  permission: NativePushPermissionStatus,
): string {
  return getPushStatusToneClass(getNativePushStatusTone(status, permission))
}

export function usePushNotificationPreferences(): UsePushNotificationPreferencesResult {
  const native = usePushNotifications()

  const togglePush = async () => {
    if (native.isRegistered) {
      await native.disablePushNotifications()
    } else {
      await native.requestPermission()
    }
  }

  return {
    supported: native.isSupported,
    subscribed: native.isRegistered,
    permission: native.permissionStatus as NativePushPermissionStatus,
    status: native.registrationStatus,
    loading: native.isLoading,
    togglePush,
  }
}

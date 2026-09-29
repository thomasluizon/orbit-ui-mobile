import AsyncStorage from '@react-native-async-storage/async-storage'
import { captureError } from './sentry'

const RETIRED_NOTIFICATION_ID = 'orbit-persistent-reminder'
const RETIRED_CHANNEL_ID = 'persistent-reminder'
const RETIRED_STORAGE_KEY = 'orbit-persistent-reminder'

/**
 * Removes what the deleted persistent reminder (#963) left on a device that had it switched on:
 * the ongoing notification with its last streak, its notification channel, and the stored switch.
 * Nothing else cancels that notification once the feature is gone. Each step runs even when
 * another fails, and every failure is reported.
 */
export async function retirePersistentReminder(): Promise<void> {
  const { deleteNotificationChannelAsync, dismissNotificationAsync } = await import('expo-notifications')
  const results = await Promise.allSettled([
    dismissNotificationAsync(RETIRED_NOTIFICATION_ID),
    deleteNotificationChannelAsync(RETIRED_CHANNEL_ID),
    AsyncStorage.removeItem(RETIRED_STORAGE_KEY),
  ])
  for (const result of results) {
    if (result.status === 'rejected') captureError(result.reason)
  }
}

import AsyncStorage from '@react-native-async-storage/async-storage'

const RETIRED_NOTIFICATION_ID = 'orbit-persistent-reminder'
const RETIRED_CHANNEL_ID = 'persistent-reminder'
const RETIRED_STORAGE_KEY = 'orbit-persistent-reminder'

/**
 * Removes what the deleted persistent reminder (#963) left on a device that had it switched on:
 * the ongoing notification with its last streak, its notification channel, and the stored switch.
 * Nothing else cancels that notification once the feature is gone.
 */
export async function retirePersistentReminder(): Promise<void> {
  const { deleteNotificationChannelAsync, dismissNotificationAsync } = await import('expo-notifications')
  await dismissNotificationAsync(RETIRED_NOTIFICATION_ID)
  await deleteNotificationChannelAsync(RETIRED_CHANNEL_ID)
  await AsyncStorage.removeItem(RETIRED_STORAGE_KEY)
}

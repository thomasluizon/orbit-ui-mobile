import { Linking } from 'react-native'
import { usePushNotifications } from './use-push-notifications'

export function useReminderPermission(reminderEnabled: boolean, onToggleReminder: () => void) {
  const {
    isSupported,
    permissionStatus,
    permissionCanAskAgain,
    requestPermissionOutcome,
  } = usePushNotifications()

  function toggleReminder() {
    onToggleReminder()
    if (reminderEnabled || !isSupported || permissionStatus === 'granted' || !permissionCanAskAgain) return
    void requestPermissionOutcome()
  }

  return {
    toggleReminder,
    showNotice: reminderEnabled && isSupported && permissionStatus !== null && permissionStatus !== 'granted',
    openSettings: () => { void Linking.openSettings() },
  }
}

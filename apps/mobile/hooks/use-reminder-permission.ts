import { useState } from 'react'
import { Linking } from 'react-native'
import { usePushNotifications } from './use-push-notifications'

export function useReminderPermission(reminderEnabled: boolean, onToggleReminder: () => void) {
  const [permissionNotGrantedAfterRequest, setPermissionNotGrantedAfterRequest] = useState(false)
  const {
    isSupported,
    permissionStatus,
    permissionCanAskAgain,
    requestPermissionOutcome,
  } = usePushNotifications()

  function toggleReminder() {
    onToggleReminder()
    if (reminderEnabled || !isSupported || permissionStatus === 'granted' || !permissionCanAskAgain) return
    void requestPermissionOutcome().then((outcome) => {
      setPermissionNotGrantedAfterRequest(outcome !== 'granted')
    })
  }

  return {
    toggleReminder,
    showNotice: reminderEnabled && isSupported && permissionStatus !== 'granted' && (
      permissionStatus !== null || !permissionCanAskAgain || permissionNotGrantedAfterRequest
    ),
    openSettings: () => { void Linking.openSettings().catch(() => undefined) },
  }
}

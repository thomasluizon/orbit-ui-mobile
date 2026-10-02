import { useEffect, useState } from 'react'
import { usePushSubscriptions } from './use-push-subscriptions'
import { ensurePushSubscription, isPushNotificationSupported } from './use-push-notification-preferences'

function readPermission(): NotificationPermission | null {
  return isPushNotificationSupported() ? Notification.permission : null
}

export function useReminderPermission(reminderEnabled: boolean, onToggleReminder: () => void) {
  const subscriptions = usePushSubscriptions()
  const [permission, setPermission] = useState<NotificationPermission | null>(readPermission)

  useEffect(() => {
    const refresh = () => setPermission(readPermission())
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [])

  function requestPermission() {
    const currentPermission = readPermission()
    if (currentPermission === null || currentPermission === 'denied'
      || subscriptions.isLoading || subscriptions.isError
      || subscriptions.count === undefined || subscriptions.max === undefined
      || (!subscriptions.isCurrentDeviceRegistered && subscriptions.count >= subscriptions.max)) return
    void ensurePushSubscription()
      .then((snapshot) => setPermission(snapshot.permission || readPermission()))
      .catch(() => setPermission(readPermission()))
  }

  function toggleReminder() {
    onToggleReminder()
    if (!reminderEnabled) requestPermission()
  }

  return {
    toggleReminder,
    requestPermission,
    showNotice: reminderEnabled && permission !== null && permission !== 'granted',
  }
}

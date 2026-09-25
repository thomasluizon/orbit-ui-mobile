import { useEffect, useState } from 'react'
import { isPushNotificationSupported, subscribeToPushNotifications } from './use-push-notification-preferences'

function readPermission(): NotificationPermission | null {
  return isPushNotificationSupported() ? Notification.permission : null
}

export function useReminderPermission(reminderEnabled: boolean, onToggleReminder: () => void) {
  const [permission, setPermission] = useState<NotificationPermission | null>(readPermission)

  useEffect(() => {
    const refresh = () => setPermission(readPermission())
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [])

  function toggleReminder() {
    onToggleReminder()
    if (reminderEnabled || permission === null || permission === 'denied') return

    void subscribeToPushNotifications()
      .then((snapshot) => setPermission(snapshot.permission || readPermission()))
      .catch(() => setPermission(readPermission()))
  }

  return {
    toggleReminder,
    showNotice: reminderEnabled && permission !== null && permission !== 'granted',
  }
}

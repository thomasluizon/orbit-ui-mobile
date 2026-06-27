import { useState } from 'react'
import { syncWidgetData } from '@/lib/orbit-widget'
import {
  cancelPersistentReminder,
  isPersistentReminderSupported,
  requestPersistentReminderPermission,
} from '@/lib/persistent-reminder'
import { usePersistentReminderStore } from '@/stores/persistent-reminder-store'

interface UsePersistentReminderReturn {
  enabled: boolean
  isSupported: boolean
  isLoading: boolean
  toggle: () => Promise<void>
}

/**
 * Settings-screen controller for the ongoing reminder. Turning it on requests
 * notification permission, persists the flag, and posts immediately off the
 * widget feed; turning it off clears the flag and dismisses the notification.
 */
export function usePersistentReminder(): UsePersistentReminderReturn {
  const enabled = usePersistentReminderStore((state) => state.enabled)
  const setEnabled = usePersistentReminderStore((state) => state.setEnabled)
  const [isLoading, setIsLoading] = useState(false)

  async function toggle(): Promise<void> {
    if (isLoading) return
    setIsLoading(true)
    try {
      if (enabled) {
        setEnabled(false)
        await cancelPersistentReminder().catch(() => {})
        return
      }

      const granted = await requestPersistentReminderPermission()
      if (!granted) return
      setEnabled(true)
      await syncWidgetData().catch(() => {})
    } finally {
      setIsLoading(false)
    }
  }

  return {
    enabled,
    isSupported: isPersistentReminderSupported(),
    isLoading,
    toggle,
  }
}

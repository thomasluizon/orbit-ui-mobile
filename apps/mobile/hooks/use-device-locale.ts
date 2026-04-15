import { useEffect, useState } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import { getSystemLocale } from '@orbit/shared/utils'

export function useDeviceLocale(): string {
  const [locale, setLocale] = useState<string>(() => getSystemLocale())

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status: AppStateStatus) => {
      if (status === 'active') {
        const next = getSystemLocale()
        setLocale((prev) => (prev === next ? prev : next))
      }
    })
    return () => subscription.remove()
  }, [])

  return locale
}

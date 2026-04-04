import { useEffect, useState, useCallback } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import * as Updates from 'expo-updates'

interface UseAppUpdateReturn {
  isUpdateAvailable: boolean
  isChecking: boolean
  isDownloading: boolean
  checkForUpdate: () => Promise<void>
  applyUpdate: () => Promise<void>
}

export function useAppUpdate(): UseAppUpdateReturn {
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false)
  const [isChecking, setIsChecking] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)

  const checkForUpdate = useCallback(async () => {
    if (__DEV__) return // OTA updates don't work in dev mode

    try {
      setIsChecking(true)
      const update = await Updates.checkForUpdateAsync()
      if (update.isAvailable) {
        setIsUpdateAvailable(true)
      }
    } catch {
      // Silently fail - update check is best-effort
    } finally {
      setIsChecking(false)
    }
  }, [])

  const applyUpdate = useCallback(async () => {
    if (!isUpdateAvailable) return

    try {
      setIsDownloading(true)
      await Updates.fetchUpdateAsync()
      // Reload the app with the new update
      await Updates.reloadAsync()
    } catch {
      // Silently fail - user can try again
    } finally {
      setIsDownloading(false)
    }
  }, [isUpdateAvailable])

  // Check on mount
  useEffect(() => {
    checkForUpdate()
  }, [checkForUpdate])

  // Check when app returns to foreground
  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        checkForUpdate()
      }
    }
    const subscription = AppState.addEventListener('change', handleAppState)
    return () => subscription.remove()
  }, [checkForUpdate])

  return { isUpdateAvailable, isChecking, isDownloading, checkForUpdate, applyUpdate }
}

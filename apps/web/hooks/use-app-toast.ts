'use client'

import { useCallback } from 'react'
import { useAppToastStore } from '@/stores/app-toast-store'

export function useAppToast() {
  const showToast = useAppToastStore((state) => state.showInfo)
  const showError = useAppToastStore((state) => state.showError)
  const showSuccess = useAppToastStore((state) => state.showSuccess)
  const showInfo = useAppToastStore((state) => state.showInfo)
  const showQueued = useAppToastStore((state) => state.showQueued)
  const dismissToast = useAppToastStore((state) => state.dismissToast)

  const showPersistentError = useCallback((message: string, reloadLabel: string) => {
    return useAppToastStore.getState().showToast({
      kind: 'neutral',
      message,
      actionLabel: reloadLabel,
      onAction: () => globalThis.location.reload(),
    })
  }, [])

  return { showToast, showError, showPersistentError, showSuccess, showInfo, showQueued, dismissToast }
}

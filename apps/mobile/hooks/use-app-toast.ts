import { useCallback } from 'react'
import { useAppToastStore } from '@/stores/app-toast-store'

type ToastVariant = 'error' | 'success' | 'info' | 'queued'

interface ShowToastOptions {
  message: string
  variant: ToastVariant
  actionLabel?: string
  onAction?: () => void
}

interface UseAppToastResult {
  showToast: (toast: ShowToastOptions) => void
  showError: (message: string) => void
  showSuccess: (message: string) => void
  showInfo: (message: string) => void
  showQueued: (message: string, actionLabel?: string, onAction?: () => void) => void
}

export function useAppToast(): UseAppToastResult {
  const showToast = useAppToastStore((state) => state.showToast)
  const showErrorFromStore = useAppToastStore((state) => state.showError)
  const showSuccessFromStore = useAppToastStore((state) => state.showSuccess)
  const showInfoFromStore = useAppToastStore((state) => state.showInfo)
  const showQueuedFromStore = useAppToastStore((state) => state.showQueued)

  const showError = useCallback((message: string) => {
    showErrorFromStore(message)
  }, [showErrorFromStore])

  const showSuccess = useCallback((message: string) => {
    showSuccessFromStore(message)
  }, [showSuccessFromStore])

  const showInfo = useCallback((message: string) => {
    showInfoFromStore(message)
  }, [showInfoFromStore])

  const showQueued = useCallback((message: string, actionLabel?: string, onAction?: () => void) => {
    showQueuedFromStore(message, actionLabel, onAction)
  }, [showQueuedFromStore])

  return { showToast, showError, showSuccess, showInfo, showQueued }
}

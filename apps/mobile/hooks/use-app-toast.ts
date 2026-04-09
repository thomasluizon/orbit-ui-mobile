import { useCallback } from 'react'
import { useAppToastStore } from '@/stores/app-toast-store'

export function useAppToast() {
  const showErrorFromStore = useAppToastStore((state) => state.showError)

  const showError = useCallback((message: string) => {
    showErrorFromStore(message)
  }, [showErrorFromStore])

  return { showError }
}

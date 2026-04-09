'use client'

import { useCallback } from 'react'
import { toast } from 'sonner'

export function useAppToast() {
  const showError = useCallback((message: string) => {
    toast.error(message, {
      duration: 5000,
    })
  }, [])

  return { showError }
}

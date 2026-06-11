'use client'

import { createElement, useCallback } from 'react'
import { Clock } from 'lucide-react'
import { toast } from 'sonner'

export function useAppToast() {
  const showToast = useCallback((message: string) => {
    toast(message)
  }, [])

  const showError = useCallback((message: string) => {
    toast.error(message, {
      duration: 5000,
    })
  }, [])

  const showSuccess = useCallback((message: string) => {
    toast.success(message, {
      duration: 4000,
    })
  }, [])

  const showInfo = useCallback((message: string) => {
    toast.info(message, {
      duration: 4000,
    })
  }, [])

  const showQueued = useCallback((message: string, actionLabel?: string, onAction?: () => void) => {
    toast(message, {
      duration: 6000,
      className: 'toast-queued',
      icon: createElement(Clock, { size: 17, strokeWidth: 2.4 }),
      action: actionLabel && onAction
        ? {
            label: actionLabel,
            onClick: onAction,
          }
        : undefined,
    })
  }, [])

  return { showToast, showError, showSuccess, showInfo, showQueued }
}

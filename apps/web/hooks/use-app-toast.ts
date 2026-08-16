'use client'

import { createElement, useCallback } from 'react'
import { Clock } from '@/components/ui/icons'
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

  const showQueued = useCallback(
    (
      message: string,
      actionLabel?: string,
      onAction?: () => void,
      onClose?: () => void,
    ): string | number => {
      return toast(message, {
        duration: 6000,
        className: 'toast-queued',
        icon: createElement(Clock, { size: 17, strokeWidth: 2.4 }),
        onDismiss: onClose,
        onAutoClose: onClose,
        action: actionLabel && onAction
          ? {
              label: actionLabel,
              onClick: onAction,
            }
          : undefined,
      })
    },
    [],
  )

  const dismissToast = useCallback((toastId: string | number) => {
    toast.dismiss(toastId)
  }, [])

  return { showToast, showError, showSuccess, showInfo, showQueued, dismissToast }
}

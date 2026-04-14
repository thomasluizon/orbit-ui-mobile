'use client'

import { useCallback, useMemo, useState } from 'react'

interface UseDismissGuardOptions {
  isDirty: boolean
  onDismiss: () => void
}

export function useDismissGuard({ isDirty, onDismiss }: Readonly<UseDismissGuardOptions>) {
  const [showDiscardDialog, setShowDiscardDialog] = useState(false)

  const requestDismiss = useCallback(() => {
    if (isDirty) {
      setShowDiscardDialog(true)
      return
    }

    onDismiss()
  }, [isDirty, onDismiss])

  const confirmDismiss = useCallback(() => {
    setShowDiscardDialog(false)
    onDismiss()
  }, [onDismiss])

  const cancelDismiss = useCallback(() => {
    setShowDiscardDialog(false)
  }, [])

  return useMemo(
    () => ({
      canDismiss: !isDirty,
      showDiscardDialog,
      requestDismiss,
      confirmDismiss,
      cancelDismiss,
    }),
    [cancelDismiss, confirmDismiss, isDirty, requestDismiss, showDiscardDialog],
  )
}

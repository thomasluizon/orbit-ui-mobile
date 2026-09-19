'use client'

import { useCallback, useMemo } from 'react'
import { resolveDismissGuardAction } from '@orbit/shared/hooks'
import { useAccountScopedState } from '@/hooks/use-session-reset'

interface UseDismissGuardOptions {
  isDirty: boolean
  onDismiss: () => void
}

export function useDismissGuard({ isDirty, onDismiss }: Readonly<UseDismissGuardOptions>) {
  const [showDiscardDialog, setShowDiscardDialog] = useAccountScopedState(false)

  const requestDismiss = useCallback(() => {
    const decision = resolveDismissGuardAction('request', isDirty)
    setShowDiscardDialog(decision.showDiscardDialog)
    if (decision.shouldDismiss) {
      onDismiss()
    }
  }, [isDirty, onDismiss, setShowDiscardDialog])

  const confirmDismiss = useCallback(() => {
    const decision = resolveDismissGuardAction('confirm', isDirty)
    setShowDiscardDialog(decision.showDiscardDialog)
    if (decision.shouldDismiss) {
      onDismiss()
    }
  }, [isDirty, onDismiss, setShowDiscardDialog])

  const cancelDismiss = useCallback(() => {
    const decision = resolveDismissGuardAction('cancel', isDirty)
    setShowDiscardDialog(decision.showDiscardDialog)
  }, [isDirty, setShowDiscardDialog])

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

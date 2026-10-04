'use client'

import { useCallback, useMemo } from 'react'
import { resolveDismissGuardAction } from '@orbit/shared/hooks'
import { useAccountScopedState } from '@/hooks/use-session-reset'

interface UseDismissGuardOptions {
  isDirty: boolean
  onDismiss: () => void
}

export function useDismissGuard({ isDirty, onDismiss }: Readonly<UseDismissGuardOptions>) {
  const [lifecycle, setLifecycle] = useAccountScopedState({
    showDiscardDialog: false, cancelling: false, pendingDismiss: false,
  })

  const requestDismiss = useCallback(() => {
    if (lifecycle.cancelling) {
      setLifecycle((current) => ({ ...current, pendingDismiss: true }))
      return
    }
    const decision = resolveDismissGuardAction('request', isDirty)
    setLifecycle({ showDiscardDialog: decision.showDiscardDialog, cancelling: false, pendingDismiss: false })
    if (decision.shouldDismiss) {
      onDismiss()
    }
  }, [isDirty, lifecycle.cancelling, onDismiss, setLifecycle])

  const confirmDismiss = useCallback(() => {
    const decision = resolveDismissGuardAction('confirm', isDirty)
    setLifecycle({ showDiscardDialog: decision.showDiscardDialog, cancelling: false, pendingDismiss: false })
    if (decision.shouldDismiss) {
      onDismiss()
    }
  }, [isDirty, onDismiss, setLifecycle])

  const beginCancelDismiss = useCallback(() => {
    setLifecycle({ showDiscardDialog: false, cancelling: true, pendingDismiss: false })
  }, [setLifecycle])

  const cancelDismiss = useCallback(() => {
    setLifecycle((current) => ({
      showDiscardDialog: current.pendingDismiss, cancelling: false, pendingDismiss: false,
    }))
  }, [setLifecycle])

  return useMemo(
    () => ({
      canDismiss: !isDirty,
      isCancelling: lifecycle.cancelling,
      showDiscardDialog: lifecycle.showDiscardDialog,
      requestDismiss,
      confirmDismiss,
      cancelDismiss,
      beginCancelDismiss,
    }),
    [beginCancelDismiss, cancelDismiss, confirmDismiss, isDirty, requestDismiss, lifecycle.cancelling, lifecycle.showDiscardDialog],
  )
}

'use client'

import { useCallback, useMemo } from 'react'
import { INITIAL_DISMISS_GUARD_LIFECYCLE, resolveDismissGuardAction, type DismissGuardAction } from '@orbit/shared/hooks'
import { useAccountScopedState } from '@/hooks/use-session-reset'

interface UseDismissGuardOptions {
  isDirty: boolean
  onDismiss: () => void
}

export function useDismissGuard({ isDirty, onDismiss }: Readonly<UseDismissGuardOptions>) {
  const [lifecycle, setLifecycle] = useAccountScopedState(INITIAL_DISMISS_GUARD_LIFECYCLE)

  const applyAction = useCallback((action: DismissGuardAction) => {
    const decision = resolveDismissGuardAction(action, isDirty, lifecycle)
    setLifecycle(decision.lifecycle)
    if (decision.shouldDismiss) {
      onDismiss()
    }
  }, [isDirty, lifecycle, onDismiss, setLifecycle])

  const cancelDismiss = useCallback(() => {
    setLifecycle((current) => resolveDismissGuardAction('complete-cancel', isDirty, current).lifecycle)
  }, [isDirty, setLifecycle])

  return useMemo(
    () => ({
      canDismiss: !isDirty,
      isCancelling: lifecycle.cancelling,
      showDiscardDialog: lifecycle.showDiscardDialog,
      requestDismiss: () => applyAction('request'),
      confirmDismiss: () => applyAction('confirm'),
      cancelDismiss,
      beginCancelDismiss: () => applyAction('begin-cancel'),
    }),
    [applyAction, cancelDismiss, isDirty, lifecycle.cancelling, lifecycle.showDiscardDialog],
  )
}

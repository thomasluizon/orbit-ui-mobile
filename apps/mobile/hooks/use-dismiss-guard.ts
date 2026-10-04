import { useCallback, useMemo, useState } from 'react'
import { resolveDismissGuardAction } from '@orbit/shared/hooks'

interface UseDismissGuardOptions {
  isDirty: boolean
  onDismiss: () => void
}

export function useDismissGuard({ isDirty, onDismiss }: Readonly<UseDismissGuardOptions>) {
  const [lifecycle, setLifecycle] = useState({
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
  }, [isDirty, lifecycle.cancelling, onDismiss])

  const confirmDismiss = useCallback(() => {
    const decision = resolveDismissGuardAction('confirm', isDirty)
    setLifecycle({ showDiscardDialog: decision.showDiscardDialog, cancelling: false, pendingDismiss: false })
    if (decision.shouldDismiss) {
      onDismiss()
    }
  }, [isDirty, onDismiss])

  const beginCancelDismiss = useCallback(() => {
    setLifecycle({ showDiscardDialog: false, cancelling: true, pendingDismiss: false })
  }, [])

  const cancelDismiss = useCallback(() => {
    setLifecycle((current) => ({
      showDiscardDialog: current.pendingDismiss, cancelling: false, pendingDismiss: false,
    }))
  }, [])

  return useMemo(
    () => ({
      canDismiss: !isDirty,
      showDiscardDialog: lifecycle.showDiscardDialog,
      requestDismiss,
      confirmDismiss,
      cancelDismiss,
      beginCancelDismiss,
    }),
    [beginCancelDismiss, cancelDismiss, confirmDismiss, isDirty, requestDismiss, lifecycle.showDiscardDialog],
  )
}

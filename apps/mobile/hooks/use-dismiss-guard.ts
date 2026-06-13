import { useCallback, useMemo, useState } from 'react'
import { resolveDismissGuardAction } from '@orbit/shared/hooks'

interface UseDismissGuardOptions {
  isDirty: boolean
  onDismiss: () => void
}

export function useDismissGuard({ isDirty, onDismiss }: Readonly<UseDismissGuardOptions>) {
  const [showDiscardDialog, setShowDiscardDialog] = useState(false)

  const requestDismiss = useCallback(() => {
    const decision = resolveDismissGuardAction('request', isDirty)
    setShowDiscardDialog(decision.showDiscardDialog)
    if (decision.shouldDismiss) {
      onDismiss()
    }
  }, [isDirty, onDismiss])

  const confirmDismiss = useCallback(() => {
    const decision = resolveDismissGuardAction('confirm', isDirty)
    setShowDiscardDialog(decision.showDiscardDialog)
    if (decision.shouldDismiss) {
      onDismiss()
    }
  }, [isDirty, onDismiss])

  const cancelDismiss = useCallback(() => {
    const decision = resolveDismissGuardAction('cancel', isDirty)
    setShowDiscardDialog(decision.showDiscardDialog)
  }, [isDirty])

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

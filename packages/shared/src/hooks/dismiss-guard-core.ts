export type DismissGuardAction = 'request' | 'confirm' | 'cancel'

export interface DismissGuardDecision {
  showDiscardDialog: boolean
  shouldDismiss: boolean
}

/**
 * Resolves a dismiss-guard interaction shared by the web and mobile
 * `useDismissGuard` hooks: requesting a dismiss on a dirty form opens the
 * discard dialog instead of dismissing, confirming closes the dialog and
 * dismisses, and cancelling just closes the dialog.
 */
export function resolveDismissGuardAction(
  action: DismissGuardAction,
  isDirty: boolean,
): DismissGuardDecision {
  switch (action) {
    case 'request':
      return isDirty
        ? { showDiscardDialog: true, shouldDismiss: false }
        : { showDiscardDialog: false, shouldDismiss: true }
    case 'confirm':
      return { showDiscardDialog: false, shouldDismiss: true }
    case 'cancel':
      return { showDiscardDialog: false, shouldDismiss: false }
  }
}

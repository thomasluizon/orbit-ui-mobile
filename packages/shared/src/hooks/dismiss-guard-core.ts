export type DismissGuardAction = 'request' | 'confirm' | 'begin-cancel' | 'complete-cancel'

export interface DismissGuardLifecycle {
  showDiscardDialog: boolean
  cancelling: boolean
  pendingDismiss: boolean
}

export const INITIAL_DISMISS_GUARD_LIFECYCLE: DismissGuardLifecycle = {
  showDiscardDialog: false,
  cancelling: false,
  pendingDismiss: false,
}

export interface DismissGuardDecision {
  lifecycle: DismissGuardLifecycle
  shouldDismiss: boolean
}

export function resolveDismissGuardAction(
  action: DismissGuardAction,
  isDirty: boolean,
  lifecycle: Readonly<DismissGuardLifecycle>,
): DismissGuardDecision {
  switch (action) {
    case 'request':
      return lifecycle.cancelling
        ? { lifecycle: { ...lifecycle, pendingDismiss: true }, shouldDismiss: false }
        : {
          lifecycle: { ...INITIAL_DISMISS_GUARD_LIFECYCLE, showDiscardDialog: isDirty },
          shouldDismiss: !isDirty,
        }
    case 'confirm':
      return { lifecycle: INITIAL_DISMISS_GUARD_LIFECYCLE, shouldDismiss: true }
    case 'begin-cancel':
      return {
        lifecycle: { ...INITIAL_DISMISS_GUARD_LIFECYCLE, cancelling: true },
        shouldDismiss: false,
      }
    case 'complete-cancel':
      return {
        lifecycle: { ...INITIAL_DISMISS_GUARD_LIFECYCLE, showDiscardDialog: lifecycle.pendingDismiss },
        shouldDismiss: false,
      }
  }
}

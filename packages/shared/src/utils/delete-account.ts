import type { FlowStepFrame } from '../contracts/flow/QuestionFlow'
import type { Profile } from '../types/profile'

export interface DeleteAccountWarningKeys {
  plan: 'profile.deleteAccount.warningPro' | 'profile.deleteAccount.warningFree'
  store: 'profile.deleteAccount.warningAppStore' | null
}

/** The warning keys for the person's plan. The Pro rule mirrors `ConfirmAccountDeletionCommand` in orbit-api: a paid plan that has not expired keeps the 30 day window. */
export function getDeleteAccountWarningKeys(
  profile: Pick<Profile, 'hasProAccess' | 'planExpiresAt' | 'billingProvider' | 'subscriptionSource'> | undefined,
  now: Date,
): DeleteAccountWarningKeys {
  const paidPlanActive = Boolean(profile?.hasProAccess && profile.planExpiresAt !== null && new Date(profile.planExpiresAt) > now)
  const provider = profile?.billingProvider ?? profile?.subscriptionSource
  return {
    plan: paidPlanActive ? 'profile.deleteAccount.warningPro' : 'profile.deleteAccount.warningFree',
    store: provider === 'app_store' ? 'profile.deleteAccount.warningAppStore' : null,
  }
}

/** The state of the delete account flow that its frame reads. */
export interface DeleteAccountFlowStepState {
  step: 'warning' | 'send'
  email: string | null
  offline: boolean
  loading: boolean
  canSend: boolean
  onContinue: () => void
  onBack: () => void
  onClose: () => void
  onSend: () => void
}

/**
 * The frame of a delete account flow step: the place in the two steps, the question and line, the way back and the
 * main action. Offline, no step has a main action. A code request in progress removes the way back, and a second press
 * while it runs, or before the send is allowed, sends nothing.
 */
export function describeDeleteAccountFlowStep(state: DeleteAccountFlowStepState, translate: (key: string, values?: Record<string, string>) => string): FlowStepFrame {
  const send = () => { if (state.canSend && !state.loading) state.onSend() }
  if (state.step === 'warning') {
    const primary = state.offline ? undefined : { label: translate('common.continue'), onPress: state.onContinue }
    return { position: 1, direction: -1 as const, question: translate('profile.deleteAccount.headingAreYouSure'), line: null, onBack: undefined, onDismiss: state.onClose, primary }
  }
  const primary = state.offline ? undefined : { label: translate('profile.deleteAccount.sendCode'), onPress: send, loading: state.loading, variant: 'destructive' as const }
  const line = state.email ? translate('profile.deleteAccount.sendLine', { email: state.email }) : null
  const onBack = state.loading ? undefined : state.onBack
  return { position: 2, direction: 1 as const, question: translate('profile.deleteAccount.sendQuestion'), line, onBack, onDismiss: onBack ?? state.onClose, primary }
}

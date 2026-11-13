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

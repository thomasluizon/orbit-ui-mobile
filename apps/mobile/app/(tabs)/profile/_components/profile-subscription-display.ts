import type { Profile } from '@orbit/shared/types/profile'
import { plural } from '@/lib/plural'
import type { BadgeTone } from '@/components/ui/badge'

type TranslateFn = (key: string, values?: Record<string, string | number>) => string

export interface ProfileSubscriptionDisplay {
  label: string
  hint: string
  showBadge: boolean
  badgeTone: BadgeTone
  badgeLabel: string
}

/** Resolves the subscription plan row label/hint and the identity plan badge
 *  from the profile's trial/pro state. */
export function resolveProfileSubscriptionDisplay(
  profile: Profile | undefined,
  trialExpired: boolean,
  trialDaysLeft: number | null | undefined,
  t: TranslateFn,
): ProfileSubscriptionDisplay {
  const isTrialActive = profile?.isTrialActive ?? false
  const hasProAccess = profile?.hasProAccess ?? false

  const label = isTrialActive
    ? t('profile.subscription.trial')
    : hasProAccess
      ? t('profile.subscription.pro')
      : trialExpired
        ? t('profile.subscription.trialEnded')
        : t('profile.subscription.free')

  const hint = isTrialActive
    ? plural(
        t('profile.subscription.trialDaysLeft', { days: trialDaysLeft ?? 0 }),
        trialDaysLeft ?? 0,
      )
    : hasProAccess
      ? t('profile.subscription.proHint')
      : trialExpired
        ? t('profile.subscription.trialEndedHint')
        : t('profile.subscription.freeHint')

  return {
    label,
    hint,
    showBadge: isTrialActive || hasProAccess,
    badgeTone: isTrialActive ? 'soft' : 'violet',
    badgeLabel: isTrialActive ? t('trial.proBadge') : t('common.proBadge'),
  }
}

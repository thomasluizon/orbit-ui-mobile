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

function resolveSubscriptionLabel(
  isTrialActive: boolean,
  hasProAccess: boolean,
  trialExpired: boolean,
  t: TranslateFn,
): string {
  if (isTrialActive) return t('profile.subscription.trial')
  if (hasProAccess) return t('profile.subscription.pro')
  if (trialExpired) return t('profile.subscription.trialEnded')
  return t('profile.subscription.free')
}

function resolveSubscriptionHint(
  isTrialActive: boolean,
  hasProAccess: boolean,
  trialExpired: boolean,
  trialDaysLeft: number | null | undefined,
  t: TranslateFn,
): string {
  if (isTrialActive) {
    return plural(
      t('profile.subscription.trialDaysLeft', { days: trialDaysLeft ?? 0 }),
      trialDaysLeft ?? 0,
    )
  }
  if (hasProAccess) return t('profile.subscription.proHint')
  if (trialExpired) return t('profile.subscription.trialEndedHint')
  return t('profile.subscription.freeHint')
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

  const label = resolveSubscriptionLabel(isTrialActive, hasProAccess, trialExpired, t)
  const hint = resolveSubscriptionHint(
    isTrialActive,
    hasProAccess,
    trialExpired,
    trialDaysLeft,
    t,
  )

  return {
    label,
    hint,
    showBadge: isTrialActive || hasProAccess,
    badgeTone: isTrialActive ? 'soft' : 'violet',
    badgeLabel: isTrialActive ? t('trial.proBadge') : t('common.proBadge'),
  }
}

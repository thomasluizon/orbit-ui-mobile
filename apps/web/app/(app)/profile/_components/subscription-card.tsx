'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import {
  Sparkles,
  Clock,
  BadgeCheck,
  ChevronRight,
} from 'lucide-react'
import { plural } from '@/lib/plural'
import type { Profile } from '@orbit/shared/types/profile'

interface SubscriptionCardProps {
  profile: Profile | undefined
  trialDaysLeft: number | null
  trialExpired: boolean
}

function getSubscriptionIcon(profile: Profile | undefined) {
  const colorClass =
    profile?.isTrialActive || profile?.hasProAccess
      ? 'text-primary'
      : 'text-amber-400'

  if (profile?.isTrialActive) {
    return <Clock className={`size-5 ${colorClass}`} />
  }
  if (profile?.hasProAccess) {
    return <BadgeCheck className={`size-5 ${colorClass}`} />
  }
  return <Sparkles className={`size-5 ${colorClass}`} />
}

function getSubscriptionLabel(
  profile: Profile | undefined,
  trialExpired: boolean,
  t: ReturnType<typeof useTranslations>,
) {
  if (profile?.isTrialActive) return t('profile.subscription.trial')
  if (profile?.hasProAccess) return t('profile.subscription.pro')
  if (trialExpired) return t('profile.subscription.trialEnded')
  return t('profile.subscription.free')
}

function getSubscriptionHint(
  profile: Profile | undefined,
  trialExpired: boolean,
  trialDaysLeft: number | null,
  t: ReturnType<typeof useTranslations>,
) {
  if (profile?.isTrialActive) {
    return plural(
      t('profile.subscription.trialDaysLeft', { days: trialDaysLeft ?? 0 }),
      trialDaysLeft ?? 0,
    )
  }
  if (profile?.hasProAccess) return t('profile.subscription.proHint')
  if (trialExpired) return t('profile.subscription.trialEndedHint')
  return t('profile.subscription.freeHint')
}

export function SubscriptionCard({
  profile,
  trialDaysLeft,
  trialExpired,
}: SubscriptionCardProps) {
  const t = useTranslations()

  const isProOrTrial = profile?.isTrialActive || profile?.hasProAccess

  return (
    <Link
      href="/upgrade"
      className={`w-full rounded-[var(--radius-xl)] p-5 flex items-center gap-4 transition-all duration-200 group text-left shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] ${
        isProOrTrial
          ? 'bg-primary/10 border border-primary/20 hover:bg-primary/15 hover:border-primary/30'
          : 'bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/15 hover:border-amber-500/30'
      }`}
    >
      <div
        className={`shrink-0 flex items-center justify-center rounded-[var(--radius-lg)] p-3 transition-colors ${
          isProOrTrial
            ? 'bg-primary/20 group-hover:bg-primary/30'
            : 'bg-amber-500/20 group-hover:bg-amber-500/30'
        }`}
      >
        {getSubscriptionIcon(profile)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-text-primary">
          {getSubscriptionLabel(profile, trialExpired, t)}
        </p>
        <p className="text-xs text-text-secondary mt-0.5">
          {getSubscriptionHint(profile, trialExpired, trialDaysLeft, t)}
        </p>
      </div>
      <ChevronRight className="size-4 text-text-muted group-hover:text-text-primary transition-colors shrink-0" />
    </Link>
  )
}

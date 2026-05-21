'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { plural } from '@/lib/plural'
import type { Profile } from '@orbit/shared/types/profile'

interface SubscriptionCardProps {
  profile: Profile | undefined
  trialDaysLeft: number | null
  trialExpired: boolean
}

function getSubscriptionLabel(
  profile: Profile | undefined,
  trialExpired: boolean,
  t: ReturnType<typeof useTranslations>,
): string {
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

/** v8 SettingsRow-style "Plan" card.
 *  - Free: shows "Free" + Pro pill, links to /upgrade
 *  - Trial: shows "Trial · N days" + Upgrade link
 *  - Pro: shows "Pro · Annual" + Manage link */
export function SubscriptionCard({
  profile,
  trialDaysLeft,
  trialExpired,
}: Readonly<SubscriptionCardProps>) {
  const t = useTranslations()
  const isPro = profile?.hasProAccess ?? false
  const isTrial = profile?.isTrialActive ?? false
  const label = getSubscriptionLabel(profile, trialExpired, t)
  const hint = getSubscriptionHint(profile, trialExpired, trialDaysLeft, t)

  let rightLink: React.ReactNode
  if (isPro) {
    rightLink = (
      <Link
        href="/upgrade"
        style={{
          fontFamily: 'var(--font-family-sans)',
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--fg-1)',
          textDecoration: 'underline',
          textUnderlineOffset: 3,
          textDecorationColor: 'var(--hairline-strong)',
          textDecorationThickness: 1,
        }}
      >
        {t('profile.subscription.manage')}
      </Link>
    )
  } else {
    rightLink = (
      <Link
        href="/upgrade"
        style={{
          fontFamily: 'var(--font-family-sans)',
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--fg-1)',
          textDecoration: 'underline',
          textUnderlineOffset: 3,
          textDecorationColor: 'var(--hairline-strong)',
          textDecorationThickness: 1,
        }}
      >
        {t('common.upgrade')}
      </Link>
    )
  }

  return (
    <div
      className="flex items-center"
      style={{
        padding: '14px 20px',
        gap: 12,
        borderBottom: '1px solid var(--hairline)',
      }}
    >
      <div className="flex-1 min-w-0 flex flex-col" style={{ gap: 2 }}>
        <span
          className="overflow-hidden whitespace-nowrap text-ellipsis"
          style={{
            fontFamily: 'var(--font-family-sans)',
            fontSize: 15,
            color: 'var(--fg-1)',
          }}
        >
          {t('profile.subscription.plan')}
        </span>
        <span
          className="overflow-hidden whitespace-nowrap text-ellipsis"
          style={{
            fontFamily: 'var(--font-family-sans)',
            fontSize: 13,
            color: 'var(--fg-3)',
          }}
        >
          {isTrial ? `${label} · ${hint}` : label}{!isTrial && hint ? ` · ${hint}` : ''}
        </span>
      </div>
      {rightLink}
    </div>
  )
}

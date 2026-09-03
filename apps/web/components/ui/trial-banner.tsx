'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { plural } from '@/lib/plural'
import { useProfile, useTrialDaysLeft } from '@/hooks/use-profile'

export function TrialBanner() {
  const t = useTranslations()
  const { profile } = useProfile()
  const trialDaysLeft = useTrialDaysLeft()

  const isTrialActive = profile?.isTrialActive === true
  const isFree = profile?.hasProAccess === false
  const visible = isTrialActive || isFree
  const label = isTrialActive
    ? (trialDaysLeft ?? 0) === 0
      ? t('trial.banner.lastDay')
      : plural(
          t('trial.banner.daysLeft', { days: trialDaysLeft ?? 0 }),
          trialDaysLeft ?? 0,
        )
    : t('trial.banner.freeLine')

  if (!visible) return null

  return (
    <p
      data-trial-line=""
      className="m-0 flex min-h-6 items-center gap-2 px-4 font-mono text-xs text-[var(--fg-3)]"
    >
      <span>{label}</span>
      <Link
        href="/upgrade"
        className="inline-flex items-center whitespace-nowrap font-medium text-[var(--fg-2)] underline decoration-[var(--hairline-strong)] underline-offset-4 transition-colors duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] hover:text-[var(--fg-1)]"
        style={{ minHeight: 44, minWidth: 44 }}
      >
        {t('trial.banner.upgrade')}
      </Link>
    </p>
  )
}

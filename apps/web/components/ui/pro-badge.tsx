'use client'

import { useTranslations } from 'next-intl'
import { useProfile } from '@/hooks/use-profile'
import './pro-badge.css'

export function ProBadge() {
  const t = useTranslations()
  const { profile } = useProfile()

  const isTrialActive = profile?.isTrialActive ?? false
  const hasProAccess = profile?.hasProAccess ?? false

  if (!isTrialActive && !hasProAccess) return null

  const badgeLabel = isTrialActive ? t('trial.proBadge') : t('common.proBadge')

  return (
    <span className="pro-badge-shimmer bg-[var(--bg-elev)] text-[var(--primary)] text-[10px] font-bold rounded-full px-1.5 py-0.5 transition-colors duration-150">
      {badgeLabel}
    </span>
  )
}

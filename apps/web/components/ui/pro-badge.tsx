'use client'

import { useTranslations } from 'next-intl'
import { useProfile } from '@/hooks/use-profile'

export function ProBadge() {
  const t = useTranslations()
  const { profile } = useProfile()

  const isTrialActive = profile?.isTrialActive ?? false
  const hasProAccess = profile?.hasProAccess ?? false

  if (!isTrialActive && !hasProAccess) return null

  const badgeLabel = isTrialActive ? t('trial.proBadge') : t('common.proBadge')

  return (
    <span className="bg-[var(--bg-elev)] text-[var(--primary)] text-[10px] font-semibold font-[family-name:var(--font-mono)] tracking-[0.04em] rounded-full border border-[var(--hairline)] px-1.5 py-0.5">
      {badgeLabel}
    </span>
  )
}

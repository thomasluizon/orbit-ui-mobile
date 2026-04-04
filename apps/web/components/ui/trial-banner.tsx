'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Clock, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { plural } from '@/lib/plural'
import { useProfile, useTrialDaysLeft, useTrialUrgent } from '@/hooks/use-profile'

export function TrialBanner() {
  const t = useTranslations()
  const { profile } = useProfile()
  const trialDaysLeft = useTrialDaysLeft()
  const trialUrgent = useTrialUrgent()
  const [dismissed, setDismissed] = useState(false)

  const visible = profile?.isTrialActive && !dismissed

  if (!visible) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className={`rounded-[var(--radius-lg)] px-4 py-2 flex items-center gap-3 mt-4 mb-2 border shadow-[var(--shadow-sm)] ${
        trialUrgent
          ? 'bg-amber-500/10 border-amber-500/20 border-l-2 border-l-warning'
          : 'bg-primary/10 border-primary/20 border-l-2 border-l-primary'
      }`}
    >
      <Clock className={`size-4 shrink-0 ${trialUrgent ? 'text-amber-400' : 'text-primary'}`} aria-hidden="true" />
      <span className={`text-sm font-medium flex-1 ${trialUrgent ? 'text-amber-400' : 'text-primary'}`}>
        {trialDaysLeft === 0
          ? t('trial.banner.lastDay')
          : plural(t('trial.banner.daysLeft', { days: trialDaysLeft ?? 0 }), trialDaysLeft ?? 0)}
      </span>
      <Link
        href="/upgrade"
        className={`text-xs font-bold shrink-0 ${
          trialUrgent ? 'text-amber-400 hover:text-amber-300' : 'text-primary hover:text-primary/80'
        }`}
      >
        {t('trial.banner.upgrade')}
      </Link>
      <button
        aria-label={t('common.dismiss')}
        className="shrink-0 p-0.5 rounded-full hover:bg-white/10 transition-all duration-150"
        onClick={() => setDismissed(true)}
      >
        <X className={`size-3.5 ${trialUrgent ? 'text-amber-400/60' : 'text-primary/60'}`} aria-hidden="true" />
      </button>
    </div>
  )
}

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Clock, X } from 'lucide-react'
import { useProfile, useTrialDaysLeft, useTrialUrgent } from '@/hooks/use-profile'

// TODO: Replace with next-intl when i18n is wired up
const t = (key: string, params?: Record<string, string | number>) => {
  const strings: Record<string, string> = {
    'trial.banner.lastDay': 'Last day of your Pro trial!',
    'trial.banner.daysLeft': `${params?.days ?? 0} days left in your Pro trial`,
    'trial.banner.upgrade': 'Upgrade',
  }
  return strings[key] ?? key
}

export function TrialBanner() {
  const { profile } = useProfile()
  const trialDaysLeft = useTrialDaysLeft()
  const trialUrgent = useTrialUrgent()
  const [dismissed, setDismissed] = useState(false)

  const visible = profile?.isTrialActive && !dismissed

  if (!visible) return null

  return (
    <div
      className={`rounded-[var(--radius-lg)] px-4 py-2 flex items-center gap-3 mt-4 mb-2 border shadow-[var(--shadow-sm)] ${
        trialUrgent
          ? 'bg-amber-500/10 border-amber-500/20 border-l-2 border-l-warning'
          : 'bg-primary/10 border-primary/20 border-l-2 border-l-primary'
      }`}
    >
      <Clock className={`size-4 shrink-0 ${trialUrgent ? 'text-amber-400' : 'text-primary'}`} />
      <span className={`text-sm font-medium flex-1 ${trialUrgent ? 'text-amber-400' : 'text-primary'}`}>
        {trialDaysLeft === 0
          ? t('trial.banner.lastDay')
          : t('trial.banner.daysLeft', { days: trialDaysLeft ?? 0 })}
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
        className="shrink-0 p-0.5 rounded-full hover:bg-white/10 transition-all duration-150"
        onClick={() => setDismissed(true)}
      >
        <X className={`size-3.5 ${trialUrgent ? 'text-amber-400/60' : 'text-primary/60'}`} />
      </button>
    </div>
  )
}

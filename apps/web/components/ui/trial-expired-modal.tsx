'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Sparkles, CheckCircle2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { plural } from '@/lib/plural'
import { useTrialExpired } from '@/hooks/use-profile'
import { AppOverlay } from '@/components/ui/app-overlay'

const STORAGE_KEY = 'orbit_trial_expired_seen'

const features = [
  'trial.expired.unlimitedHabits',
  'trial.expired.aiChat',
  'trial.expired.allColors',
  'trial.expired.aiSummary',
  'trial.expired.subHabits',
]

export function TrialExpiredModal() {
  const t = useTranslations()
  const trialExpired = useTrialExpired()
  const [dismissed, setDismissed] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const isOpen = mounted && !dismissed && trialExpired && !localStorage.getItem(STORAGE_KEY)

  function dismiss() {
    setDismissed(true)
    localStorage.setItem(STORAGE_KEY, '1')
  }

  if (!isOpen) return null

  return (
    <AppOverlay
      open={true}
      onOpenChange={(open) => {
        if (!open) dismiss()
      }}
      titleContent={
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Sparkles className="size-5 text-primary" />
          </div>
          <span>{t('trial.expired.title')}</span>
        </div>
      }
      footer={
        <div className="space-y-3">
          <Link
            href="/upgrade"
            className="block w-full py-3.5 rounded-[var(--radius-xl)] bg-primary text-white font-bold text-sm text-center hover:bg-primary/90 transition-all duration-150 active:scale-[0.98] shadow-[var(--shadow-glow)]"
            onClick={dismiss}
          >
            {t('trial.expired.subscribe')}
          </Link>
          <button
            className="w-full py-2 text-text-secondary text-sm font-medium"
            onClick={dismiss}
          >
            {t('trial.expired.continueFree')}
          </button>
        </div>
      }
    >
      <p className="text-text-secondary text-sm mb-4">
        {plural(t('trial.expired.subtitle', { days: 7 }), 7)}
      </p>

      <p className="form-label mb-3">
        {t('trial.expired.dontLose')}
      </p>

      <ul className="space-y-2.5">
        {features.map((feature) => (
          <li key={feature} className="flex items-center gap-2.5">
            <CheckCircle2 className="size-4 text-primary shrink-0" />
            <span className="text-sm text-text-secondary">{t(feature)}</span>
          </li>
        ))}
      </ul>
    </AppOverlay>
  )
}

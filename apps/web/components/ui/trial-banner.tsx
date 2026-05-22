'use client'

import { useState } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
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
      className="flex items-center"
      style={{
        padding: '8px 14px',
        background: 'transparent',
        borderTop: '1px solid var(--hairline)',
        borderBottom: '1px solid var(--hairline)',
        gap: 12,
      }}
    >
      <span
        className="flex-1"
        style={{
          fontFamily: 'var(--font-family-sans)',
          fontSize: 13,
          color: 'var(--fg-2)',
        }}
      >
        {t('trial.banner.trialEyebrow')}{' '}
        {trialDaysLeft === 0 ? (
          <span style={{ color: 'var(--status-overdue)', fontStyle: 'italic' }}>
            {t('trial.banner.lastDay')}
          </span>
        ) : (
          <span style={{ color: 'var(--fg-1)' }}>
            {plural(
              t('trial.banner.daysLeft', { days: trialDaysLeft ?? 0 }),
              trialDaysLeft ?? 0,
            )}
          </span>
        )}
      </span>
      <Link
        href="/upgrade"
        style={{
          fontFamily: 'var(--font-family-sans)',
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--fg-1)',
          padding: 4,
        }}
      >
        {t('trial.banner.upgrade')}
      </Link>
      <button
        type="button"
        aria-label={t('common.dismiss')}
        className="appearance-none border-0 bg-transparent cursor-pointer"
        style={{ padding: 4, color: trialUrgent ? 'var(--status-overdue)' : 'var(--fg-3)' }}
        onClick={() => setDismissed(true)}
      >
        <X size={14} strokeWidth={1.6} aria-hidden="true" />
      </button>
    </div>
  )
}

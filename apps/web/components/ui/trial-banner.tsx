'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronRight, X } from 'lucide-react'
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
        padding: '9px 14px',
        gap: 12,
        background: trialUrgent
          ? 'color-mix(in srgb, var(--status-overdue) 10%, transparent)'
          : 'rgba(var(--primary-rgb), 0.08)',
        boxShadow: trialUrgent
          ? 'inset 0 0 0 1px color-mix(in srgb, var(--status-overdue) 28%, transparent)'
          : 'inset 0 0 0 1px rgba(var(--primary-rgb), 0.18)',
      }}
    >
      <span
        className="flex-1"
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 13,
          color: 'var(--fg-2)',
        }}
      >
        {t('trial.banner.trialEyebrow')}{' '}
        {trialDaysLeft === 0 ? (
          <span style={{ color: 'var(--status-overdue)' }}>
            {t('trial.banner.lastDay')}
          </span>
        ) : (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontVariantNumeric: 'tabular-nums',
              color: 'var(--fg-1)',
            }}
          >
            {plural(
              t('trial.banner.daysLeft', { days: trialDaysLeft ?? 0 }),
              trialDaysLeft ?? 0,
            )}
          </span>
        )}
      </span>
      <Link
        href="/upgrade"
        className="inline-flex items-center transition-opacity duration-150 ease-out hover:opacity-80"
        style={{
          gap: 2,
          minHeight: 44,
          margin: '-12px 0',
          fontFamily: 'var(--font-sans)',
          fontSize: 13,
          fontWeight: 500,
          color: trialUrgent ? 'var(--status-overdue)' : 'var(--primary-soft)',
          padding: '0 4px',
        }}
      >
        {t('trial.banner.upgrade')}
        <ChevronRight size={14} strokeWidth={2.2} aria-hidden="true" />
      </Link>
      <button
        type="button"
        aria-label={t('common.dismiss')}
        className="inline-flex cursor-pointer appearance-none items-center justify-center border-0 bg-transparent transition-colors duration-150 ease-out hover:text-[var(--fg-1)]"
        style={{
          width: 44,
          height: 44,
          margin: '-12px -10px',
          color: trialUrgent ? 'var(--status-overdue)' : 'var(--fg-3)',
        }}
        onClick={() => setDismissed(true)}
      >
        <X size={14} strokeWidth={1.8} aria-hidden="true" />
      </button>
    </div>
  )
}

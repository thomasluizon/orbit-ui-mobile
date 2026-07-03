'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
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
  const shouldReduceMotion = useReducedMotion()

  const visible = profile?.isTrialActive && !dismissed

  return (
    <AnimatePresence initial={false}>
      {visible ? (
        <motion.div
          key="trial-banner"
          role="status"
          aria-live="polite"
          className="flex items-center md:mt-2 md:rounded-[12px]"
          exit={{ opacity: 0, y: shouldReduceMotion ? 0 : -4 }}
          transition={{ duration: shouldReduceMotion ? 0 : 0.16, ease: [0.2, 0, 0, 1] }}
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
            {t('trial.banner.trialEyebrow')} ·{' '}
            {trialDaysLeft === 0 ? (
              <span style={{ color: 'var(--status-overdue-text)' }}>
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
              color: trialUrgent ? 'var(--status-overdue-text)' : 'var(--primary-soft)',
              padding: '0 4px',
            }}
          >
            {t('trial.banner.upgrade')}
            <ChevronRight size={14} strokeWidth={2.2} aria-hidden="true" />
          </Link>
          <button
            type="button"
            aria-label={t('common.dismiss')}
            className="icon-btn touch-target hover:text-[var(--fg-1)]"
            style={{
              width: 40,
              height: 40,
              margin: '-10px -8px',
              color: trialUrgent ? 'var(--status-overdue)' : 'var(--fg-3)',
            }}
            onClick={() => setDismissed(true)}
          >
            <X size={18} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

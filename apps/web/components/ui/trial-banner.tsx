'use client'

import { useState } from 'react'
import Link from 'next/link'
// react-doctor-disable-next-line use-lazy-motion -- LazyMotion migration is app-wide (needs a shared provider + converting every motion.* across components/**); a partial per-file swap yields no bundle benefit and risks unprovided m https://github.com/thomasluizon/orbit-ui-mobile/issues/243
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ChevronRight, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { plural } from '@/lib/plural'
import { useProfile, useTrialDaysLeft, useTrialUrgent } from '@/hooks/use-profile'
import { resolveTrialBannerColors } from '@/components/ui/trial-banner-colors'

export function TrialBanner() {
  const t = useTranslations()
  const { profile } = useProfile()
  const trialDaysLeft = useTrialDaysLeft()
  const trialUrgent = useTrialUrgent()
  const [dismissed, setDismissed] = useState(false)
  const shouldReduceMotion = useReducedMotion()

  const visible = profile?.isTrialActive && !dismissed
  const bannerColors = resolveTrialBannerColors(!!trialUrgent)

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
            background: bannerColors.background,
            boxShadow: bannerColors.boxShadow,
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
              color: bannerColors.accentColor,
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
              color: bannerColors.dismissColor,
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

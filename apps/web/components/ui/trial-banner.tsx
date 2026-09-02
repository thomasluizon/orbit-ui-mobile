'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ChevronRight, X } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import { plural } from '@/lib/plural'
import { useProfile, useTrialDaysLeft } from '@/hooks/use-profile'
import { resolveTrialBannerColors } from '@/components/ui/trial-banner-colors'

export function TrialBanner() {
  const t = useTranslations()
  const { profile } = useProfile()
  const trialDaysLeft = useTrialDaysLeft()
  const [dismissed, setDismissed] = useState(false)
  const shouldReduceMotion = useReducedMotion()
  const bannerColors = resolveTrialBannerColors()

  const isTrialActive = profile?.isTrialActive === true
  const isFree = profile?.hasProAccess === false
  const visible = (isTrialActive || isFree) && !dismissed
  const label = isTrialActive
    ? (trialDaysLeft ?? 0) === 0
      ? t('trial.banner.lastDay')
      : plural(
          t('trial.banner.daysLeft', { days: trialDaysLeft ?? 0 }),
          trialDaysLeft ?? 0,
        )
    : t('trial.banner.freeLine')

  return (
    <AnimatePresence initial={false}>
      {visible ? (
        <motion.div
          key="trial-banner"
          role="status"
          aria-live="polite"
          className="flex items-center md:mt-2 md:rounded-[12px]"
          exit={{ opacity: 0, y: shouldReduceMotion ? 0 : -12 }}
          transition={{
            duration: shouldReduceMotion ? 0 : 0.16,
            ease: [0.16, 1, 0.3, 1],
          }}
          style={{
            minHeight: 52,
            padding: '4px 12px',
            gap: 12,
            background: bannerColors.background,
            boxShadow: bannerColors.boxShadow,
          }}
        >
          <span
            className="min-w-0 flex-1 text-pretty"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              lineHeight: 1.4,
              fontVariantNumeric: 'tabular-nums',
              color: 'var(--fg-2)',
            }}
          >
            {label}
          </span>
          <Link
            href="/upgrade"
            className="inline-flex min-h-11 items-center gap-1 transition-colors duration-[240ms] ease-[var(--ease-standard)] hover:text-[var(--fg-1)]"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 14,
              fontWeight: 500,
              color: bannerColors.actionColor,
              padding: '0 4px',
            }}
          >
            {t('trial.banner.upgrade')}
            <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
          </Link>
          <button
            type="button"
            aria-label={t('common.dismiss')}
            className="icon-btn touch-target h-11 w-11 hover:text-[var(--fg-1)]"
            style={{ color: bannerColors.dismissColor }}
            onClick={() => setDismissed(true)}
          >
            <X size={20} strokeWidth={2} aria-hidden="true" />
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

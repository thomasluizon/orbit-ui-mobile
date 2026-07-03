'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useQueryClient } from '@tanstack/react-query'
import { Gift } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { motionDurations, motionEasings } from '@orbit/shared/theme'
import { referralKeys } from '@orbit/shared/query'
import type { ReferralDashboard } from '@orbit/shared/types/referral'
import {
  canPromptReferral,
  parseReferralMilestoneKey,
} from '@orbit/shared/stores'
import { AppOverlay } from '@/components/ui/app-overlay'
import { PillButton } from '@/components/ui/pill-button'
import { ReferralDrawer } from '@/components/referral/referral-drawer'
import { useUIStore } from '@/stores/ui-store'
import { useReferralPromptStore } from '@/stores/referral-prompt-store'

const SETTLE_DELAY_MS = 500
const DEFAULT_DISCOUNT_PERCENT = 10

function enterTransition(delayMs: number) {
  return {
    duration: motionDurations.base / 1000,
    ease: motionEasings.enter,
    delay: delayMs / 1000,
  }
}

/** One-shot milestone nudge: shows once no celebration is in flight and the re-prompt guard allows it, then hands off to the referral drawer. */
export function ReferralPrompt() {
  const t = useTranslations()
  const prefersReducedMotion = useReducedMotion()
  const queryClient = useQueryClient()
  const armedPrompt = useReferralPromptStore((s) => s.armedPrompt)
  const markEngagementPrompted = useReferralPromptStore(
    (s) => s.markEngagementPrompted,
  )
  const clearArmedMilestone = useReferralPromptStore(
    (s) => s.clearArmedMilestone,
  )
  const celebrationInFlight = useUIStore(
    (s) => s.activeCelebration !== null || s.queuedCelebrations.length > 0,
  )

  const armedMilestoneKey =
    armedPrompt?.kind === 'referral' ? armedPrompt.milestoneKey : null

  const [visibleKey, setVisibleKey] = useState<string | null>(null)
  const [showDrawer, setShowDrawer] = useState(false)
  const settleTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    if (visibleKey || !armedMilestoneKey || celebrationInFlight) return

    if (
      !canPromptReferral(
        useReferralPromptStore.getState(),
        armedMilestoneKey,
        new Date().toISOString(),
      )
    ) {
      clearArmedMilestone()
      return
    }

    settleTimerRef.current = setTimeout(() => {
      markEngagementPrompted(armedMilestoneKey, new Date().toISOString())
      setVisibleKey(armedMilestoneKey)
    }, SETTLE_DELAY_MS)

    return () => {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
    }
  }, [
    armedMilestoneKey,
    celebrationInFlight,
    visibleKey,
    markEngagementPrompted,
    clearArmedMilestone,
  ])

  const milestone = visibleKey ? parseReferralMilestoneKey(visibleKey) : null
  const cached = queryClient.getQueryData<ReferralDashboard>(referralKeys.all)
  const discount = cached?.stats.discountPercent ?? DEFAULT_DISCOUNT_PERCENT

  const title =
    milestone?.kind === 'level'
      ? t('referral.prompt.levelTitle', { level: milestone.value })
      : t('referral.prompt.streakTitle', { count: milestone?.value ?? 0 })

  function dismiss() {
    setVisibleKey(null)
  }

  function openDrawer() {
    setVisibleKey(null)
    setShowDrawer(true)
  }

  return (
    <>
      <AppOverlay
        open={visibleKey !== null}
        onOpenChange={(open) => {
          if (!open) dismiss()
        }}
        title={title}
      >
        <div
          className="flex flex-col items-center text-center"
          style={{ gap: 16, padding: '4px 0 4px' }}
        >
          <motion.p
            className="t-eyebrow"
            style={{ margin: 0 }}
            initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={enterTransition(70)}
          >
            {t('referral.prompt.eyebrow')}
          </motion.p>
          <motion.span
            aria-hidden="true"
            className="flex items-center justify-center rounded-full"
            style={{
              width: 64,
              height: 64,
              background: 'rgba(var(--primary-rgb), 0.15)',
            }}
            initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={enterTransition(0)}
          >
            <Gift size={30} strokeWidth={1.8} color="var(--primary-soft)" />
          </motion.span>
          <motion.p
            style={{
              margin: 0,
              fontFamily: 'var(--font-sans)',
              fontSize: 15,
              lineHeight: 1.5,
              color: 'var(--fg-2)',
            }}
            initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={enterTransition(70)}
          >
            {t('referral.prompt.body', { discount })}
          </motion.p>
          <motion.div
            className="flex w-full flex-col"
            style={{ gap: 8, paddingTop: 4 }}
            initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={enterTransition(140)}
          >
            <PillButton fullWidth onClick={openDrawer}>
              {t('referral.prompt.cta')}
            </PillButton>
            <button
              type="button"
              onClick={dismiss}
              className="w-full text-[var(--fg-3)] transition-[color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:text-[var(--fg-1)] active:scale-[0.96]"
              style={{
                padding: '12px 0',
                fontFamily: 'var(--font-sans)',
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              {t('referral.prompt.later')}
            </button>
          </motion.div>
        </div>
      </AppOverlay>
      <ReferralDrawer open={showDrawer} onOpenChange={setShowDrawer} />
    </>
  )
}

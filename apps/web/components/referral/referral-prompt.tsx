'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useQueryClient } from '@tanstack/react-query'
import { Gift } from 'lucide-react'
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

/** One-shot milestone nudge: shows once no celebration is in flight and the re-prompt guard allows it, then hands off to the referral drawer. */
export function ReferralPrompt() {
  const t = useTranslations()
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
        titleContent={
          <span className="flex flex-col" style={{ gap: 2 }}>
            <span
              style={{
                fontSize: 12,
                fontWeight: 500,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--fg-3)',
              }}
            >
              {t('referral.prompt.eyebrow')}
            </span>
            <span>{title}</span>
          </span>
        }
      >
        <div
          className="flex flex-col items-center text-center"
          style={{ gap: 16, padding: '4px 0 4px' }}
        >
          <span
            aria-hidden="true"
            className="flex items-center justify-center rounded-full"
            style={{
              width: 64,
              height: 64,
              background: 'rgba(var(--primary-rgb), 0.16)',
            }}
          >
            <Gift size={30} strokeWidth={1.8} color="var(--primary-soft)" />
          </span>
          <p
            style={{
              margin: 0,
              fontFamily: 'var(--font-sans)',
              fontSize: 15,
              lineHeight: 1.5,
              color: 'var(--fg-2)',
            }}
          >
            {t('referral.prompt.body', { discount })}
          </p>
          <div className="flex w-full flex-col" style={{ gap: 8, paddingTop: 4 }}>
            <PillButton fullWidth onClick={openDrawer}>
              {t('referral.prompt.cta')}
            </PillButton>
            <button
              type="button"
              onClick={dismiss}
              className="w-full transition-colors"
              style={{
                padding: '10px 0',
                fontFamily: 'var(--font-sans)',
                fontSize: 14,
                fontWeight: 500,
                color: 'var(--fg-3)',
              }}
            >
              {t('referral.prompt.later')}
            </button>
          </div>
        </div>
      </AppOverlay>
      <ReferralDrawer open={showDrawer} onOpenChange={setShowDrawer} />
    </>
  )
}

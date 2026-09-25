'use client'

import { useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { useQueryClient } from '@tanstack/react-query'
import { referralKeys } from '@orbit/shared/query'
import type { ReferralDashboard } from '@orbit/shared/types/referral'
import {
  canPromptReferral,
  parseReferralMilestoneKey,
} from '@orbit/shared/stores'
import { ReferralDrawer } from '@/components/referral/referral-drawer'
import { PillButton } from '@/components/ui/pill-button'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { useReferralPromptStore } from '@/stores/referral-prompt-store'
import { useAccountScopedState, useResetOnAccountChange } from '@/hooks/use-session-reset'
import { useUIStore } from '@/stores/ui-store'

const SETTLE_DELAY_MS = 500

/** One-shot milestone nudge that hands off to the referral drawer. */
export function ReferralPrompt() {
  const t = useTranslations()
  const { sheetRef, closeSheet } = useSheetHost()
  const queryClient = useQueryClient()
  const armedPrompt = useReferralPromptStore((state) => state.armedPrompt)
  const markEngagementPrompted = useReferralPromptStore(
    (state) => state.markEngagementPrompted,
  )
  const clearArmedMilestone = useReferralPromptStore(
    (state) => state.clearArmedMilestone,
  )
  const celebrationInFlight = useUIStore(
    (state) => state.activeCelebration !== null || state.queuedCelebrations.length > 0,
  )

  const armedMilestoneKey =
    armedPrompt?.kind === 'referral' ? armedPrompt.milestoneKey : null
  const [visibleKey, setVisibleKey] = useAccountScopedState<string | null>(null)
  const [showDrawer, setShowDrawer] = useAccountScopedState(false)
  const settleTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const retiredPromptRef = useRef<typeof armedPrompt>(null)
  /**
   * The settle timer is the one thing the state reset above cannot reach: with no prompt on
   * screen its effect never re-runs, so a timer armed for the previous account would open this
   * prompt under the next one.
   */
  useResetOnAccountChange(() => {
    clearTimeout(settleTimerRef.current)
    retiredPromptRef.current = armedPrompt
  })

  useEffect(() => {
    if (visibleKey || !armedMilestoneKey || celebrationInFlight || armedPrompt === retiredPromptRef.current) return

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
    armedPrompt,
    armedMilestoneKey,
    celebrationInFlight,
    visibleKey,
    markEngagementPrompted,
    clearArmedMilestone,
    setVisibleKey,
  ])

  const milestone = visibleKey ? parseReferralMilestoneKey(visibleKey) : null
  const cached = queryClient.getQueryData<ReferralDashboard>(referralKeys.all)
  const discount = cached?.stats.discountPercent
  const title = milestone?.kind === 'level'
    ? t('referral.prompt.levelTitle', { level: milestone.value })
    : t('referral.prompt.streakTitle', { count: milestone?.value ?? 0 })
  const body = discount == null
    ? t('referral.prompt.bodyFallback')
    : t('referral.prompt.body', { discount })

  function openDrawer() {
    closeSheet(() => {
      setVisibleKey(null)
      setShowDrawer(true)
    })
  }

  return (
    <>
      {visibleKey !== null ? (
        <Sheet
          ref={sheetRef}
          open
          onClose={() => setVisibleKey(null)}
          title={title}
        >
          <div className="flex flex-col items-center gap-4 px-6 pb-6 text-center">
            <p className="m-0 max-w-[42ch] text-base leading-6 text-[var(--fg-2)]">
              {body}
            </p>
            <div className="flex w-full flex-col gap-2">
              <PillButton onClick={openDrawer}>
                {t('referral.prompt.cta')}
              </PillButton>
              <button
                type="button"
                onClick={() => closeSheet()}
                className="touch-target w-full border-0 bg-transparent text-sm font-medium text-[var(--fg-3)] transition-[color,transform] duration-[var(--dur-fast)] ease-out hover:text-[var(--fg-1)] active:scale-[0.96]"
              >
                {t('referral.prompt.later')}
              </button>
            </div>
          </div>
        </Sheet>
      ) : null}
      <ReferralDrawer open={showDrawer} onOpenChange={setShowDrawer} />
    </>
  )
}

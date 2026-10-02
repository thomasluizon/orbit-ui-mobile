'use client'

import { useEffect, useId, useRef } from 'react'
import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import { useQueryClient } from '@tanstack/react-query'
import { referralKeys } from '@orbit/shared/query'
import type { ReferralDashboard } from '@orbit/shared/types/referral'
import {
  canPromptReferral,
  hasOpenPromptBlockingOverlay,
  parseReferralMilestoneKey,
} from '@orbit/shared/stores'
import { PillButton } from '@/components/ui/pill-button'
import { PromptQuietAction } from '@/components/ui/prompt-quiet-action'
import { ActionRow } from '@/components/ui/action-row'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { useReferralPromptStore } from '@/stores/referral-prompt-store'
import { useAccountScopedState, useResetOnAccountChange } from '@/hooks/use-session-reset'
import { useUIStore } from '@/stores/ui-store'

const SETTLE_DELAY_MS = 500
const ReferralDrawer = dynamic(() =>
  import('@/components/referral/referral-drawer').then((module) => module.ReferralDrawer),
)

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
  const anotherOverlayOpen = useUIStore(hasOpenPromptBlockingOverlay)
  const promptId = useId()
  const unregisterOpenOverlay = useUIStore((state) => state.unregisterOpenOverlay)

  const armedMilestoneKey =
    armedPrompt?.kind === 'referral' ? armedPrompt.milestoneKey : null
  const [visibleKey, setVisibleKey] = useAccountScopedState<string | null>(null)
  const [showDrawer, setShowDrawer] = useAccountScopedState(false)
  const settleTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const wasVisibleRef = useRef(false)
  useEffect(() => {
    if (visibleKey) wasVisibleRef.current = true
    else if (wasVisibleRef.current) {
      wasVisibleRef.current = false
      unregisterOpenOverlay(promptId)
    }
  }, [visibleKey, promptId, unregisterOpenOverlay])
  useEffect(() => () => unregisterOpenOverlay(promptId), [promptId, unregisterOpenOverlay])
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
    if (visibleKey || !armedMilestoneKey || celebrationInFlight || anotherOverlayOpen || armedPrompt === retiredPromptRef.current) return

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
      if (!useUIStore.getState().tryReservePromptOverlay(promptId)) return
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
    anotherOverlayOpen,
    promptId,
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
          actions={(
            <ActionRow>
              <PromptQuietAction onClick={() => closeSheet()}>
                {t('referral.prompt.later')}
              </PromptQuietAction>
              <PillButton size="sm" onClick={openDrawer}>{t('referral.prompt.cta')}</PillButton>
            </ActionRow>
          )}
        >
          <div className="flex flex-col items-center text-center">
            <p className="m-0 max-w-[42ch] text-base leading-6 text-[var(--fg-2)]">
              {body}
            </p>
          </div>
        </Sheet>
      ) : null}
      {showDrawer ? <ReferralDrawer open onOpenChange={setShowDrawer} /> : null}
    </>
  )
}

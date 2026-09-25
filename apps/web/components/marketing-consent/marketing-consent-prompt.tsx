'use client'

import { useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { useMutation } from '@tanstack/react-query'
import { MARKETING_CONSENT_MILESTONE_KEY } from '@orbit/shared/stores'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { PillButton } from '@/components/ui/pill-button'
import { useUIStore } from '@/stores/ui-store'
import { useReferralPromptStore } from '@/stores/referral-prompt-store'
import { useAccountScopedState, useResetOnAccountChange } from '@/hooks/use-session-reset'
import { getAccountGeneration } from '@/lib/session-epoch'
import { useProfile } from '@/hooks/use-profile'
import { updateMarketingConsent } from '@/lib/actions/profile'

const SETTLE_DELAY_MS = 500

/**
 * One-time LGPD-lawful marketing-email consent nudge. Shows once onboarding is complete, the
 * armed slot holds a consent prompt, and no celebration is in flight — deliberately skipping the
 * shared 14-day cooldown while still recording the prompt so other prompts treat it as recent.
 * The backdrop dismiss leaves consent undecided (null), so it can re-ask; an explicit Yes/No
 * persists the decision and the strict `=== null` arming gate prevents it from ever re-showing.
 */
export function MarketingConsentPrompt() {
  const t = useTranslations()
  const { profile, patchProfile, invalidate } = useProfile()
  const armedPrompt = useReferralPromptStore((s) => s.armedPrompt)
  const markEngagementPrompted = useReferralPromptStore(
    (s) => s.markEngagementPrompted,
  )
  const celebrationInFlight = useUIStore(
    (s) => s.activeCelebration !== null || s.queuedCelebrations.length > 0,
  )

  const isArmed = armedPrompt?.kind === 'consent'
  const [visible, setVisible] = useAccountScopedState(false)
  const { sheetRef, closeSheet } = useSheetHost()
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

  const mutation = useMutation({
    mutationFn: (enabled: boolean) => updateMarketingConsent({ enabled }),
    onMutate: (enabled) => {
      const accountGeneration = getAccountGeneration()
      const previous = profile?.marketingEmailConsent ?? null
      patchProfile({ marketingEmailConsent: enabled })
      return { previous, accountGeneration }
    },
    onError: (_error, _enabled, context) => {
      if (context?.accountGeneration !== getAccountGeneration()) return
      patchProfile({ marketingEmailConsent: context.previous })
    },
    onSettled: (_data, _error, _enabled, context) => {
      if (context?.accountGeneration !== getAccountGeneration()) return
      invalidate()
    },
  })

  useEffect(() => {
    if (visible || !isArmed || celebrationInFlight || armedPrompt === retiredPromptRef.current) return

    settleTimerRef.current = setTimeout(() => {
      markEngagementPrompted(
        MARKETING_CONSENT_MILESTONE_KEY,
        new Date().toISOString(),
      )
      setVisible(true)
    }, SETTLE_DELAY_MS)

    return () => {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
    }
  }, [armedPrompt, celebrationInFlight, isArmed, markEngagementPrompted, setVisible, visible])

  function answer(enabled: boolean) {
    const accountGeneration = getAccountGeneration()
    closeSheet(() => {
      if (getAccountGeneration() !== accountGeneration) return
      setVisible(false)
      mutation.mutate(enabled)
    })
  }

  return (
    visible ? (<Sheet
      ref={sheetRef}
      open
      onClose={() => setVisible(false)}
      title={t('marketingConsent.prompt.title')}
    >
        <div className="flex flex-col items-center gap-4 px-6 pb-6 text-center">
          <p className="m-0 max-w-[42ch] text-base leading-6 text-[var(--fg-2)]">
            {t('marketingConsent.prompt.body')}
          </p>
          <div className="flex w-full flex-col gap-2">
            <PillButton onClick={() => answer(true)}>
              {t('marketingConsent.prompt.accept')}
            </PillButton>
            <button
              type="button"
              onClick={() => answer(false)}
              className="touch-target w-full border-0 bg-transparent text-sm font-medium text-[var(--fg-3)] transition-[color,transform] duration-[var(--dur-fast)] ease-out hover:text-[var(--fg-1)] active:scale-[0.96]"
            >
              {t('marketingConsent.prompt.decline')}
            </button>
          </div>
        </div>
    </Sheet>) : null
  )
}

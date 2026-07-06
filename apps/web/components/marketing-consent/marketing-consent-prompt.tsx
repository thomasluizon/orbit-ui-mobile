'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useMutation } from '@tanstack/react-query'
import { Mail } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { motionDurations, motionEasings } from '@orbit/shared/theme'
import { MARKETING_CONSENT_MILESTONE_KEY } from '@orbit/shared/stores'
import { AppOverlay } from '@/components/ui/app-overlay'
import { PillButton } from '@/components/ui/pill-button'
import { useUIStore } from '@/stores/ui-store'
import { useReferralPromptStore } from '@/stores/referral-prompt-store'
import { useProfile } from '@/hooks/use-profile'
import { updateMarketingConsent } from '@/app/actions/profile'

const SETTLE_DELAY_MS = 500

function enterTransition(delayMs: number) {
  return {
    duration: motionDurations.base / 1000,
    ease: motionEasings.enter,
    delay: delayMs / 1000,
  }
}

/**
 * One-time LGPD-lawful marketing-email consent nudge. Shows once onboarding is complete, the
 * armed slot holds a consent prompt, and no celebration is in flight — deliberately skipping the
 * shared 14-day cooldown while still recording the prompt so other prompts treat it as recent.
 * The backdrop dismiss leaves consent undecided (null), so it can re-ask; an explicit Yes/No
 * persists the decision and the strict `=== null` arming gate prevents it from ever re-showing.
 */
export function MarketingConsentPrompt() {
  const t = useTranslations()
  const prefersReducedMotion = useReducedMotion()
  const { profile, patchProfile } = useProfile()
  const armedPrompt = useReferralPromptStore((s) => s.armedPrompt)
  const markEngagementPrompted = useReferralPromptStore(
    (s) => s.markEngagementPrompted,
  )
  const celebrationInFlight = useUIStore(
    (s) => s.activeCelebration !== null || s.queuedCelebrations.length > 0,
  )

  const isArmed = armedPrompt?.kind === 'consent'
  const [visible, setVisible] = useState(false)
  const settleTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const mutation = useMutation({
    mutationFn: (enabled: boolean) => updateMarketingConsent({ enabled }),
    onMutate: (enabled) => {
      const previous = profile?.marketingEmailConsent ?? null
      patchProfile({ marketingEmailConsent: enabled })
      return { previous }
    },
    onError: (_error, _enabled, context) => {
      patchProfile({ marketingEmailConsent: context?.previous ?? null })
    },
  })

  useEffect(() => {
    if (visible || !isArmed || celebrationInFlight) return

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
  }, [isArmed, celebrationInFlight, visible, markEngagementPrompted])

  function answer(enabled: boolean) {
    setVisible(false)
    mutation.mutate(enabled)
  }

  return (
    <AppOverlay
      open={visible}
      onOpenChange={(open) => {
        if (!open) setVisible(false)
      }}
      title={t('marketingConsent.prompt.title')}
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
          {t('marketingConsent.prompt.eyebrow')}
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
          <Mail size={30} strokeWidth={1.8} color="var(--primary-soft)" />
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
          {t('marketingConsent.prompt.body')}
        </motion.p>
        <motion.div
          className="flex w-full flex-col"
          style={{ gap: 8, paddingTop: 4 }}
          initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={enterTransition(140)}
        >
          <PillButton fullWidth onClick={() => answer(true)}>
            {t('marketingConsent.prompt.accept')}
          </PillButton>
          <button
            type="button"
            onClick={() => answer(false)}
            className="w-full text-[var(--fg-3)] transition-[color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:text-[var(--fg-1)] active:scale-[0.96]"
            style={{
              padding: '12px 0',
              fontFamily: 'var(--font-sans)',
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            {t('marketingConsent.prompt.decline')}
          </button>
        </motion.div>
      </div>
    </AppOverlay>
  )
}

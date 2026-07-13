'use client'

import type { ReactNode } from 'react'
import type { useTranslations } from 'next-intl'
// react-doctor-disable-next-line use-lazy-motion -- LazyMotion migration is app-wide (needs a shared provider + converting every motion.* incl. components/**); a partial per-file swap yields no bundle benefit and risks unprovided m https://github.com/thomasluizon/orbit-ui-mobile/issues/243
import { AnimatePresence, motion } from 'motion/react'
import type { ResolvedMotionPreset } from '@orbit/shared/theme'
import { AppLogo } from '@/components/ui/app-logo'

type LoginStep = 'email' | 'code'
type Translate = ReturnType<typeof useTranslations>

const subtitleStyle = {
  fontFamily: 'var(--font-sans)',
  fontSize: 15,
  lineHeight: 1.55,
  color: 'var(--fg-2)',
  margin: 0,
} as const

export function LoginHeader({
  step,
  t,
  fromOnboarding = false,
  pendingHabitCount = 0,
}: Readonly<{
  step: LoginStep
  t: Translate
  fromOnboarding?: boolean
  pendingHabitCount?: number
}>) {
  const showPlanSummary = fromOnboarding && step === 'email'
  let title: string
  if (showPlanSummary) {
    title = t('onboarding.flow.saveYourPlan.title')
  } else if (step === 'email') {
    title = t('auth.signIn')
  } else {
    title = t('auth.enterCode')
  }

  return (
    <>
      <div
        className="flex flex-col items-center"
        style={{ gap: 14, paddingBottom: 4 }}
      >
        <div
          className="flex items-center justify-center"
          style={{ animation: 'fresh-start-orb 0.6s var(--ease-out) both' }}
        >
          <AppLogo size={64} />
        </div>
      </div>

      <div className="flex flex-col text-center" style={{ gap: 6 }}>
        <h2
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 28,
            fontWeight: 500,
            letterSpacing: '-0.01em',
            lineHeight: 1.3,
            color: 'var(--fg-1)',
            margin: 0,
          }}
        >
          {title}
        </h2>
        {showPlanSummary ? (
          <>
            <p style={subtitleStyle}>{t('onboarding.flow.saveYourPlan.subtitle')}</p>
            {pendingHabitCount > 0 && (
              <p style={subtitleStyle}>
                {pendingHabitCount === 1
                  ? t('onboarding.flow.saveYourPlan.habitSummaryOne')
                  : t('onboarding.flow.saveYourPlan.habitSummary', {
                      count: pendingHabitCount,
                    })}
              </p>
            )}
          </>
        ) : (
          step === 'email' && (
            <p style={subtitleStyle}>{t('auth.signInSubtitle')}</p>
          )
        )}
      </div>
    </>
  )
}

export function ReferralBanner({
  motionPreset,
  t,
}: Readonly<{ motionPreset: ResolvedMotionPreset; t: Translate }>) {
  return (
    <motion.div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="flex items-center justify-center"
      style={{
        padding: '8px 14px',
        borderTop: '1px solid var(--hairline)',
        borderBottom: '1px solid var(--hairline)',
      }}
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{
        opacity: 1,
        y: 0,
        scale: 1,
        transition: {
          duration: motionPreset.enterDuration / 1000,
          ease: motionPreset.enterEasing,
        },
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          // react-doctor-disable-next-line no-tiny-text -- intentional uppercase mono eyebrow inside the referral status banner (DESIGN.md eyebrow scale), not body text https://github.com/thomasluizon/orbit-ui-mobile/issues/243
          fontSize: 11,
          fontWeight: 500,
          color: 'var(--fg-1)',
          letterSpacing: '0.06em',
        }}
      >
        {t('referral.loginBanner')}
      </span>
    </motion.div>
  )
}

export function LoginStepStage({
  step,
  motionPreset,
  emailStep,
  codeStep,
}: Readonly<{
  step: LoginStep
  motionPreset: ResolvedMotionPreset
  emailStep: ReactNode
  codeStep: ReactNode
}>) {
  return (
    <AnimatePresence initial={false} mode="wait">
      <motion.div
        key={step}
        initial={{
          opacity: 0,
          x: step === 'email' ? -motionPreset.shift : motionPreset.shift,
          scale: motionPreset.scaleFrom,
        }}
        animate={{
          opacity: 1,
          x: 0,
          scale: motionPreset.scaleTo,
          transition: {
            duration: motionPreset.enterDuration / 1000,
            ease: motionPreset.enterEasing,
          },
        }}
        exit={{
          opacity: 0,
          x:
            step === 'email'
              ? motionPreset.shift * 0.4
              : -motionPreset.shift * 0.4,
          scale: 0.99,
          transition: {
            duration: motionPreset.exitDuration / 1000,
            ease: motionPreset.exitEasing,
          },
        }}
      >
        {step === 'email' ? emailStep : codeStep}
      </motion.div>
    </AnimatePresence>
  )
}

export function LoginSuccessMessage({
  message,
  motionPreset,
}: Readonly<{ message: string | null; motionPreset: ResolvedMotionPreset }>) {
  return (
    <AnimatePresence initial={false} mode="popLayout">
      {message ? (
        <motion.div
          key={message}
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="text-center"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            lineHeight: 1.55,
            color: 'var(--fg-2)',
          }}
          initial={{ opacity: 0, y: 8, scale: 0.98 }}
          animate={{
            opacity: 1,
            y: 0,
            scale: 1,
            transition: {
              duration: motionPreset.enterDuration / 1000,
              ease: motionPreset.enterEasing,
            },
          }}
          exit={{
            opacity: 0,
            y: -4,
            scale: 0.99,
            transition: {
              duration: motionPreset.exitDuration / 1000,
              ease: motionPreset.exitEasing,
            },
          }}
        >
          {message}
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

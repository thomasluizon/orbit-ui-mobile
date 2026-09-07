'use client'

import type { ReactNode } from 'react'
import type { useTranslations } from 'next-intl'
import { AnimatePresence, motion } from 'motion/react'
import type { ResolvedMotionPreset } from '@orbit/shared/theme'
import { WifiOff } from '@/components/ui/icons'

type Translate = ReturnType<typeof useTranslations>

export function LoginHeader({ step, t, fromOnboarding = false, pendingHabitCount = 0 }: Readonly<{
  step: 'email' | 'code'; t: Translate; fromOnboarding?: boolean; pendingHabitCount?: number
}>) {
  const onboarding = fromOnboarding && step === 'email'
  const title = onboarding ? t('auth.onboarding.title') : t(step === 'email' ? 'auth.emailTitle' : 'auth.enterCode')
  return (
    <div className="flex flex-col gap-2">
      <h1 className="font-display text-[22px] font-medium leading-[1.2] tracking-[-0.02em] text-[var(--fg-1)]">{title}</h1>
      {onboarding && <>
        <p className="text-base leading-normal text-[var(--fg-2)]">{t('auth.onboarding.subtitle')}</p>
        <p className="font-mono text-xs text-[var(--fg-3)]" data-mock>
          {pendingHabitCount === 1 ? t('auth.onboarding.habitOne') : t('auth.onboarding.habits', { count: pendingHabitCount })}
        </p>
      </>}
    </div>
  )
}

export function ReferralBanner({ t }: Readonly<{ t: Translate }>) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-2">
      <span aria-hidden className="h-px bg-[var(--hairline)]" />
      <p className="font-mono text-xs uppercase leading-[1.6] tracking-[0.06em] text-[var(--fg-3)]">{t('referral.loginBanner')}</p>
      <span aria-hidden className="h-px bg-[var(--hairline)]" />
    </div>
  )
}

export function LoginOfflineNotice({ t }: Readonly<{ t: Translate }>) {
  return (
    <div role="status" className="flex items-center gap-3 rounded-[var(--r-well)] bg-[var(--bg-well)] p-3" data-offline-notice>
      <WifiOff size={20} aria-hidden className="shrink-0 text-[var(--fg-4)]" />
      <p className="text-sm leading-normal text-[var(--fg-2)]">{t('auth.errors.offline')}</p>
    </div>
  )
}

export function LoginStepStage({ step, motionPreset, children }: Readonly<{
  step: string; motionPreset: ResolvedMotionPreset; children: ReactNode
}>) {
  const reduced = motionPreset.reducedMotionEnabled
  return (
    <AnimatePresence initial={false} mode="wait">
      <motion.div key={step}
        initial={{ opacity: reduced ? 1 : 0, x: reduced ? 0 : step === 'email' ? -12 : 12 }}
        animate={{ opacity: 1, x: 0, transition: { duration: reduced ? 0 : 0.11, ease: motionPreset.enterEasing } }}
        exit={{ opacity: reduced ? 1 : 0, x: reduced ? 0 : step === 'email' ? -12 : 12,
          transition: { duration: reduced ? 0 : 0.11, ease: motionPreset.exitEasing } }}
      >{children}</motion.div>
    </AnimatePresence>
  )
}

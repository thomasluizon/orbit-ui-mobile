'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  getOnboardingDisplayStep,
  getOnboardingDisplayTotal,
  getOnboardingNextStep,
  getOnboardingPreviousStep,
  ONBOARDING_COMPLETE_STEP,
  ONBOARDING_CREATE_HABIT_STEP,
  shouldHideOnboardingFooter,
} from '@orbit/shared/utils'
import {
  useOnboardingActions,
  useOnboardingIsLive,
} from './onboarding-actions-context'
import { Pager } from '@/components/ui/pager'
import { QuietLink } from '@/components/ui/quiet-link'
import { OnboardingWelcome } from './onboarding-welcome'
import { OnboardingCreateHabit } from './onboarding-create-habit'
import { OnboardingComplete } from './onboarding-complete'

export function OnboardingFlow() {
  const t = useTranslations()
  const router = useRouter()
  const actions = useOnboardingActions()
  const isLive = useOnboardingIsLive()

  const [sharedStep, setSharedStep] = useState(0)
  const [createdHabitTitle, setCreatedHabitTitle] = useState('')
  const [mounted, setMounted] = useState(false)

  if ('document' in globalThis && !mounted) {
    setMounted(true)
  }

  const displayTotal = getOnboardingDisplayTotal()
  const displayStep = getOnboardingDisplayStep(sharedStep)

  const hasPrev = sharedStep > 0
  const canAdvance = sharedStep !== ONBOARDING_COMPLETE_STEP

  const goNext = useCallback(() => {
    setSharedStep((step) => getOnboardingNextStep(step))
  }, [])

  const goPrev = useCallback(() => {
    setSharedStep((step) => getOnboardingPreviousStep(step))
  }, [])

  function handleHabitCreated(_habitId: string, title: string) {
    setCreatedHabitTitle(title)
    goNext()
  }

  function handleFinish() {
    void actions.finishOnboarding()
  }

  function handleSkip() {
    setSharedStep(ONBOARDING_COMPLETE_STEP)
  }

  const hideFooter = shouldHideOnboardingFooter(sharedStep)

  const stepContent = (() => {
    switch (sharedStep) {
      case 0:
        return (
          <OnboardingWelcome
            key="welcome"
            onHaveAccount={!isLive ? () => router.push('/login') : undefined}
          />
        )
      case ONBOARDING_CREATE_HABIT_STEP:
        return <OnboardingCreateHabit key="create-habit" onCreated={handleHabitCreated} />
      case ONBOARDING_COMPLETE_STEP:
        return (
          <OnboardingComplete
            key="complete"
            createdHabit={createdHabitTitle}
            finishLabel={!isLive ? t('onboarding.flow.saveYourPlan.cta') : undefined}
            onFinish={handleFinish}
          />
        )
      default:
        return null
    }
  })()

  const overlayRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!mounted) return
    const el = overlayRef.current
    if (!el) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab') return
      const focusable = el!.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return
      const first = focusable[0] ?? null
      const last = focusable[focusable.length - 1] ?? null
        if (e.shiftKey) {
          if (document.activeElement === first && last) {
            e.preventDefault()
            last.focus()
          }
        } else if (document.activeElement === last && first) {
          e.preventDefault()
          first.focus()
        }
      }

    el.addEventListener('keydown', handleKeyDown)
    const firstFocusable = el.querySelector<HTMLElement>('button, [href], input')
    firstFocusable?.focus()

    return () => el.removeEventListener('keydown', handleKeyDown)
  }, [mounted, sharedStep])

  if (!mounted) return null

  const isFinalStep = sharedStep === ONBOARDING_COMPLETE_STEP
  const isStarter = sharedStep === 0

  const overlay = (
    // react-doctor-disable-next-line prefer-html-dialog -- full-screen onboarding takeover with its own focus/escape management via overlayRef; native <dialog>'s modal backdrop and sizing do not fit a full-viewport flow; https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    <div
      ref={overlayRef}
      role="dialog"
      className="fixed inset-0 z-[60] m-0 h-dvh w-screen overflow-y-auto"
      style={{ background: 'var(--bg)' }}
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="flex flex-col min-h-dvh relative">
        <div
          className="relative z-[1] flex items-center justify-between"
          style={{ padding: '8px 20px', minHeight: 56 }}
        >
          <span
            id="onboarding-title"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              fontWeight: 500,
              color: 'var(--fg-3)',
              letterSpacing: '0.04em',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            Orbit ·{' '}
            <span style={{ color: 'var(--fg-1)' }}>
              {String(displayStep).padStart(2, '0')}
            </span>{' '}
            / {String(displayTotal).padStart(2, '0')}
          </span>
          {!isFinalStep && (
            <QuietLink onClick={handleSkip}>{t('onboarding.flow.skip')}</QuietLink>
          )}
        </div>

        <div
          className="relative z-[1] flex-1 min-h-0 overflow-y-auto flex flex-col"
          style={{ padding: '12px 28px' }}
        >
          <div
            key={`step-${sharedStep}`}
            className="w-full max-w-sm mx-auto my-auto"
          >
            {stepContent}
          </div>
        </div>

        {!hideFooter && (
          <div
            className="relative z-[1] flex flex-col items-center"
            style={{ padding: '12px 24px 24px', gap: 24 }}
          >
            <div className="w-full">
              <Pager index={displayStep - 1} count={displayTotal}
                label={t('onboarding.flow.step', { current: displayStep, total: displayTotal })}
                backLabel={t('onboarding.flow.back')} onBack={hasPrev ? goPrev : undefined}
                forwardLabel={isStarter ? t('onboarding.flow.begin') : t('onboarding.flow.next')}
                onForward={canAdvance ? goNext : undefined} />
            </div>
          </div>
        )}
      </div>
    </div>
  )

  return createPortal(overlay, document.body)
}

'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  getOnboardingDisplayStep,
  getOnboardingDisplayTotal,
  getOnboardingNextStep,
  getOnboardingPreviousStep,
  ONBOARDING_COMPLETE_HABIT_STEP,
  ONBOARDING_COMPLETE_STEP,
  ONBOARDING_CREATE_HABIT_STEP,
  shouldHideOnboardingFooter,
} from '@orbit/shared/utils'
import {
  useOnboardingActions,
  useOnboardingHasProAccess,
  useOnboardingIsLive,
} from './onboarding-actions-context'
import { PillButton } from '@/components/ui/pill-button'
import { QuietLink } from '@/components/ui/quiet-link'
import { OnboardingWelcome } from './onboarding-welcome'
import { OnboardingMeetAstra } from './onboarding-meet-astra'
import { OnboardingCreateHabit } from './onboarding-create-habit'
import { OnboardingCompleteHabit } from './onboarding-complete-habit'
import { OnboardingCreateGoal } from './onboarding-create-goal'
import { OnboardingFeatures } from './onboarding-features'
import { OnboardingComplete } from './onboarding-complete'
import { OnboardingTemplatePacks } from './onboarding-template-packs'

const WEB_ASTRA_OFFSET = 1

export function OnboardingFlow() {
  const t = useTranslations()
  const router = useRouter()
  const actions = useOnboardingActions()
  const hasProAccess = useOnboardingHasProAccess()
  const isLive = useOnboardingIsLive()

  const [sharedStep, setSharedStep] = useState(0)
  const [astraStepShown, setAstraStepShown] = useState(false)
  const [createdHabitId, setCreatedHabitId] = useState<string | null>(null)
  const [createdHabitTitle, setCreatedHabitTitle] = useState('')
  const [createdGoal, setCreatedGoal] = useState(false)
  const [stepDirection, setStepDirection] = useState<'forward' | 'back'>('forward')
  const [mounted, setMounted] = useState(false)

  if ('document' in globalThis && !mounted) {
    setMounted(true)
  }

  const sharedDisplayTotal = getOnboardingDisplayTotal(hasProAccess)
  const displayTotal = sharedDisplayTotal + WEB_ASTRA_OFFSET
  const [viewingAstra, setViewingAstra] = useState(false)
  const displayStep = useMemo(() => {
    const sharedDisplay = getOnboardingDisplayStep(sharedStep, hasProAccess)
    if (viewingAstra) return 2
    if (astraStepShown) return sharedDisplay + WEB_ASTRA_OFFSET
    return sharedDisplay
  }, [sharedStep, hasProAccess, viewingAstra, astraStepShown])

  const hasPrev = sharedStep > 0 || viewingAstra
  const canAdvance = sharedStep !== ONBOARDING_COMPLETE_STEP

  const goNext = useCallback(() => {
    setStepDirection('forward')
    if (sharedStep === 0 && !astraStepShown) {
      setViewingAstra(true)
      setAstraStepShown(true)
      return
    }
    if (viewingAstra) {
      setViewingAstra(false)
      setSharedStep((s) => getOnboardingNextStep(s, hasProAccess))
      return
    }
    setSharedStep((s) => getOnboardingNextStep(s, hasProAccess))
  }, [sharedStep, astraStepShown, viewingAstra, hasProAccess])

  const goPrev = useCallback(() => {
    setStepDirection('back')
    if (viewingAstra) {
      setViewingAstra(false)
      return
    }
    if (sharedStep === 1 && astraStepShown) {
      setViewingAstra(true)
      setSharedStep(0)
      return
    }
    setSharedStep((s) => getOnboardingPreviousStep(s, hasProAccess))
  }, [sharedStep, astraStepShown, viewingAstra, hasProAccess])

  function handleHabitCreated(habitId: string, title: string) {
    setCreatedHabitId(habitId)
    setCreatedHabitTitle(title)
    goNext()
  }

  function handleHabitCompleted() {
    goNext()
  }

  function handleGoalCreated() {
    setCreatedGoal(true)
    goNext()
  }

  function handleGoalSkipped() {
    goNext()
  }

  function advancePastHabitSteps() {
    setStepDirection('forward')
    setSharedStep(getOnboardingNextStep(ONBOARDING_COMPLETE_HABIT_STEP, hasProAccess))
  }

  function handleCreateOwnInstead() {
    setStepDirection('forward')
    setSharedStep(ONBOARDING_CREATE_HABIT_STEP)
  }

  function handleFinish() {
    void actions.finishOnboarding()
  }

  function handleSkip() {
    setStepDirection('forward')
    setViewingAstra(false)
    setSharedStep(ONBOARDING_COMPLETE_STEP)
  }

  const hideFooter = !viewingAstra && shouldHideOnboardingFooter(sharedStep)

  const stepContent = (() => {
    if (viewingAstra) return <OnboardingMeetAstra key="meet-astra" onImport={actions.onImport} />
    switch (sharedStep) {
      case 0:
        return (
          <OnboardingWelcome
            key="welcome"
            hasProAccess={hasProAccess}
            onHaveAccount={!isLive ? () => router.push('/login') : undefined}
          />
        )
      case 1:
        return (
          <OnboardingTemplatePacks
            key="template-packs"
            onCreated={advancePastHabitSteps}
            onCreateOwn={handleCreateOwnInstead}
            onSkip={advancePastHabitSteps}
          />
        )
      case 2:
        return <OnboardingCreateHabit key="create-habit" onCreated={handleHabitCreated} />
      case 3:
        return (
          <OnboardingCompleteHabit
            key="complete-habit"
            habitId={createdHabitId}
            habitTitle={createdHabitTitle}
            onCompleted={handleHabitCompleted}
          />
        )
      case 4:
        return (
          <OnboardingCreateGoal
            key="create-goal"
            onCreated={handleGoalCreated}
            onSkip={handleGoalSkipped}
          />
        )
      case 5:
        return <OnboardingFeatures key="features" />
      case 6:
        return (
          <OnboardingComplete
            key="complete"
            createdHabit={createdHabitTitle}
            createdGoal={createdGoal}
            hasProAccess={hasProAccess}
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
  }, [mounted, sharedStep, viewingAstra])

  if (!mounted) return null

  const isFinalStep = sharedStep === ONBOARDING_COMPLETE_STEP
  const isStarter = sharedStep === 0 && !viewingAstra && !astraStepShown

  const overlay = (
    // react-doctor-disable-next-line prefer-html-dialog -- full-screen onboarding takeover with its own focus/escape management via overlayRef; native <dialog>'s modal backdrop and sizing do not fit a full-viewport flow; https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    <div
      ref={overlayRef}
      role="dialog"
      className="fixed inset-0 z-modal m-0 h-dvh w-screen overflow-y-auto"
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
            key={viewingAstra ? 'astra' : `step-${sharedStep}`}
            className={`w-full max-w-sm mx-auto my-auto ${
              stepDirection === 'forward' ? 'animate-slide-date-right' : 'animate-slide-date-left'
            }`}
          >
            {stepContent}
          </div>
        </div>

        {!hideFooter && (
          <div
            className="relative z-[1] flex flex-col items-center"
            style={{ padding: '12px 28px 24px', gap: 22 }}
          >
            <ProgressDots active={displayStep - 1} total={displayTotal} />
            <progress
              className="sr-only"
              value={displayStep}
              max={displayTotal}
            >
              {t('onboarding.flow.step', { current: displayStep, total: displayTotal })}
            </progress>
            <div className="flex w-full items-center" style={{ gap: 4 }}>
              <div className="flex flex-1 justify-start">
                {hasPrev && (
                  <QuietLink onClick={goPrev}>{t('onboarding.flow.back')}</QuietLink>
                )}
              </div>
              <div className="flex flex-[2] justify-center">
                {canAdvance && (
                  <PillButton onClick={goNext}>
                    {isStarter ? t('onboarding.flow.begin') : t('onboarding.flow.next')}
                  </PillButton>
                )}
              </div>
              <div className="flex-1" aria-hidden="true" />
            </div>
          </div>
        )}
      </div>
    </div>
  )

  return createPortal(overlay, document.body)
}

interface ProgressDotsProps {
  active: number
  total: number
}

function ProgressDots({ active, total }: Readonly<ProgressDotsProps>) {
  return (
    <div aria-hidden="true" className="flex items-center" style={{ gap: 8 }}>
      {Array.from({ length: total }, (_, i) => `progress-dot-${i}`).map((dotKey, i) => (
        <span
          key={dotKey}
          className="transition-[transform,background-color] duration-[var(--dur-base)] ease-[var(--ease-standard)]"
          style={{
            width: 24,
            height: 7,
            borderRadius: 999,
            transformOrigin: 'left center',
            transform: i === active ? 'scaleX(1)' : 'scaleX(0.2917)',
            background:
              i === active
                ? 'var(--primary)'
                : 'color-mix(in srgb, var(--fg-1) 18%, transparent)',
          }}
        />
      ))}
    </div>
  )
}

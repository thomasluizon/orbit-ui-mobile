'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useQueryClient } from '@tanstack/react-query'
import {
  getOnboardingDisplayStep,
  getOnboardingDisplayTotal,
  getOnboardingNextStep,
  getOnboardingPreviousStep,
  ONBOARDING_COMPLETE_STEP,
  shouldHideOnboardingFooter,
} from '@orbit/shared/utils'
import { profileKeys } from '@orbit/shared/query'
import type { Profile } from '@orbit/shared/types/profile'
import { useHasProAccess } from '@/hooks/use-profile'
import { completeOnboarding } from '@/app/actions/profile'
import { GradientTop } from '@/components/ui/gradient-top'
import { PillButton } from '@/components/ui/pill-button'
import { OnboardingWelcome } from './onboarding-welcome'
import { OnboardingMeetAstra } from './onboarding-meet-astra'
import { OnboardingCreateHabit } from './onboarding-create-habit'
import { OnboardingCompleteHabit } from './onboarding-complete-habit'
import { OnboardingCreateGoal } from './onboarding-create-goal'
import { OnboardingFeatures } from './onboarding-features'
import { OnboardingComplete } from './onboarding-complete'

const WEB_ASTRA_OFFSET = 1

export function OnboardingFlow() {
  const t = useTranslations()
  const router = useRouter()
  const queryClient = useQueryClient()
  const hasProAccess = useHasProAccess()

  const [sharedStep, setSharedStep] = useState(0)
  const [astraStepShown, setAstraStepShown] = useState(false)
  const [createdHabitId, setCreatedHabitId] = useState<string | null>(null)
  const [createdHabitTitle, setCreatedHabitTitle] = useState('')
  const [createdGoal, setCreatedGoal] = useState(false)
  const [stepDirection, setStepDirection] = useState<'forward' | 'back'>('forward')
  const [mounted, setMounted] = useState(false)

  if (typeof globalThis !== 'undefined' && typeof globalThis.document !== 'undefined' && !mounted) {
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

  async function handleFinish() {
    try {
      await completeOnboarding()
    } catch {
    }
    queryClient.setQueryData<Profile>(profileKeys.detail(), (old) =>
      old ? { ...old, hasCompletedOnboarding: true } : old,
    )
    router.push('/')
  }

  function handleSkip() {
    setStepDirection('forward')
    setViewingAstra(false)
    setSharedStep(ONBOARDING_COMPLETE_STEP)
  }

  const hideFooter = !viewingAstra && shouldHideOnboardingFooter(sharedStep)

  const stepContent = (() => {
    if (viewingAstra) return <OnboardingMeetAstra key="meet-astra" />
    switch (sharedStep) {
      case 0:
        return <OnboardingWelcome key="welcome" />
      case 1:
        return <OnboardingCreateHabit key="create-habit" onCreated={handleHabitCreated} />
      case 2:
        return (
          <OnboardingCompleteHabit
            key="complete-habit"
            habitId={createdHabitId}
            habitTitle={createdHabitTitle}
            onCompleted={handleHabitCompleted}
          />
        )
      case 3:
        return (
          <OnboardingCreateGoal
            key="create-goal"
            onCreated={handleGoalCreated}
            onSkip={handleGoalSkipped}
          />
        )
      case 4:
        return <OnboardingFeatures key="features" />
      case 5:
        return (
          <OnboardingComplete
            key="complete"
            createdHabit={createdHabitTitle}
            createdGoal={createdGoal}
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

  const progressLabel = `Orbit · ${String(displayStep).padStart(2, '0')} / ${String(displayTotal).padStart(2, '0')}`

  const isFinalStep = sharedStep === ONBOARDING_COMPLETE_STEP
  const isStarter = sharedStep === 0 && !viewingAstra && !astraStepShown

  const overlay = (
    <div
      ref={overlayRef}
      role="dialog"
      className="fixed inset-0 z-[60] m-0 h-dvh w-screen overflow-y-auto"
      style={{ background: 'var(--bg)' }}
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="flex flex-col min-h-dvh relative">
        <GradientTop height={520} />
        <div
          className="relative z-[1] flex items-center justify-between"
          style={{ padding: '8px 20px', minHeight: 56 }}
        >
          <span
            id="onboarding-title"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              fontWeight: 500,
              color: 'var(--fg-3)',
              letterSpacing: '0.04em',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {progressLabel}
          </span>
          {!isFinalStep && (
            <button
              type="button"
              className="inline-flex appearance-none items-center border-0 bg-transparent cursor-pointer transition-[color] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:text-[var(--fg-1)]"
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 13,
                color: 'var(--fg-3)',
                minHeight: 44,
                padding: '0 4px',
              }}
              onClick={handleSkip}
            >
              {t('onboarding.flow.skip')}
            </button>
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
            <div className="flex w-full flex-col items-center" style={{ gap: 4 }}>
              {canAdvance && (
                <PillButton fullWidth onClick={goNext}>
                  {isStarter ? t('onboarding.flow.begin') : t('onboarding.flow.next')}
                </PillButton>
              )}
              {hasPrev && (
                <button
                  type="button"
                  className="inline-flex appearance-none items-center justify-center border-0 bg-transparent cursor-pointer transition-[color] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:text-[var(--fg-1)]"
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 13,
                    color: 'var(--fg-3)',
                    minHeight: 44,
                    padding: '0 12px',
                  }}
                  onClick={goPrev}
                >
                  {t('onboarding.flow.back')}
                </button>
              )}
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
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={`progress-dot-${i}`}
          className="transition-[width,background-color] duration-[var(--dur-base)] ease-[var(--ease-standard)]"
          style={{
            width: i === active ? 24 : 7,
            height: 7,
            borderRadius: 999,
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

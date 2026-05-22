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
import { OnboardingWelcome } from './onboarding-welcome'
import { OnboardingMeetAstra } from './onboarding-meet-astra'
import { OnboardingCreateHabit } from './onboarding-create-habit'
import { OnboardingCompleteHabit } from './onboarding-complete-habit'
import { OnboardingCreateGoal } from './onboarding-create-goal'
import { OnboardingFeatures } from './onboarding-features'
import { OnboardingComplete } from './onboarding-complete'

// v8 inserts a "Meet Astra" step between Welcome and Create Habit on web only
// (mobile parity follows separately). We track the visual step locally without
// touching the shared step constants -- web shows N+1 steps where N is the
// shared total. The Meet Astra step is a passive screen with no functional
// side effects.
const WEB_ASTRA_OFFSET = 1

export function OnboardingFlow() {
  const t = useTranslations()
  const router = useRouter()
  const queryClient = useQueryClient()
  const hasProAccess = useHasProAccess()

  // sharedStep is the value drawn from `@orbit/shared/utils` (0-5). It maps to
  // the functional flow: welcome, createHabit, completeHabit, createGoal,
  // features, complete. The Astra interstitial is a web-only insertion that
  // sits "between" sharedStep 0 and sharedStep 1 without changing the shared
  // constants. astraStepShown becomes true when the user passes the Astra step.
  const [sharedStep, setSharedStep] = useState(0)
  const [astraStepShown, setAstraStepShown] = useState(false)
  const [createdHabitId, setCreatedHabitId] = useState<string | null>(null)
  const [createdHabitTitle, setCreatedHabitTitle] = useState('')
  const [createdGoal, setCreatedGoal] = useState(false)
  const [mounted, setMounted] = useState(false)

  // SSR guard
  if (typeof globalThis !== 'undefined' && typeof globalThis.document !== 'undefined' && !mounted) { // NOSONAR - SSR guard
    setMounted(true)
  }

  const sharedDisplayTotal = getOnboardingDisplayTotal(hasProAccess)
  // Web adds the Astra step on top of the shared total.
  const displayTotal = sharedDisplayTotal + WEB_ASTRA_OFFSET
  // viewStep: true when on the Astra interstitial; otherwise we're on a shared
  // step. The progress indicator uses (shared display step + offset_if_passed).
  const onAstraStep = sharedStep === 0 && astraStepShown === false && createdHabitTitle === ''
  // We deliberately drive the Astra view via a parallel boolean so progressing
  // back lands cleanly on Welcome.
  const [viewingAstra, setViewingAstra] = useState(false)
  const displayStep = useMemo(() => {
    const sharedDisplay = getOnboardingDisplayStep(sharedStep, hasProAccess)
    if (viewingAstra) return 2 // Astra is step 2 in the v8 spec (Welcome=1)
    // After Astra is shown, every subsequent shared step shifts by +1.
    if (astraStepShown) return sharedDisplay + WEB_ASTRA_OFFSET
    return sharedDisplay
  }, [sharedStep, hasProAccess, viewingAstra, astraStepShown])

  const hasPrev = sharedStep > 0 || viewingAstra
  const canAdvance = sharedStep !== ONBOARDING_COMPLETE_STEP

  const goNext = useCallback(() => {
    if (sharedStep === 0 && !astraStepShown) {
      // Welcome -> Astra interstitial
      setViewingAstra(true)
      setAstraStepShown(true)
      return
    }
    if (viewingAstra) {
      // Astra -> CreateHabit
      setViewingAstra(false)
      setSharedStep((s) => getOnboardingNextStep(s, hasProAccess))
      return
    }
    setSharedStep((s) => getOnboardingNextStep(s, hasProAccess))
  }, [sharedStep, astraStepShown, viewingAstra, hasProAccess])

  const goPrev = useCallback(() => {
    if (viewingAstra) {
      // Astra -> Welcome
      setViewingAstra(false)
      return
    }
    if (sharedStep === 1 && astraStepShown) {
      // CreateHabit -> Astra
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
      // Ignore -- user should proceed regardless
    }
    queryClient.setQueryData<Profile>(profileKeys.detail(), (old) =>
      old ? { ...old, hasCompletedOnboarding: true } : old,
    )
    router.push('/')
  }

  function handleSkip() {
    setViewingAstra(false)
    setSharedStep(ONBOARDING_COMPLETE_STEP)
  }

  // Interactive steps that hide the footer nav (Astra step keeps the footer).
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

  // Focus trap
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
    // Focus first focusable element
    const firstFocusable = el.querySelector<HTMLElement>('button, [href], input')
    firstFocusable?.focus()

    return () => el.removeEventListener('keydown', handleKeyDown)
  }, [mounted, sharedStep, viewingAstra])

  if (!mounted) return null

  // Mono progress label: "Orbit · 01 / 07" -- matches v8 spec.
  const progressLabel = `Orbit · ${String(displayStep).padStart(2, '0')} / ${String(displayTotal).padStart(2, '0')}`

  const isFinalStep = sharedStep === ONBOARDING_COMPLETE_STEP
  const isStarter = sharedStep === 0 && !viewingAstra && !astraStepShown

  const overlay = (
    <div
      ref={overlayRef}
      role="dialog"
      className="fixed inset-0 z-[60] m-0 h-dvh w-screen overflow-y-auto"
      style={{ background: 'var(--bg-base)' }}
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="flex flex-col min-h-dvh relative">
        {/* Header: mono progress label + Skip */}
        <div
          className="flex items-center justify-between"
          style={{ padding: '16px 20px' }}
        >
          <span
            id="onboarding-title"
            style={{
              fontFamily: 'var(--font-family-mono)',
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
              className="appearance-none border-0 bg-transparent cursor-pointer"
              style={{
                fontFamily: 'var(--font-family-sans)',
                fontSize: 13,
                color: 'var(--fg-3)',
                padding: 0,
              }}
              onClick={handleSkip}
            >
              {t('onboarding.flow.skip')}
            </button>
          )}
        </div>

        {/* Step content (scrollable) */}
        <div
          className="flex-1 min-h-0 overflow-y-auto"
          style={{ padding: '0 28px' }}
        >
          <div className="w-full max-w-sm mx-auto">
            {stepContent}
          </div>
        </div>

        {/* Footer: progress dots + Back / Continue */}
        {!hideFooter && (
          <div
            className="flex flex-col items-center"
            style={{ padding: '12px 22px 22px', gap: 14 }}
          >
            <ProgressDots active={displayStep - 1} total={displayTotal} />
            <progress
              className="sr-only"
              value={displayStep}
              max={displayTotal}
            >
              {t('onboarding.flow.step', { current: displayStep, total: displayTotal })}
            </progress>
            <div
              className="flex items-center justify-between w-full"
              style={{ gap: 12 }}
            >
              <div className="flex-1 flex justify-start">
                {hasPrev && (
                  <button
                    type="button"
                    className="appearance-none border-0 bg-transparent cursor-pointer"
                    style={{
                      fontFamily: 'var(--font-family-sans)',
                      fontSize: 13,
                      color: 'var(--fg-3)',
                      padding: 6,
                    }}
                    onClick={goPrev}
                  >
                    {t('onboarding.flow.back')}
                  </button>
                )}
              </div>
              <div className="flex-[2]">
                {canAdvance && (
                  <button
                    type="button"
                    className="w-full appearance-none border-0 cursor-pointer"
                    style={{
                      padding: '10px 18px',
                      background: 'var(--primary)',
                      color: 'var(--fg-on-primary)',
                      borderRadius: 10,
                      fontFamily: 'var(--font-family-sans)',
                      fontSize: 14,
                      fontWeight: 600,
                    }}
                    onClick={goNext}
                  >
                    {isStarter ? t('onboarding.flow.begin') : t('onboarding.flow.next')}
                  </button>
                )}
              </div>
              <div className="flex-1" />
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
    <div aria-hidden="true" className="flex items-center" style={{ gap: 6 }}>
      {Array.from({ length: total }).map((_, i) => (
        <span
          // NOSONAR -- index is the dot identity (fixed-length array, never reorders)
          key={`progress-dot-${i}`}
          style={{
            width: 5,
            height: 5,
            borderRadius: 999,
            background: i <= active ? 'var(--primary)' : 'var(--hairline-strong)',
            transition: 'background 200ms ease',
          }}
        />
      ))}
    </div>
  )
}

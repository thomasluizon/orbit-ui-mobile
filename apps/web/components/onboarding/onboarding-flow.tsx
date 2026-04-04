'use client'

import { useState, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { usePortalContainer } from '@/hooks/use-portal-container'
import { useQueryClient } from '@tanstack/react-query'
import { profileKeys } from '@orbit/shared/query'
import type { Profile } from '@orbit/shared/types/profile'
import { useHasProAccess } from '@/hooks/use-profile'
import { completeOnboarding } from '@/app/actions/profile'
import { OnboardingWelcome } from './onboarding-welcome'
import { OnboardingCreateHabit } from './onboarding-create-habit'
import { OnboardingCompleteHabit } from './onboarding-complete-habit'
import { OnboardingCreateGoal } from './onboarding-create-goal'
import { OnboardingFeatures } from './onboarding-features'
import { OnboardingComplete } from './onboarding-complete'

const TOTAL_STEPS = 6

export function OnboardingFlow() {
  const t = useTranslations()
  const portalContainer = usePortalContainer('onboarding-flow')
  const router = useRouter()
  const queryClient = useQueryClient()
  const hasProAccess = useHasProAccess()

  const [currentStep, setCurrentStep] = useState(0)
  const [createdHabitId, setCreatedHabitId] = useState<string | null>(null)
  const [createdHabitTitle, setCreatedHabitTitle] = useState('')
  const [createdGoal, setCreatedGoal] = useState(false)
  const [transitionDirection, setTransitionDirection] = useState<'forward' | 'back'>('forward')
  const [mounted, setMounted] = useState(false)

  // SSR guard
  if (typeof window !== 'undefined' && !mounted) {
    setMounted(true)
  }

  // Display computeds: adjust step counter when goals step is skipped for free users
  const displayTotal = hasProAccess ? 6 : 5
  const displayStep = useMemo(() => {
    const raw = currentStep + 1
    if (!hasProAccess && currentStep >= 4) return raw - 1
    return raw
  }, [currentStep, hasProAccess])

  const hasPrev = currentStep > 0
  const canAdvance = currentStep !== 5 // last step has its own CTA

  const goNext = useCallback(() => {
    if (currentStep < TOTAL_STEPS - 1) {
      setTransitionDirection('forward')
      let next = currentStep + 1
      // Skip goal step for free users
      if (next === 3 && !hasProAccess) {
        next++
      }
      setCurrentStep(next)
    }
  }, [currentStep, hasProAccess])

  const goPrev = useCallback(() => {
    if (currentStep > 0) {
      setTransitionDirection('back')
      let prev = currentStep - 1
      // Skip goal step for free users
      if (prev === 3 && !hasProAccess) {
        prev--
      }
      setCurrentStep(prev)
    }
  }, [currentStep, hasProAccess])

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
      // Intentionally ignoring onboarding completion errors -- user should proceed
      // regardless. Set flag locally so user is never stuck re-seeing onboarding.
      queryClient.setQueryData<Profile>(profileKeys.detail(), (old) =>
        old ? { ...old, hasCompletedOnboarding: true } : old,
      )
    }
    router.push('/')
  }

  function handleSkip() {
    // Jump to the complete step so trial info is shown
    setTransitionDirection('forward')
    setCurrentStep(5)
  }

  // Interactive steps that hide the footer nav
  const hideFooter = currentStep === 5 || currentStep === 1 || currentStep === 2 || currentStep === 3

  const stepContent = (() => {
    switch (currentStep) {
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

  if (!mounted) return null

  const overlay = (
    <div className="fixed inset-0 z-[60] bg-background">
      <div className="flex flex-col min-h-dvh bg-background relative">
        {/* Ambient glow */}
        <div
          className="pointer-events-none absolute inset-0 z-0"
          style={{ background: 'radial-gradient(ellipse at center 30%, rgba(var(--primary-shadow), 0.06), transparent 70%)' }}
        />

        {/* Header */}
        <div className="relative z-10 flex items-center justify-between px-6 pt-6 pb-4">
          <span className="text-xs text-text-secondary font-medium">
            {t('onboarding.flow.step', { current: displayStep, total: displayTotal })}
          </span>
          <button
            className="text-sm text-text-secondary hover:text-text-primary transition-colors font-medium"
            onClick={handleSkip}
          >
            {t('onboarding.flow.skip')}
          </button>
        </div>

        {/* Progress bar */}
        <div className="relative z-10 px-6 mb-8">
          <progress className="sr-only" value={displayStep} max={displayTotal}>
            {t('onboarding.flow.step', { current: displayStep, total: displayTotal })}
          </progress>
          <div className="h-0.5 rounded-full bg-white/[0.08]" aria-hidden="true">
            <div
              className="h-0.5 rounded-full bg-primary transition-all duration-500"
              style={{
                width: `${(displayStep / displayTotal) * 100}%`,
                boxShadow: '0 0 8px rgba(var(--primary-shadow), 0.3)',
              }}
            />
          </div>
        </div>

        {/* Step content */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 pb-8 overflow-y-auto">
          <div className="w-full max-w-sm">
            {stepContent}
          </div>
        </div>

        {/* Footer navigation */}
        {!hideFooter && (
          <div className="relative z-10 px-6 pb-10 flex items-center justify-between gap-4">
            {hasPrev ? (
              <button
                className="text-text-secondary hover:text-text-primary transition-colors font-medium text-sm px-4 py-2"
                onClick={goPrev}
              >
                {t('onboarding.flow.back')}
              </button>
            ) : (
              <div className="flex-1" />
            )}

            {canAdvance && (
              <button
                className="px-6 py-2.5 bg-primary text-white font-semibold text-sm rounded-[var(--radius-xl)] hover:bg-primary/90 transition-all"
                onClick={goNext}
              >
                {t('onboarding.flow.next')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )

  return portalContainer ? createPortal(overlay, portalContainer) : null
}

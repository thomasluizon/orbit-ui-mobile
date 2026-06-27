'use client'

import { useCallback } from 'react'
import { useTourStore } from '@/stores/tour-store'
import { TourSpotlight } from './tour-spotlight'
import { TourTooltip } from './tour-tooltip'
import { completeTour } from '@/app/actions/profile'
import { useQueryClient } from '@tanstack/react-query'
import { profileKeys } from '@orbit/shared/query'
import type { Profile } from '@orbit/shared/types'
import { COACH_MARK_SECTIONS } from '@orbit/shared/types'
import { useOverlayEscape } from '@/hooks/use-overlay-escape'

/**
 * Composes TourSpotlight + TourTooltip.
 * Only renders when the tour is active and not navigating.
 */
export function TourOverlay() {
  const store = useTourStore()
  const queryClient = useQueryClient()

  const {
    isActive,
    isNavigating,
    targetRect,
    getCurrentStep,
    getSectionProgress,
    getTotalSteps,
    currentStepIndex,
    nextStep,
    prevStep,
    endTour,
  } = store

  const step = getCurrentStep()
  const sectionProgress = getSectionProgress()
  const totalSteps = getTotalSteps()
  const isFirstStep = currentStepIndex === 0
  const isLastStep = currentStepIndex === totalSteps - 1

  const handleEnd = useCallback(() => {
    const { replaySection, isCoachTour } = useTourStore.getState()
    endTour()
    if (isCoachTour || (replaySection && COACH_MARK_SECTIONS.includes(replaySection))) {
      return
    }
    completeTour().catch(() => {})
    queryClient.setQueryData(profileKeys.detail(), (old: Profile | undefined) => {
      if (!old) return old
      return { ...old, hasCompletedTour: true }
    })
    try {
      localStorage.setItem(
        'orbit_tour_sections',
        JSON.stringify({
          habits: true,
          goals: true,
          chat: true,
          calendar: true,
          profile: true,
        }),
      )
    } catch {
    }
  }, [endTour, queryClient])

  const handleNext = useCallback(() => {
    if (isLastStep) {
      handleEnd()
      return
    }
    nextStep()
  }, [isLastStep, nextStep, handleEnd])

  const handleSkip = useCallback(() => {
    handleEnd()
  }, [handleEnd])

  useOverlayEscape({
    open: isActive && !isNavigating && !!targetRect && !!step,
    onDismiss: handleSkip,
    restoreFocus: false,
  })

  if (!isActive || isNavigating || !targetRect || !step) {
    return null
  }

  return (
    <>
      <TourSpotlight targetRect={targetRect} />
      <TourTooltip
        step={step}
        targetRect={targetRect}
        sectionProgress={sectionProgress}
        isFirstStep={isFirstStep}
        isLastStep={isLastStep}
        onNext={handleNext}
        onPrev={prevStep}
        onSkip={handleSkip}
      />
    </>
  )
}

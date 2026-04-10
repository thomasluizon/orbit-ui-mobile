import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { profileKeys } from '@orbit/shared/query'
import type { Profile } from '@orbit/shared/types'
import { useTourStore } from '@/stores/tour-store'
import { TourSpotlight } from './tour-spotlight'
import { TourTooltip } from './tour-tooltip'
import { API } from '@orbit/shared/api'
import { apiClient } from '@/lib/api-client'
import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * Composes TourSpotlight + TourTooltip for mobile.
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

  const handleEnd = useCallback(async () => {
    endTour()
    try {
      await apiClient(API.profile.tour, { method: 'PUT' })
    } catch {
      // Silently fail
    }
    queryClient.setQueryData(profileKeys.detail(), (old: Profile | undefined) => {
      if (!old) return old
      return { ...old, hasCompletedTour: true }
    })
    try {
      await AsyncStorage.setItem(
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
      // Storage unavailable
    }
  }, [endTour, queryClient])

  const handleNext = useCallback(() => {
    const result = nextStep()
    if (!result) {
      handleEnd()
    }
  }, [nextStep, handleEnd])

  const handleSkip = useCallback(() => {
    handleEnd()
  }, [handleEnd])

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

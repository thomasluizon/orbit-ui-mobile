import { useCallback } from 'react'
import { Modal } from 'react-native'
import { useQueryClient } from '@tanstack/react-query'
import { profileKeys } from '@orbit/shared/query'
import type { Profile } from '@orbit/shared/types'
import { COACH_MARK_SECTIONS } from '@orbit/shared/types'
import { useTourStore } from '@/stores/tour-store'
import { TourSpotlight } from './tour-spotlight'
import { TourTooltip } from './tour-tooltip'
import { API } from '@orbit/shared/api'
import { apiClient } from '@/lib/api-client'
import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * Composes TourSpotlight + TourTooltip for mobile inside a transparent Modal so
 * accessibility focus and hardware back stay confined to the tour while it runs.
 * The spotlight scrim stays mounted for the whole active tour (including step
 * navigation); the tooltip renders only once the current target is measured.
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
    const { replaySection, isCoachTour } = useTourStore.getState()
    endTour()
    if (isCoachTour || (replaySection && COACH_MARK_SECTIONS.includes(replaySection))) {
      return
    }
    try {
      await apiClient(API.profile.tour, { method: 'PUT' })
    } catch {
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

  if (!isActive) {
    return null
  }

  return (
    <Modal
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="none"
      onRequestClose={handleSkip}
    >
      <TourSpotlight targetRect={targetRect} />
      {!isNavigating && targetRect && step ? (
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
      ) : null}
    </Modal>
  )
}

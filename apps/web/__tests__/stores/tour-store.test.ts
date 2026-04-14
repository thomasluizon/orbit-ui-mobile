import { describe, it, expect, beforeEach } from 'vitest'
import { useTourStore } from '@/stores/tour-store'

describe('tour-store (web)', () => {
  beforeEach(() => {
    // Reset store to initial state
    useTourStore.getState().endTour()
  })

  it('starts inactive', () => {
    const state = useTourStore.getState()
    expect(state.isActive).toBe(false)
    expect(state.currentStepIndex).toBe(0)
    expect(state.replaySection).toBeNull()
    expect(state.hiddenSections).toEqual([])
    expect(state.isNavigating).toBe(false)
    expect(state.targetRect).toBeNull()
  })

  it('starts full tour', () => {
    useTourStore.getState().startFullTour()
    const state = useTourStore.getState()

    expect(state.isActive).toBe(true)
    expect(state.currentStepIndex).toBe(0)
    expect(state.replaySection).toBeNull()
  })

  it('starts section replay', () => {
    useTourStore.getState().startSectionReplay('habits')
    const state = useTourStore.getState()

    expect(state.isActive).toBe(true)
    expect(state.currentStepIndex).toBe(0)
    expect(state.replaySection).toBe('habits')
  })

  it('getCurrentStep returns null when inactive', () => {
    const step = useTourStore.getState().getCurrentStep()
    expect(step).toBeNull()
  })

  it('getCurrentStep returns a step when active', () => {
    useTourStore.getState().startFullTour()
    const step = useTourStore.getState().getCurrentStep()
    expect(step).not.toBeNull()
    expect(step?.id).toBeDefined()
  })

  it('nextStep advances to next step', () => {
    useTourStore.getState().startFullTour()
    const initialStep = useTourStore.getState().getCurrentStep()
    const nextStep = useTourStore.getState().nextStep()

    expect(nextStep).not.toBeNull()
    expect(nextStep?.id).not.toBe(initialStep?.id)
    expect(useTourStore.getState().currentStepIndex).toBe(1)
  })

  it('prevStep goes back one step', () => {
    useTourStore.getState().startFullTour()
    useTourStore.getState().nextStep()
    expect(useTourStore.getState().currentStepIndex).toBe(1)

    useTourStore.getState().prevStep()
    expect(useTourStore.getState().currentStepIndex).toBe(0)
  })

  it('prevStep does nothing at first step', () => {
    useTourStore.getState().startFullTour()
    useTourStore.getState().prevStep()
    expect(useTourStore.getState().currentStepIndex).toBe(0)
  })

  it('endTour resets all state', () => {
    useTourStore.getState().startFullTour()
    useTourStore.getState().nextStep()

    useTourStore.getState().endTour()
    const state = useTourStore.getState()

    expect(state.isActive).toBe(false)
    expect(state.currentStepIndex).toBe(0)
    expect(state.replaySection).toBeNull()
    expect(state.isNavigating).toBe(false)
    expect(state.targetRect).toBeNull()
  })

  it('setTargetRect updates target rect', () => {
    const rect = { x: 10, y: 20, width: 100, height: 50 }
    useTourStore.getState().setTargetRect(rect)
    expect(useTourStore.getState().targetRect).toEqual(rect)
  })

  it('setNavigating updates navigation state', () => {
    useTourStore.getState().setNavigating(true)
    expect(useTourStore.getState().isNavigating).toBe(true)

    useTourStore.getState().setNavigating(false)
    expect(useTourStore.getState().isNavigating).toBe(false)
  })

  it('getTotalSteps returns total number of steps', () => {
    useTourStore.getState().startFullTour()
    const total = useTourStore.getState().getTotalSteps()
    expect(total).toBeGreaterThan(0)
  })

  it('getTotalSteps returns section steps count during replay', () => {
    useTourStore.getState().startSectionReplay('habits')
    const replayTotal = useTourStore.getState().getTotalSteps()

    useTourStore.getState().endTour()
    useTourStore.getState().startFullTour()
    const fullTotal = useTourStore.getState().getTotalSteps()

    expect(replayTotal).toBeLessThanOrEqual(fullTotal)
    expect(replayTotal).toBeGreaterThan(0)
  })

  it('getSectionProgress returns current section info', () => {
    useTourStore.getState().startFullTour()
    const progress = useTourStore.getState().getSectionProgress()

    expect(progress.current).toBeGreaterThan(0)
    expect(progress.total).toBeGreaterThan(0)
    expect(progress.section).toBeDefined()
  })

  it('getSectionProgress returns zeros when inactive', () => {
    const progress = useTourStore.getState().getSectionProgress()
    expect(progress).toEqual({ current: 0, total: 0, section: null })
  })

  it('skipSection jumps to the next section', () => {
    useTourStore.getState().startFullTour()
    const firstStep = useTourStore.getState().getCurrentStep()
    const firstSection = firstStep?.section

    const nextSection = useTourStore.getState().skipSection()

    // Should have moved to a different section or ended the tour
    if (nextSection !== null) {
      expect(nextSection).not.toBe(firstSection)
    }
  })

  it('nextStep ends tour when reaching the last step', () => {
    useTourStore.getState().startSectionReplay('habits')
    const total = useTourStore.getState().getTotalSteps()

    // Advance to end
    for (let i = 0; i < total; i++) {
      useTourStore.getState().nextStep()
    }

    expect(useTourStore.getState().isActive).toBe(false)
  })

  it('skipSection ends tour when no more sections', () => {
    // Use a section replay so there's only one section
    useTourStore.getState().startSectionReplay('habits')
    const result = useTourStore.getState().skipSection()

    // Should end tour since there's only one section in replay mode
    expect(result).toBeNull()
    expect(useTourStore.getState().isActive).toBe(false)
  })

  it('filters hidden sections out of the active steps', () => {
    useTourStore.getState().setHiddenSections(['goals'])
    useTourStore.getState().startFullTour()

    expect(useTourStore.getState().getActiveSteps().every((step) => step.section !== 'goals')).toBe(true)
  })

  it('does not start replay for a hidden section', () => {
    useTourStore.getState().setHiddenSections(['goals'])
    useTourStore.getState().startSectionReplay('goals')

    expect(useTourStore.getState().isActive).toBe(false)
    expect(useTourStore.getState().replaySection).toBeNull()
  })
})

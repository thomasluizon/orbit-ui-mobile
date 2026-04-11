import { describe, it, expect, beforeEach } from 'vitest'
import { createTourStoreState, type TourStoreState } from '../stores/tour-store'

/**
 * Creates a minimal Zustand-like store for testing.
 * Returns a `getState()` function that always returns the latest state.
 */
function createTestStore() {
  let state: TourStoreState
  const set = (
    partial: Partial<TourStoreState> | ((s: TourStoreState) => Partial<TourStoreState>),
  ) => {
    const changes = typeof partial === 'function' ? partial(state) : partial
    state = { ...state, ...changes }
  }
  const get = () => state
  state = createTourStoreState(
    set as Parameters<typeof createTourStoreState>[0],
    get,
  )
  return { getState: get }
}

describe('createTourStoreState', () => {
  let getState: () => TourStoreState

  beforeEach(() => {
    const store = createTestStore()
    getState = store.getState
  })

  it('initializes with default inactive state', () => {
    const s = getState()
    expect(s.isActive).toBe(false)
    expect(s.currentStepIndex).toBe(0)
    expect(s.replaySection).toBeNull()
    expect(s.isNavigating).toBe(false)
    expect(s.targetRect).toBeNull()
  })

  it('getCurrentStep returns null when inactive', () => {
    expect(getState().getCurrentStep()).toBeNull()
  })

  it('getActiveSteps returns full steps when no replay section', () => {
    getState().startFullTour()
    const steps = getState().getActiveSteps()
    expect(steps.length).toBeGreaterThan(0)
  })

  it('getActiveSteps returns section steps during replay', () => {
    getState().startSectionReplay('habits')
    const replaySteps = getState().getActiveSteps()
    expect(replaySteps.length).toBeGreaterThan(0)
    expect(replaySteps.every((s) => s.section === 'habits')).toBe(true)
  })

  it('getTotalSteps returns the correct count', () => {
    getState().startFullTour()
    const total = getState().getTotalSteps()
    expect(total).toBe(getState().getActiveSteps().length)
  })

  it('getSectionProgress returns zeros when inactive', () => {
    const progress = getState().getSectionProgress()
    expect(progress).toEqual({ current: 0, total: 0, section: null })
  })

  it('getSectionProgress returns correct info when active', () => {
    getState().startFullTour()
    const progress = getState().getSectionProgress()
    expect(progress.current).toBeGreaterThan(0)
    expect(progress.total).toBeGreaterThan(0)
    expect(progress.section).toBeDefined()
  })

  it('startFullTour sets isActive and resets state', () => {
    getState().startFullTour()
    const s = getState()
    expect(s.isActive).toBe(true)
    expect(s.currentStepIndex).toBe(0)
    expect(s.replaySection).toBeNull()
  })

  it('startSectionReplay sets replay section', () => {
    getState().startSectionReplay('goals')
    const s = getState()
    expect(s.isActive).toBe(true)
    expect(s.replaySection).toBe('goals')
  })

  it('nextStep advances index', () => {
    getState().startFullTour()
    const step = getState().nextStep()
    expect(step).not.toBeNull()
    expect(getState().currentStepIndex).toBe(1)
  })

  it('nextStep ends tour at last step', () => {
    getState().startSectionReplay('habits')
    const total = getState().getTotalSteps()
    for (let i = 0; i < total; i++) {
      getState().nextStep()
    }
    expect(getState().isActive).toBe(false)
  })

  it('prevStep goes back one', () => {
    getState().startFullTour()
    getState().nextStep()
    expect(getState().currentStepIndex).toBe(1)
    getState().prevStep()
    expect(getState().currentStepIndex).toBe(0)
  })

  it('prevStep does nothing at first step', () => {
    getState().startFullTour()
    getState().prevStep()
    expect(getState().currentStepIndex).toBe(0)
  })

  it('skipSection jumps to next section or ends tour', () => {
    getState().startFullTour()
    const firstSection = getState().getCurrentStep()?.section
    const result = getState().skipSection()
    if (result !== null) {
      expect(result).not.toBe(firstSection)
    } else {
      expect(getState().isActive).toBe(false)
    }
  })

  it('skipSection ends tour in single-section replay', () => {
    getState().startSectionReplay('habits')
    const result = getState().skipSection()
    expect(result).toBeNull()
    expect(getState().isActive).toBe(false)
  })

  it('endTour resets all state', () => {
    getState().startFullTour()
    getState().nextStep()
    getState().endTour()
    const s = getState()
    expect(s.isActive).toBe(false)
    expect(s.currentStepIndex).toBe(0)
    expect(s.replaySection).toBeNull()
    expect(s.isNavigating).toBe(false)
    expect(s.targetRect).toBeNull()
  })

  it('setTargetRect updates target rect', () => {
    const rect = { x: 0, y: 0, width: 100, height: 50 }
    getState().setTargetRect(rect)
    expect(getState().targetRect).toEqual(rect)
  })

  it('setTargetRect accepts null', () => {
    getState().setTargetRect({ x: 0, y: 0, width: 100, height: 50 })
    getState().setTargetRect(null)
    expect(getState().targetRect).toBeNull()
  })

  it('setNavigating updates navigation flag', () => {
    getState().setNavigating(true)
    expect(getState().isNavigating).toBe(true)
    getState().setNavigating(false)
    expect(getState().isNavigating).toBe(false)
  })
})

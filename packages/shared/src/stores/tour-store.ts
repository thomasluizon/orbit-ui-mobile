import type { TourSection, TourStep } from '../types/tour'
import { TOUR_STEPS, getTourStepsBySection, getSectionStepCount } from '../tour/tour-steps'

// ---------------------------------------------------------------------------
// Tour store -- shared state creator for web and mobile
// ---------------------------------------------------------------------------

type TourStoreSet = {
  (
    partial: Partial<TourStoreState> | ((state: TourStoreState) => Partial<TourStoreState>),
    replace?: false,
  ): void
  (state: TourStoreState | ((state: TourStoreState) => TourStoreState), replace: true): void
}

type TourStoreGet = () => TourStoreState

export interface TourTargetRect {
  x: number
  y: number
  width: number
  height: number
}

export interface TourStoreState {
  isActive: boolean
  currentStepIndex: number
  /** non-null when replaying a single section from profile */
  replaySection: TourSection | null
  /** sections hidden by entitlement gating */
  hiddenSections: TourSection[]
  /** true while waiting for route change + element to appear */
  isNavigating: boolean
  /** bounding rect of the current target element */
  targetRect: TourTargetRect | null

  // -- Derived helpers (computed from state) --
  getActiveSteps: () => TourStep[]
  getCurrentStep: () => TourStep | null
  getTotalSteps: () => number
  getSectionProgress: () => { current: number; total: number; section: TourSection | null }

  // -- Actions --
  startFullTour: () => void
  startSectionReplay: (section: TourSection) => void
  nextStep: () => TourStep | null
  prevStep: () => void
  skipSection: () => TourSection | null
  endTour: () => void
  setTargetRect: (rect: TourTargetRect | null) => void
  setNavigating: (v: boolean) => void
  setHiddenSections: (sections: TourSection[]) => void
}

export function createTourStoreState(set: TourStoreSet, get: TourStoreGet): TourStoreState {
  return {
    isActive: false,
    currentStepIndex: 0,
    replaySection: null,
    hiddenSections: [],
    isNavigating: false,
    targetRect: null,

    getActiveSteps: () => {
      const { replaySection, hiddenSections } = get()
      const visibleSteps = TOUR_STEPS.filter((step) => !hiddenSections.includes(step.section))
      return replaySection
        ? visibleSteps.filter((step) => step.section === replaySection)
        : visibleSteps
    },

    getCurrentStep: () => {
      const { isActive, currentStepIndex } = get()
      if (!isActive) return null
      const steps = get().getActiveSteps()
      return steps[currentStepIndex] ?? null
    },

    getTotalSteps: () => {
      return get().getActiveSteps().length
    },

    getSectionProgress: () => {
      const step = get().getCurrentStep()
      if (!step) return { current: 0, total: 0, section: null }
      const sectionSteps = getTourStepsBySection(step.section)
      const indexInSection = sectionSteps.findIndex((s) => s.id === step.id)
      return {
        current: indexInSection + 1,
        total: getSectionStepCount(step.section),
        section: step.section,
      }
    },

    startFullTour: () =>
      set({
        isActive: true,
        currentStepIndex: 0,
        replaySection: null,
        isNavigating: false,
        targetRect: null,
      }),

    startSectionReplay: (section) =>
      set((state) => ({
        isActive: !state.hiddenSections.includes(section),
        currentStepIndex: 0,
        replaySection: state.hiddenSections.includes(section) ? null : section,
        isNavigating: false,
        targetRect: null,
      })),

    nextStep: () => {
      const { currentStepIndex } = get()
      const steps = get().getActiveSteps()
      const nextIndex = currentStepIndex + 1
      if (nextIndex >= steps.length) {
        get().endTour()
        return null
      }
      set({ currentStepIndex: nextIndex, targetRect: null })
      return steps[nextIndex] ?? null
    },

    prevStep: () => {
      const { currentStepIndex } = get()
      if (currentStepIndex > 0) {
        set({ currentStepIndex: currentStepIndex - 1, targetRect: null })
      }
    },

    skipSection: () => {
      const step = get().getCurrentStep()
      if (!step) {
        get().endTour()
        return null
      }
      const steps = get().getActiveSteps()
      const nextSectionIndex = steps.findIndex(
        (s, i) => i > get().currentStepIndex && s.section !== step.section,
      )
      if (nextSectionIndex === -1) {
        get().endTour()
        return null
      }
      set({ currentStepIndex: nextSectionIndex, targetRect: null })
      return steps[nextSectionIndex]?.section ?? null
    },

    endTour: () =>
      set({
        isActive: false,
        currentStepIndex: 0,
        replaySection: null,
        isNavigating: false,
        targetRect: null,
      }),

    setTargetRect: (rect) => set({ targetRect: rect }),
    setNavigating: (v) => set({ isNavigating: v }),
    setHiddenSections: (sections) =>
      set((state) => {
        const nextSteps = (state.replaySection
          ? TOUR_STEPS.filter((step) => step.section === state.replaySection)
          : TOUR_STEPS
        ).filter((step) => !sections.includes(step.section))

        return {
          hiddenSections: sections,
          currentStepIndex:
            nextSteps.length === 0
              ? 0
              : Math.min(state.currentStepIndex, nextSteps.length - 1),
          replaySection:
            state.replaySection && sections.includes(state.replaySection)
              ? null
              : state.replaySection,
          isActive: nextSteps.length === 0 ? false : state.isActive,
        }
      }),
  }
}

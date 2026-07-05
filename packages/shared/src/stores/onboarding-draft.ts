import type { CreateGoalRequest } from '../types/goal'
import type {
  ApplyOnboardingFirstLog,
  ApplyOnboardingHabit,
  ApplyOnboardingRequest,
} from '../types/onboarding'

export const ONBOARDING_DRAFT_STORAGE_VERSION = 1

type OnboardingDraftSet = {
  (
    partial:
      | Partial<OnboardingDraftState>
      | ((state: OnboardingDraftState) => Partial<OnboardingDraftState>),
    replace?: false,
  ): void
}

type OnboardingDraftGet = () => OnboardingDraftState

export type OnboardingWeekStartDay = 0 | 1

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

export interface PersistedOnboardingDraft {
  step: number
  habits: ApplyOnboardingHabit[]
  firstLog: ApplyOnboardingFirstLog | null
  goal: CreateGoalRequest | null
  weekStartDay: OnboardingWeekStartDay | null
  colorScheme: string | null
  onboardingLocallyDone: boolean
}

export interface OnboardingDraftState extends PersistedOnboardingDraft {
  setStep: (step: number) => void
  bufferHabit: (habit: ApplyOnboardingHabit) => number
  bufferFirstLog: (habitIndex: number, date: string) => void
  bufferGoal: (goal: CreateGoalRequest | null) => void
  bufferWeekStartDay: (day: OnboardingWeekStartDay) => void
  bufferColorScheme: (scheme: string) => void
  markOnboardingLocallyDone: () => void
  hasPendingAnswers: () => boolean
  buildApplyPayload: () => ApplyOnboardingRequest
  reset: () => void
}

function createInitialDraft(): PersistedOnboardingDraft {
  return {
    step: 0,
    habits: [],
    firstLog: null,
    goal: null,
    weekStartDay: null,
    colorScheme: null,
    onboardingLocallyDone: false,
  }
}

export function getPersistedOnboardingDraft(
  state: OnboardingDraftState,
): PersistedOnboardingDraft {
  return {
    step: state.step,
    habits: state.habits.map((habit) => ({ ...habit })),
    firstLog: state.firstLog ? { ...state.firstLog } : null,
    goal: state.goal ? { ...state.goal } : null,
    weekStartDay: state.weekStartDay,
    colorScheme: state.colorScheme,
    onboardingLocallyDone: state.onboardingLocallyDone,
  }
}

export function migrateOnboardingDraft(
  persistedState: unknown,
): PersistedOnboardingDraft {
  const initial = createInitialDraft()
  if (!isRecord(persistedState)) return initial

  return {
    step: typeof persistedState.step === 'number' ? persistedState.step : 0,
    habits: Array.isArray(persistedState.habits)
      ? (persistedState.habits.filter(isRecord) as ApplyOnboardingHabit[])
      : [],
    firstLog: isRecord(persistedState.firstLog)
      ? (persistedState.firstLog as ApplyOnboardingFirstLog)
      : null,
    goal: isRecord(persistedState.goal)
      ? (persistedState.goal as CreateGoalRequest)
      : null,
    weekStartDay:
      persistedState.weekStartDay === 0 || persistedState.weekStartDay === 1
        ? persistedState.weekStartDay
        : null,
    colorScheme:
      typeof persistedState.colorScheme === 'string'
        ? persistedState.colorScheme
        : null,
    onboardingLocallyDone: persistedState.onboardingLocallyDone === true,
  }
}

export function buildApplyOnboardingPayload(
  draft: PersistedOnboardingDraft,
): ApplyOnboardingRequest {
  return {
    habits: draft.habits.map((habit) => ({ ...habit })),
    ...(draft.firstLog ? { firstLog: { ...draft.firstLog } } : {}),
    ...(draft.goal ? { goal: { ...draft.goal } } : {}),
    ...(draft.weekStartDay !== null ? { weekStartDay: draft.weekStartDay } : {}),
    ...(draft.colorScheme !== null ? { colorScheme: draft.colorScheme } : {}),
  }
}

export function createOnboardingDraftState(
  set: OnboardingDraftSet,
  get: OnboardingDraftGet,
): OnboardingDraftState {
  return {
    ...createInitialDraft(),

    setStep: (step) => set({ step }),

    bufferHabit: (habit) => {
      const index = get().habits.length
      set((state) => ({ habits: [...state.habits, { ...habit }] }))
      return index
    },

    bufferFirstLog: (habitIndex, date) => set({ firstLog: { habitIndex, date } }),

    bufferGoal: (goal) => set({ goal: goal ? { ...goal } : null }),

    bufferWeekStartDay: (day) => set({ weekStartDay: day }),

    bufferColorScheme: (scheme) => set({ colorScheme: scheme }),

    markOnboardingLocallyDone: () => set({ onboardingLocallyDone: true }),

    hasPendingAnswers: () => {
      const state = get()
      return (
        state.onboardingLocallyDone ||
        state.habits.length > 0 ||
        state.goal !== null ||
        state.firstLog !== null ||
        state.weekStartDay !== null ||
        state.colorScheme !== null
      )
    },

    buildApplyPayload: () => buildApplyOnboardingPayload(getPersistedOnboardingDraft(get())),

    reset: () => set(createInitialDraft()),
  }
}

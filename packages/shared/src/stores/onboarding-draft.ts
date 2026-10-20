import { createGoalRequestSchema, type CreateGoalRequest } from '../types/goal'
import {
  applyOnboardingFirstLogSchema,
  applyOnboardingHabitSchema,
  type ApplyOnboardingFirstLog,
  type ApplyOnboardingHabit,
  type ApplyOnboardingRequest,
} from '../types/onboarding'
import { isRecord } from '../utils/is-record'

export const ONBOARDING_DRAFT_STORAGE_VERSION = 3

type OnboardingDraftSet = (
  partial:
    | Partial<OnboardingDraftState>
    | ((state: OnboardingDraftState) => Partial<OnboardingDraftState>),
  replace?: false,
) => void

type OnboardingDraftGet = () => OnboardingDraftState

export type OnboardingWeekStartDay = 0 | 1

export interface PersistedOnboardingDraft {
  accountKey?: string | null
  habits: ApplyOnboardingHabit[]
  firstLog: ApplyOnboardingFirstLog | null
  goal: CreateGoalRequest | null
  weekStartDay: OnboardingWeekStartDay | null
  onboardingLocallyDone: boolean
  pushPermissionGranted: boolean
  pushRegistrationFailed: boolean
}

export interface OnboardingDraftState extends PersistedOnboardingDraft {
  accountKey: string | null
  setAccountScope: (accountKey: string | null, preserveAnonymousDraft?: boolean) => void
  bufferHabit: (habit: ApplyOnboardingHabit) => number
  replaceHabit: (habitIndex: number, habit: ApplyOnboardingHabit) => void
  bufferFirstLog: (habitIndex: number, date: string) => void
  bufferGoal: (goal: CreateGoalRequest | null) => void
  bufferWeekStartDay: (day: OnboardingWeekStartDay) => void
  markOnboardingLocallyDone: () => void
  markPushPermissionGranted: () => void
  markPushRegistrationFailed: () => void
  hasPendingAnswers: () => boolean
  buildApplyPayload: () => ApplyOnboardingRequest
  reset: () => void
}

function createInitialDraft(): PersistedOnboardingDraft & { accountKey: string | null } {
  return {
    accountKey: null,
    habits: [],
    firstLog: null,
    goal: null,
    weekStartDay: null,
    onboardingLocallyDone: false,
    pushPermissionGranted: false,
    pushRegistrationFailed: false,
  }
}

export function getPersistedOnboardingDraft(
  state: OnboardingDraftState,
): PersistedOnboardingDraft {
  return {
    accountKey: state.accountKey,
    habits: state.habits.map((habit) => ({ ...habit })),
    firstLog: state.firstLog ? { ...state.firstLog } : null,
    goal: state.goal ? { ...state.goal } : null,
    weekStartDay: state.weekStartDay,
    onboardingLocallyDone: state.onboardingLocallyDone,
    pushPermissionGranted: state.pushPermissionGranted,
    pushRegistrationFailed: state.pushRegistrationFailed,
  }
}

export function migrateOnboardingDraft(
  persistedState: unknown,
): PersistedOnboardingDraft & { accountKey: string | null } {
  const initial = createInitialDraft()
  if (!isRecord(persistedState)) return initial

  const habits = Array.isArray(persistedState.habits)
    ? persistedState.habits.flatMap((habit) => {
        const parsed = applyOnboardingHabitSchema.safeParse(habit)
        return parsed.success ? [parsed.data] : []
      })
    : []
  const firstLogResult = applyOnboardingFirstLogSchema.safeParse(persistedState.firstLog)
  const goalResult = createGoalRequestSchema.safeParse(persistedState.goal)

  return {
    accountKey: typeof persistedState.accountKey === 'string' ? persistedState.accountKey : null,
    habits,
    firstLog: firstLogResult.success ? firstLogResult.data : null,
    goal: goalResult.success ? goalResult.data : null,
    weekStartDay:
      persistedState.weekStartDay === 0 || persistedState.weekStartDay === 1
        ? persistedState.weekStartDay
        : null,
    onboardingLocallyDone: persistedState.onboardingLocallyDone === true,
    pushPermissionGranted: persistedState.pushPermissionGranted === true,
    pushRegistrationFailed: persistedState.pushRegistrationFailed === true,
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
  }
}

export function createOnboardingDraftState(
  set: OnboardingDraftSet,
  get: OnboardingDraftGet,
): OnboardingDraftState {
  return {
    ...createInitialDraft(),

    setAccountScope: (accountKey, preserveAnonymousDraft = false) => set((state) => {
      const onboardingLocallyDone = state.onboardingLocallyDone || accountKey !== null
      if (state.accountKey === accountKey) return { onboardingLocallyDone }
      if (state.accountKey === null && accountKey !== null && preserveAnonymousDraft) {
        return { accountKey, onboardingLocallyDone }
      }
      return { ...createInitialDraft(), accountKey, onboardingLocallyDone }
    }),

    bufferHabit: (habit) => {
      const index = get().habits.length
      set((state) => ({ habits: [...state.habits, { ...habit }] }))
      return index
    },

    replaceHabit: (habitIndex, habit) =>
      set((state) => ({
        habits: state.habits.map((current, index) =>
          index === habitIndex ? { ...habit } : current,
        ),
      })),

    bufferFirstLog: (habitIndex, date) => set({ firstLog: { habitIndex, date } }),

    bufferGoal: (goal) => set({ goal: goal ? { ...goal } : null }),

    bufferWeekStartDay: (day) => set({ weekStartDay: day }),


    markOnboardingLocallyDone: () => set({ onboardingLocallyDone: true }),

    markPushPermissionGranted: () => set({ pushPermissionGranted: true, pushRegistrationFailed: false }),

    markPushRegistrationFailed: () => set({ pushRegistrationFailed: true }),

    hasPendingAnswers: () => {
      const state = get()
      return (
        state.habits.length > 0 ||
        state.goal !== null ||
        state.firstLog !== null ||
        state.weekStartDay !== null ||
        state.pushPermissionGranted
      )
    },

    buildApplyPayload: () => buildApplyOnboardingPayload(getPersistedOnboardingDraft(get())),

    reset: () => set((state) => ({
      ...createInitialDraft(),
      onboardingLocallyDone: state.onboardingLocallyDone,
    })),
  }
}

import AsyncStorage from '@react-native-async-storage/async-storage'
import { addDays } from 'date-fns'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { formatAPIDate } from '@orbit/shared/utils'

const REVIEW_REMINDER_STORAGE_KEY = 'orbit-review-reminder'
const REVIEW_REMINDER_COOLDOWN_DAYS = 120
const MAX_DISTINCT_ACTIVE_DAYS = 365
const REVIEW_MIN_COMPLETIONS = 20
const REVIEW_MIN_ACTIVE_DAYS = 5

interface ReviewReminderSnapshot {
  accountKey: string | null
  completionCount: number
  activeDays: string[]
  dismissedUntil: string | null
  acceptedAt: string | null
}

interface ReviewReminderState {
  accountKey: string | null
  completionCount: number
  activeDays: string[]
  dismissedUntil: string | null
  acceptedAt: string | null
  setAccountScope: (accountKey: string | null) => void
  reset: () => void
  trackCompletion: (date?: string) => void
  dismiss: () => void
  accept: () => void
}

function createReviewReminderSnapshot(
  accountKey: string | null = null,
): ReviewReminderSnapshot {
  return {
    accountKey,
    completionCount: 0,
    activeDays: [],
    dismissedUntil: null,
    acceptedAt: null,
  }
}

/**
 * Engagement floor + guards for the post-celebration review moment: onboarding
 * complete, 20+ completions across 5+ distinct active days, never accepted,
 * and outside the 120-day snooze window. Used at arm time (so an ineligible
 * review never displaces another engagement prompt) and re-checked at display time.
 */
export function isReviewMomentEligible(
  state: Pick<
    ReviewReminderState,
    'completionCount' | 'activeDays' | 'dismissedUntil' | 'acceptedAt'
  >,
  hasCompletedOnboarding: boolean,
  today: string,
): boolean {
  if (!hasCompletedOnboarding) return false
  if (state.completionCount < REVIEW_MIN_COMPLETIONS) return false
  if (state.activeDays.length < REVIEW_MIN_ACTIVE_DAYS) return false
  if (state.acceptedAt) return false
  if (state.dismissedUntil && state.dismissedUntil >= today) return false
  return true
}

function normalizeActiveDays(activeDays: string[], day: string): string[] {
  const nextDays = Array.from(new Set([...activeDays, day])).sort((left, right) =>
    left.localeCompare(right),
  )
  if (nextDays.length <= MAX_DISTINCT_ACTIVE_DAYS) {
    return nextDays
  }

  return nextDays.slice(nextDays.length - MAX_DISTINCT_ACTIVE_DAYS)
}

export const useReviewReminderStore = create<ReviewReminderState>()(
  persist(
    (set) => ({
      ...createReviewReminderSnapshot(),
      setAccountScope: (accountKey) =>
        set((state) => {
          if (state.accountKey === accountKey) {
            return {}
          }

          return createReviewReminderSnapshot(accountKey)
        }),
      reset: () => set(createReviewReminderSnapshot()),
      trackCompletion: (date) =>
        set((state) => {
          const completionDate = date ?? formatAPIDate(new Date())
          return {
            completionCount: state.completionCount + 1,
            activeDays: normalizeActiveDays(state.activeDays, completionDate),
          }
        }),
      dismiss: () =>
        set({
          dismissedUntil: formatAPIDate(
            addDays(new Date(), REVIEW_REMINDER_COOLDOWN_DAYS),
          ),
        }),
      accept: () =>
        set({
          acceptedAt: new Date().toISOString(),
          dismissedUntil: null,
        }),
    }),
    {
      name: REVIEW_REMINDER_STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        accountKey: state.accountKey,
        completionCount: state.completionCount,
        activeDays: state.activeDays,
        dismissedUntil: state.dismissedUntil,
        acceptedAt: state.acceptedAt,
      }),
    },
  ),
)

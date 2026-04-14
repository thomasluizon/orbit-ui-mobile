import AsyncStorage from '@react-native-async-storage/async-storage'
import { addDays } from 'date-fns'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { formatAPIDate } from '@orbit/shared/utils'

const REVIEW_REMINDER_STORAGE_KEY = 'orbit-review-reminder'
const REVIEW_REMINDER_COOLDOWN_DAYS = 120
const MAX_DISTINCT_ACTIVE_DAYS = 365

interface ReviewReminderState {
  completionCount: number
  activeDays: string[]
  dismissedUntil: string | null
  acceptedAt: string | null
  trackCompletion: (date?: string) => void
  dismiss: () => void
  accept: () => void
}

function normalizeActiveDays(activeDays: string[], day: string): string[] {
  const nextDays = Array.from(new Set([...activeDays, day])).sort()
  if (nextDays.length <= MAX_DISTINCT_ACTIVE_DAYS) {
    return nextDays
  }

  return nextDays.slice(nextDays.length - MAX_DISTINCT_ACTIVE_DAYS)
}

export const useReviewReminderStore = create<ReviewReminderState>()(
  persist(
    (set) => ({
      completionCount: 0,
      activeDays: [],
      dismissedUntil: null,
      acceptedAt: null,
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
        completionCount: state.completionCount,
        activeDays: state.activeDays,
        dismissedUntil: state.dismissedUntil,
        acceptedAt: state.acceptedAt,
      }),
    },
  ),
)

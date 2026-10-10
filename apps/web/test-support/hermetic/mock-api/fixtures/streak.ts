import { streakInfoSchema } from '@orbit/shared/types/gamification'

export const streakFixture = streakInfoSchema.parse({
  currentStreak: 0, longestStreak: 0, lastActiveDate: null,
  freezesUsedThisMonth: 0, freezesAvailable: 0, maxFreezesPerMonth: 3,
  isFrozenToday: false, recentFreezeDates: [],
  streakFreezesAccumulated: 0, maxStreakFreezesAccumulated: 3,
  daysUntilNextFreeze: 7, freezesAvailableToUse: 0, canEarnMore: true,
  isRepairAvailable: false, repairableGapDates: [],
})

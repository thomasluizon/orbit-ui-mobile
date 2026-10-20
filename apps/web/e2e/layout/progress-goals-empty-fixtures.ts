import { API } from '@orbit/shared/api'
import { gamificationProfileSchema, streakInfoSchema } from '@orbit/shared/types/gamification'
import { paginatedGoalResponseSchema } from '@orbit/shared/types/goal'
import { profileSchema, subscriptionStatusSchema } from '@orbit/shared/types/profile'
import { emptyGoalsPageFixture } from '../../test-support/hermetic/mock-api/fixtures/collections'
import { gamificationProfileFixture } from '../../test-support/hermetic/mock-api/fixtures/gamification'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'

export const progressGoalsEmptySubscription = subscriptionStatusSchema.parse({
  ...profileFixture, plan: 'pro', source: null, hasProAccess: true, isTrialActive: true,
  trialEndsAt: '2026-09-18T12:00:00Z', aiMessagesLimit: 50,
})

export const progressGoalsEmptyProfile = profileSchema.parse({
  ...profileFixture, ...progressGoalsEmptySubscription, canViewGamification: true,
  currentStreak: 4, longestStreak: 21,
})

export const progressGoalsEmptyGamification = gamificationProfileSchema.parse({
  ...gamificationProfileFixture, currentStreak: 4, longestStreak: 21,
  isPro: true, achievementsLocked: false,
})
export const progressGoalsEmptyPage = paginatedGoalResponseSchema.parse(emptyGoalsPageFixture)
export const progressGoalsEmptyStreak = streakInfoSchema.parse({
  currentStreak: 4, longestStreak: 21, lastActiveDate: '2026-09-04',
  freezesUsedThisMonth: 0, freezesAvailable: 0, maxFreezesPerMonth: 3,
  isFrozenToday: false, recentFreezeDates: [],
  streakFreezesAccumulated: 0, maxStreakFreezesAccumulated: 3,
  daysUntilNextFreeze: 3, freezesAvailableToUse: 0, canEarnMore: true,
  isRepairAvailable: false, repairableGapDates: [],
})

export function matchesProgressGoalsRequest(url: URL): boolean {
  return url.origin === LAYOUT_ORIGIN && url.pathname === API.goals.list
}

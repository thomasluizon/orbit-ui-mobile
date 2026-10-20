import { streakInfoSchema, type StreakInfo } from '../types/gamification'

export const progressStreakNow = '2026-09-10T15:00:00Z'

const ordinary = streakInfoSchema.parse({
  currentStreak: 4, longestStreak: 21, lastActiveDate: '2026-09-10',
  freezesUsedThisMonth: 0, freezesAvailable: 2, maxFreezesPerMonth: 3,
  isFrozenToday: false, recentFreezeDates: [], streakFreezesAccumulated: 2,
  daysUntilNextFreeze: 3, freezesAvailableToUse: 2, repairableGapDates: [],
})

const states: { name: string; overrides: Partial<StreakInfo> }[] = [
  { name: 'ordinary', overrides: {} },
  { name: 'one protected day', overrides: { recentFreezeDates: ['2026-09-08'] } },
  { name: 'many protected days', overrides: { recentFreezeDates: Array.from({ length: 28 }, (_, index) => `2026-08-${String(index + 1).padStart(2, '0')}`) } },
  { name: 'full bank', overrides: { streakFreezesAccumulated: 3, freezesAvailableToUse: 3, canEarnMore: false } },
  { name: 'frozen today', overrides: { isFrozenToday: true, recentFreezeDates: ['2026-09-10'] } },
  { name: 'covered day', overrides: { lastFreezeCoveredDate: '2026-09-09', freezeBankRemaining: 1, lastFreezeCoveredOrigin: 'manual' } },
  { name: 'automatic cover', overrides: { lastFreezeCoveredDate: '2026-09-09', freezeBankRemaining: 1, lastFreezeCoveredOrigin: 'automatic' } },
  { name: 'repair available', overrides: { currentStreak: 0, repairableGapDates: ['2026-09-09'] } },
  { name: 'empty repair bank', overrides: { currentStreak: 0, repairableGapDates: ['2026-09-09'], streakFreezesAccumulated: 0, freezesAvailableToUse: 0 } },
  { name: 'partial repair bank', overrides: { currentStreak: 0, repairableGapDates: ['2026-09-08', '2026-09-09'], streakFreezesAccumulated: 1, freezesAvailableToUse: 1 } },
  { name: 'capped repair bank', overrides: { currentStreak: 0, repairableGapDates: ['2026-09-06', '2026-09-07', '2026-09-08', '2026-09-09'], streakFreezesAccumulated: 3, freezesAvailableToUse: 3 } },
  { name: 'repair unavailable', overrides: { currentStreak: 1 } },
]

export const progressStreakStates = states.map(({ name, overrides }) => ({
  name, streak: streakInfoSchema.parse({ ...ordinary, ...overrides }),
}))

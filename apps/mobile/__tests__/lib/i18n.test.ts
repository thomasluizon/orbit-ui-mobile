import { describe, it, expect } from 'vitest'
import i18n from '@/lib/i18n'
import { plural } from '@/lib/plural'

describe('mobile i18n interpolation', () => {
  it('interpolates single-brace placeholders', () => {
    expect(i18n.t('gamification.profileCard.level', { level: 5 })).toBe('Level 5')
    expect(i18n.t('gamification.profileCard.totalXp', { total: 1200 })).toBe('1200 XP total')
  })

  it('works with the plural helper for pipe-separated forms', () => {
    expect(plural(i18n.t('streakDisplay.profile.currentStreak', { count: 1 }), 1)).toBe('1 day streak')
    expect(plural(i18n.t('streakDisplay.profile.currentStreak', { count: 3 }), 3)).toBe('3 day streak')
  })

  it('matches web plural selection for scoped bulk and calendar copy', () => {
    expect(
      plural(i18n.t('habits.bulkDeleteMessage', { count: 1 }), 1),
    ).toBe('Are you sure you want to delete 1 habit? This action cannot be undone.')
    expect(
      plural(i18n.t('habits.bulkLogMessage', { count: 2 }), 2),
    ).toBe('Log 2 selected habits as complete? Already completed habits will be skipped.')
    expect(
      plural(
        i18n.t('calendar.dayDetail.completionSummary', { done: 1, total: 1 }),
        1,
      ),
    ).toBe('1 of 1 habit completed')
    expect(plural(i18n.t('goals.deadline.daysLeft', { n: 1 }), 1)).toBe('1 day left')
    expect(plural(i18n.t('goals.deadline.daysLeft', { n: 3 }), 3)).toBe('3 days left')
    expect(plural(i18n.t('streakDisplay.detail.daysUnit', { count: 1 }), 1)).toBe('day')
    expect(plural(i18n.t('streakDisplay.detail.daysUnit', { count: 4 }), 4)).toBe('days')
    expect(plural(i18n.t('streakDisplay.freeze.available', { count: 0 }), 0)).toBe('No freezes available')
    expect(plural(i18n.t('streakDisplay.freeze.available', { count: 2 }), 2)).toBe('2 freezes available')
    expect(plural(i18n.t('habits.frequency.everyNWeeks', { n: 2 }), 2)).toBe('Every 2 weeks')
    expect(plural(i18n.t('habits.breakdown.createdSuccess', { n: 2 }), 2)).toBe('Created 2 habits successfully')
  })
})

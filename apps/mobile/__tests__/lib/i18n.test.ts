import { describe, it, expect } from 'vitest'
import { i18n } from '@/lib/i18n'
import { plural } from '@/lib/plural'

describe('mobile i18n interpolation', () => {
  it('interpolates single-brace placeholders', () => {
    expect(
      i18n.t('profile.settingsRows.timezoneValue', { timeZone: 'America/Sao_Paulo' }),
    ).toBe('Timezone: America/Sao_Paulo')
  })

  it('works with the plural helper for pipe-separated forms', () => {
    expect(plural(i18n.t('streakDisplay.badge.tooltip', { count: 1 }), 1)).toBe('1 day streak')
    expect(plural(i18n.t('streakDisplay.badge.tooltip', { count: 3 }), 3)).toBe('3 day streak')
  })

  it('matches web plural selection for scoped bulk and calendar copy', () => {
    expect(
      plural(i18n.t('habits.bulkDeleteMessage', { count: 1 }), 1),
    ).toBe('This deletes 1 habit and its sub habits. It cannot be undone.')
    expect(
      plural(i18n.t('habits.deleteListConfirmMessage', { name: 'Read', count: 1 }), 1),
    ).toBe('Read and 1 item inside it leave your list. This cannot be undone.')
    expect(
      plural(i18n.t('habits.deleteListConfirmMessage', { name: 'Read', count: 2 }), 2),
    ).toBe('Read and 2 items inside it leave your list. This cannot be undone.')
    expect(
      plural(
        i18n.t('calendar.dayDetail.completionSummary', { done: 1, total: 1 }),
        1,
      ),
    ).toBe('1 of 1 habit completed')
    expect(plural(i18n.t('goals.deadline.daysLeft', { n: 1 }), 1)).toBe('1 day left')
    expect(plural(i18n.t('goals.deadline.daysLeft', { n: 3 }), 3)).toBe('3 days left')
    expect(plural(i18n.t('habits.frequency.everyNWeeks', { n: 2 }), 2)).toBe('Every 2 weeks')
    expect(plural(i18n.t('habits.breakdown.createdSuccess', { n: 2 }), 2)).toBe('Created 2 habits successfully')
  })

  it.each([
    { locale: 'en', count: 0, expected: 'Streak progress is calculated automatically, so it cannot be edited here.' },
    { locale: 'en', count: 1, expected: 'It comes from the current streak of the linked habit, so it cannot be edited here.' },
    { locale: 'en', count: 3, expected: 'It comes from the smallest current streak among the 3 linked habits, so it cannot be edited here.' },
    { locale: 'pt-BR', count: 0, expected: 'O progresso da sequência é calculado automaticamente, então não pode ser editado aqui.' },
    { locale: 'pt-BR', count: 1, expected: 'Vem da sequência atual do hábito ligado a esta meta, então não pode ser editado aqui.' },
    { locale: 'pt-BR', count: 3, expected: 'Vem da menor sequência atual entre os 3 hábitos ligados a esta meta, então não pode ser editado aqui.' },
  ])('renders derived streak copy in $locale at count $count', async ({ locale, count, expected }) => {
    await i18n.changeLanguage(locale)

    expect(plural(i18n.t('goals.detail.derivedStreak', { count }), count)).toBe(expected)

    await i18n.changeLanguage('en')
  })
})

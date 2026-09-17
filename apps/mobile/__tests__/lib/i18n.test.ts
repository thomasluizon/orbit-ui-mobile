import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { i18n } from '@/lib/i18n'
import { plural } from '@/lib/plural'

describe('mobile i18n interpolation', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en')
  })

  it.each([
    {
      locale: 'en',
      manual: 'Update progress. Reaching the target completes the goal.',
      open: 'This goal reached its target but is still open. Complete it when you are ready.',
    },
    {
      locale: 'pt-BR',
      manual: 'Atualize o progresso. Ao alcançar o alvo, a meta é concluída.',
      open: 'Esta meta alcançou o alvo, mas continua ativa. Conclua quando quiser.',
    },
  ])('renders truthful goal completion copy through the app i18n instance in $locale', async ({ locale, manual, open }) => {
    await i18n.changeLanguage(locale)

    expect(i18n.t('goals.detail.manualProgress')).toBe(manual)
    expect(i18n.t('goals.detail.completeWhy')).toBe(open)
  })

  it('interpolates single-brace placeholders', () => {
    expect(
      i18n.t('profile.settingsRows.timezoneValue', { timeZone: 'America/Sao_Paulo' }),
    ).toBe('Timezone America/Sao_Paulo')
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
      i18n.t('calendar.dayDetail.completionSummary', { done: 1, total: 1 }),
    ).toBe('1 of 1 logged')
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

const localeCases = [
  {
    locale: 'en',
    one: {
      stripWindow: 'Activity over the last 1 day',
      repairEmpty: 'The gap is still open, but no freeze is banked to cover it. This repair offer ends today.',
      daysLeft: '1 day left',
    },
    other: {
      stripWindow: 'Activity over the last 2 days',
      repairEmpty: 'The gap is still open, but no freeze is banked to cover it. This repair offer ends today.',
      daysLeft: '2 days left',
    },
    named: 'Completion on Monday: 80%',
    created: "Created 'Corrida'",
    streak: '4-day streak',
  },
  {
    locale: 'pt-BR',
    one: {
      stripWindow: 'Atividade nos últimos 1 dia',
      repairEmpty: 'A lacuna continua em aberto, mas não há congelamento guardado para cobri-la. Esta oferta de reparo termina hoje.',
      daysLeft: 'Falta 1 dia',
    },
    other: {
      stripWindow: 'Atividade nos últimos 2 dias',
      repairEmpty: 'A lacuna continua em aberto, mas não há congelamento guardado para cobri-la. Esta oferta de reparo termina hoje.',
      daysLeft: 'Faltam 2 dias',
    },
    named: 'Conclusão em segunda-feira: 80%',
    created: "'Corrida' criado",
    streak: 'Sequência de 4 dias',
  },
] as const

describe.each(localeCases)('mobile i18n in $locale', ({ locale, one, other, named, created, streak }) => {
  it('renders ICU plurals and plain interpolation through the real configuration', async () => {
    await i18n.changeLanguage(locale)

    expect(i18n.t('progressScreen.streak.stripWindow', { count: 1 })).toBe(one.stripWindow)
    expect(i18n.t('progressScreen.streak.stripWindow', { count: 2 })).toBe(other.stripWindow)
    expect(i18n.t('progressScreen.streak.repairEmpty', { count: 1 })).toBe(one.repairEmpty)
    expect(i18n.t('progressScreen.streak.repairEmpty', { count: 2 })).toBe(other.repairEmpty)
    expect(i18n.t('progressScreen.goals.daysLeft', { count: 1 })).toBe(one.daysLeft)
    expect(i18n.t('progressScreen.goals.daysLeft', { count: 2 })).toBe(other.daysLeft)
    expect(i18n.t('shareCard.weeklyBarLabel', { day: locale === 'en' ? 'Monday' : 'segunda-feira', percent: 80 })).toBe(named)
    expect(i18n.t('habits.clarification.successCreated', { name: 'Corrida' })).toBe(created)
    expect(i18n.t('shareCard.streak', { count: 4 })).toBe(streak)
  })
})

it.each([
  {
    locale: 'en',
    one: 'You closed one goal this period.',
    other: 'You closed 4 goals this period.',
  },
  {
    locale: 'pt-BR',
    one: 'Você fechou uma meta neste período.',
    other: 'Você fechou 4 metas neste período.',
  },
])('renders exact Wrapped goal captions in $locale', async ({ locale, one, other }) => {
  await i18n.changeLanguage(locale)

  expect(i18n.t('wrapped.slides.goals.some', { count: 1 })).toBe(one)
  expect(i18n.t('wrapped.slides.goals.some', { count: 4 })).toBe(other)
})

afterAll(async () => {
  await i18n.changeLanguage('en')
})

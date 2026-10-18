import { describe, expect, it } from 'vitest'
import { buildHabitDateBuckets, formatHabitDateBucketLabel } from '../utils/habit-list-progress'
import { createMockHabit } from './factories'
import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'

const TODAY = '2026-09-12'

describe('Todos date groups', () => {
  it('puts oldest overdue habits first, then undated habits and chronological date groups', () => {
    const habits = [
      createMockHabit({ id: 'later-overdue', dueDate: '2026-09-11', isOverdue: true }),
      createMockHabit({ id: 'future', dueDate: '2026-09-14' }),
      createMockHabit({ id: 'undated', dueDate: '', scheduledDates: [] }),
      createMockHabit({ id: 'today-first', dueDate: TODAY }),
      createMockHabit({ id: 'older-overdue', dueDate: '2026-09-10', isOverdue: true }),
      createMockHabit({ id: 'finished-past', dueDate: '2026-09-09', isCompleted: true, isOverdue: true }),
      createMockHabit({ id: 'tomorrow', dueDate: '2026-09-13' }),
      createMockHabit({ id: 'undated-second', dueDate: '', scheduledDates: [] }),
    ]
    expect(buildHabitDateBuckets(habits, TODAY).map((bucket) => ({
      key: bucket.key, isOverdue: bucket.isOverdue, ids: bucket.habits.map((habit) => habit.id),
    }))).toEqual([
      { key: '__overdue__', isOverdue: true, ids: ['older-overdue', 'later-overdue'] },
      { key: '', isOverdue: false, ids: ['undated', 'undated-second'] },
      { key: TODAY, isOverdue: false, ids: ['today-first', 'finished-past'] },
      { key: '2026-09-13', isOverdue: false, ids: ['tomorrow'] },
      { key: '2026-09-14', isOverdue: false, ids: ['future'] },
    ])
    expect(habits.map((habit) => habit.id)).toEqual([
      'later-overdue', 'future', 'undated', 'today-first', 'older-overdue', 'finished-past', 'tomorrow', 'undated-second',
    ])
  })

  it.each([
    { locale: 'en', messages: en, futureLabel: 'Monday, Sep 14, 2026' },
    { locale: 'pt-BR', messages: ptBR, futureLabel: 'segunda-feira, 14 de set. de 2026' },
  ])('labels overdue, undated, today, tomorrow and later groups in $locale', ({ locale, messages, futureLabel }) => {
    const labels: Record<string, string> = {
      'habits.overdue': messages.habits.overdue,
      'common.unknown': messages.common.unknown,
      'dates.today': messages.dates.today,
      'dates.tomorrow': messages.dates.tomorrow,
    }
    const translate = (key: string) => labels[key]!
    expect(['__overdue__', '', TODAY, '2026-09-13', '2026-09-14'].map((key) => formatHabitDateBucketLabel(key, TODAY, locale, translate))).toEqual([
      messages.habits.overdue, messages.common.unknown, messages.dates.today, messages.dates.tomorrow, futureLabel,
    ])
  })

  it('recognizes tomorrow across a year boundary', () => {
    expect(formatHabitDateBucketLabel('2027-01-01', '2026-12-31', 'en', (key) => key)).toBe('dates.tomorrow')
  })
})

import { describe, expect, it } from 'vitest'

import { selectAstraSuggestions } from '../utils/astra-suggestions'
import { makeHabitDetailScopedParent } from '../test-support/habit-detail-fixtures'
import type { NormalizedHabit } from '../types/habit'

const TODAY = '2026-08-28'

function makeTopLevelHabit(overrides: Partial<NormalizedHabit>): NormalizedHabit {
  return {
    ...makeHabitDetailScopedParent(),
    scheduledDates: [TODAY],
    instances: [],
    isLoggedInRange: false,
    isCompleted: false,
    hasSubHabits: false,
    isOverdue: false,
    ...overrides,
  }
}

function habitsNamed(topLevelHabits: NormalizedHabit[]) {
  const suggestions = selectAstraSuggestions(topLevelHabits, TODAY)
  return {
    logHabitTitle: suggestions.find((suggestion) => suggestion.id === 'logHabit')?.params?.habit ?? null,
    splitHabitTitle: suggestions.find((suggestion) => suggestion.id === 'splitHabit')?.params?.habit ?? null,
  }
}

describe('selectAstraSuggestions', () => {
  it('names the first habit due today that is not logged, and the first without sub-habits', () => {
    const walk = makeTopLevelHabit({ id: 'walk', title: 'Caminhar', position: 0 })
    const house = makeTopLevelHabit({
      id: 'house',
      title: 'Rotina da casa',
      position: 1,
      isLoggedInRange: true,
    })

    expect(selectAstraSuggestions([walk, house], TODAY)).toEqual([
      { id: 'logHabit', key: 'chat.suggestion.logHabit', params: { habit: 'Caminhar' } },
      { id: 'week', key: 'chat.suggestion.week' },
      { id: 'splitHabit', key: 'chat.suggestion.splitHabit', params: { habit: 'Caminhar' } },
      { id: 'goals', key: 'chat.suggestion.goals' },
    ])
  })

  it('skips a logged habit and a skipped habit when picking the log suggestion', () => {
    const logged = makeTopLevelHabit({ id: 'logged', title: 'Ler', isLoggedInRange: true })
    const skipped = makeTopLevelHabit({
      id: 'skipped',
      title: 'Alongar',
      instances: [{ date: TODAY, status: 'Completed', logId: null }],
    })
    const open = makeTopLevelHabit({ id: 'open', title: 'Caminhar' })

    expect(habitsNamed([logged, skipped, open]).logHabitTitle).toBe('Caminhar')
  })

  it('skips a habit that already has sub-habits when picking the split suggestion', () => {
    const parent = makeTopLevelHabit({ id: 'parent', title: 'Manhã', hasSubHabits: true })
    const leaf = makeTopLevelHabit({ id: 'leaf', title: 'Rotina da casa' })

    expect(habitsNamed([parent, leaf]).splitHabitTitle).toBe('Rotina da casa')
  })

  it('takes an overdue habit that is not scheduled today as the log suggestion', () => {
    const overdue = makeTopLevelHabit({ id: 'overdue', title: 'Correr', scheduledDates: [], isOverdue: true })

    expect(habitsNamed([overdue]).logHabitTitle).toBe('Correr')
  })

  it('leaves out the general bucket and a bad habit', () => {
    const general = makeTopLevelHabit({ id: 'general', title: 'Geral', isGeneral: true })
    const bad = makeTopLevelHabit({ id: 'bad', title: 'Fumar', isBadHabit: true })

    expect(habitsNamed([general, bad])).toEqual({
      logHabitTitle: null,
      splitHabitTitle: null,
    })
  })

  it('keeps only the week and the goals when the account has no habits', () => {
    expect(selectAstraSuggestions([], TODAY).map((suggestion) => suggestion.id)).toEqual(['week', 'goals'])
  })
})

import { describe, expect, it } from 'vitest'
import { createMockHabit, createMockProfile } from './factories'
import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'
import { buildComposerChips, type ComposerChipState } from '../chat/composer-chips'

const now = new Date('2026-09-12T12:00:00.000Z')
const pending = createMockHabit({ title: 'Reading' })
const overdue = createMockHabit({ id: 'overdue', title: 'Walking', isOverdue: true })
const parent = createMockHabit({ id: 'parent', title: 'House routine', hasSubHabits: true })

function state(overrides: Partial<ComposerChipState> = {}): ComposerChipState {
  return {
    surface: 'today', status: 'success', habits: [overdue, pending, parent],
    totalHabitCount: 3, profile: createMockProfile({ currentStreak: 0, longestStreak: 0, lastCompletionDate: null }), now,
    ...overrides,
  }
}

function ids(overrides: Partial<ComposerChipState> = {}) {
  return buildComposerChips(state(overrides)).map((chip) => chip.id)
}

describe('composer chips', () => {
  it('omits Today chips while loading or after an error', () => {
    expect(ids({ status: 'loading' })).toEqual([])
    expect(ids({ status: 'error' })).toEqual([])
  })

  it('selects the no habits, returning, all done, and default Today sets', () => {
    expect(ids({ habits: [], totalHabitCount: 0 })).toEqual([
      'today.buildMorningRoutine', 'today.startOneHabit', 'today.suggestThreeHabits', 'today.createEveningHabit',
    ])
    expect(ids({ profile: createMockProfile({ lastCompletionDate: '2026-09-08' }) })).toEqual([
      'today.logLastDays', 'today.resumeHabits', 'today.cutToTwo', 'today.changeTimes',
    ])
    expect(ids({ habits: [createMockHabit({ isCompleted: true, hasSubHabits: true })] })).toEqual([
      'today.logYesterday', 'today.createEveningHabit', 'today.changeTimes', 'today.reviewHabit',
    ])
    expect(ids()).toEqual(['today.moveOverdue', 'today.logHabit', 'today.logYesterday', 'today.pushTomorrow'])
    expect(buildComposerChips(state())[0]!.params).toEqual({ title: 'Walking' })
    expect(buildComposerChips(state())[1]!.params).toEqual({ title: 'Reading' })
  })

  it('puts a pending log first when a streak is at risk', () => {
    expect(ids({ habits: [pending], profile: createMockProfile({ currentStreak: 5, lastCompletionDate: null }) })[0]).toBe('today.logHabit')
  })

  it('does not treat a historical selected day as a streak at risk', () => {
    const profile = createMockProfile({ currentStreak: 5, lastCompletionDate: null })
    expect(ids({ habits: [overdue, pending], profile, selectedDateIsToday: false })[0]).toBe('today.moveOverdue')
    expect(ids({ habits: [pending], profile: createMockProfile({ lastCompletionDate: '2026-09-08' }), selectedDateIsToday: false })).not.toContain('today.resumeHabits')
  })

  it('applies the calendar, progress, profile, and detail premises', () => {
    expect(ids({ surface: 'calendar', profile: createMockProfile({ hasGoogleConnection: false }) })).toEqual([
      'today.logYesterday', 'calendar.slippedThisWeek', 'today.changeTimes',
    ])
    expect(ids({ surface: 'progress', habits: [createMockHabit({ linkedGoals: [{ id: 'goal', title: 'Goal' }] })] })).toEqual([
      'progress.trimGoals', 'progress.stuckThisWeek', 'today.logYesterday',
    ])
    expect(ids({ surface: 'profile', profile: createMockProfile({ aiSummaryEnabled: false }) })).toEqual([
      'profile.changeTimezone', 'profile.seePlan', 'profile.exportData',
    ])
    expect(ids({ surface: 'progress', habits: [] })).toEqual([
      'progress.stuckThisWeek', 'today.logYesterday', 'today.createMorningHabit',
    ])
    expect(buildComposerChips(state({ surface: 'habitDetail', detailHabit: { title: 'Reading', checklistItems: [] } }))).toEqual([
      { id: 'habitDetail.askAstra', key: 'shell.composer.chips.habitDetail.askAstra', params: { title: 'Reading' }, promptKey: 'habits.detail.askAstraSeedDefault' },
      { id: 'habitDetail.pauseThisWeek', key: 'shell.composer.chips.habitDetail.pauseThisWeek' },
      { id: 'habitDetail.rename', key: 'shell.composer.chips.habitDetail.rename' },
    ])
  })

  it('keeps the Progress goal request when a draft already exists', () => {
    const chips = buildComposerChips(state({
      surface: 'progress',
      contextualSuggestion: { id: 'progress-create-goal', label: 'Create a goal', prompt: 'Help me make a goal' },
    }))
    expect(chips[0]).toEqual({
      id: 'progress-create-goal', key: 'progressScreen.goals.createAction',
      label: 'Create a goal', prompt: 'Help me make a goal',
    })
    expect(chips).toHaveLength(4)
  })

  it('has localized text for every chip and interpolates habit titles', () => {
    const fixtures = [
      state(),
      state({ habits: [], totalHabitCount: 0 }),
      state({ profile: createMockProfile({ lastCompletionDate: '2026-09-08' }) }),
      state({ habits: [createMockHabit({ isCompleted: true, hasSubHabits: true })] }),
      state({ surface: 'calendar' }),
      state({ surface: 'progress' }),
      state({ surface: 'profile' }),
      state({ surface: 'habitDetail', detailHabit: { title: 'Reading', checklistItems: [] } }),
    ]
    for (const locale of [en, ptBR]) {
      for (const fixture of fixtures) {
        for (const chip of buildComposerChips(fixture)) {
          const [, , , group, name] = chip.key.split('.')
          const template = locale.shell.composer.chips[group as keyof typeof locale.shell.composer.chips]
          const value = template[name as keyof typeof template]
          expect(typeof value).toBe('string')
          const rendered = String(value).replace('{title}', chip.params?.title ?? '')
          expect(rendered).not.toContain('{title}')
          expect(rendered).not.toContain('shell.composer.chips')
        }
      }
    }
  })

  it('never returns one, two, or more than six chips', () => {
    for (const surface of ['today', 'calendar', 'progress', 'profile', 'habitDetail'] as const) {
      for (const status of ['loading', 'error', 'success'] as const) {
        for (const habits of [[], [pending], [overdue, pending, parent]]) {
          const count = buildComposerChips(state({ surface, status, habits, detailHabit: { title: 'Reading', checklistItems: [] } })).length
          expect(count === 0 || (count >= 3 && count <= 6)).toBe(true)
        }
      }
    }
  })
})

import { describe, expect, it } from 'vitest'
import { createMockHabit, createMockProfile } from './factories'
import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'
import { buildComposerChips, resolveComposerChipSurface, resolveComposerDockSuggestions, resolveComposerStripLayout, type ComposerChipState } from '../chat/composer-chips'
import { toComposerSuggestions } from '../contracts/composer'

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
  it('accepts two suggestions with their callbacks and rejects one or seven', () => {
    const suggestions = buildComposerChips(state({ surface: 'habitDetail', detailHabit: { title: 'Reading', checklistItems: [] } }))
      .filter(chip => chip.id !== 'habitDetail.askAstra')
      .map(chip => ({ id: chip.id, label: chip.key, onSelect: () => chip.id }))
    const accepted = toComposerSuggestions(suggestions)
    expect(accepted.map(chip => chip.id)).toEqual(['habitDetail.pauseThisWeek', 'habitDetail.rename'])
    expect(accepted.map(chip => chip.onSelect())).toEqual(['habitDetail.pauseThisWeek', 'habitDetail.rename'])
    expect(() => toComposerSuggestions(suggestions.slice(0, 1))).toThrow()
    expect(() => toComposerSuggestions(Array(7).fill(suggestions[0]))).toThrow()
  })

  it('moves Today chips out of the dock while retaining habit detail chips and callbacks', () => {
    const suggestions = toComposerSuggestions(buildComposerChips(state()).map((chip) => ({
      id: chip.id, label: chip.key, onSelect: () => chip.id,
    })))
    expect(resolveComposerDockSuggestions('/', suggestions)).toEqual([])
    expect(resolveComposerDockSuggestions('/habits/reading', suggestions)).toBe(suggestions)
  })
  it.each([
    ['/habits/new', 'today'],
    ['/habits/reading', 'habitDetail'],
    ['/habits/newer', 'habitDetail'],
    ['/', 'today'],
    ['/calendar', 'calendar'],
    ['/progress', 'progress'],
    ['/profile', 'profile'],
  ] as const)('resolves the shell query surface for %s as %s', (pathname, expected) => {
    expect(resolveComposerChipSurface(pathname)).toBe(expected)
  })

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
      'today.pauseWhatDoesNotFit', 'today.keepOnlyHabit',
    ])
    expect(ids({ habits: [createMockHabit({ isCompleted: true, hasSubHabits: true })] })).toEqual([
      'today.logYesterday', 'today.createEveningHabit', 'today.changeTimes', 'today.reviewHabit',
    ])
    expect(ids()).toEqual([
      'today.moveOverdue', 'today.logHabit', 'today.logYesterday', 'today.pushTomorrow',
      'today.trimHabit', 'today.createMorningHabit',
    ])
    expect(buildComposerChips(state())[0]!.params).toEqual({ title: 'Walking' })
    expect(buildComposerChips(state())[1]!.params).toEqual({ title: 'Reading' })
  })

  it('puts a pending log first when a streak is at risk', () => {
    expect(ids({ habits: [pending], profile: createMockProfile({ currentStreak: 5, lastCompletionDate: null }) })[0]).toBe('today.logHabit')
  })

  it('offers trimming a pending parent on Today', () => {
    const chips = buildComposerChips(state())
    expect(chips.find((chip) => chip.id === 'today.trimHabit')?.params).toEqual({ title: 'House routine' })
  })

  it('offers creating a morning habit alongside a pending parent on Today', () => {
    expect(ids()).toContain('today.createMorningHabit')
  })

  it('offers pausing what does not fit to a returning account', () => {
    expect(ids({ profile: createMockProfile({ lastCompletionDate: '2026-09-08' }) })).toContain('today.pauseWhatDoesNotFit')
  })

  it('offers keeping one named habit to a returning account', () => {
    const chips = buildComposerChips(state({ profile: createMockProfile({ lastCompletionDate: '2026-09-08' }) }))
    expect(chips.find((chip) => chip.id === 'today.keepOnlyHabit')?.params).toEqual({ title: 'Walking' })
  })

  it('keeps every Today variant within the drawn three-to-six-chip range', () => {
    const returning = createMockProfile({ lastCompletionDate: '2026-09-08' })
    const variants = [
      state(),
      state({ habits: [pending], totalHabitCount: 1 }),
      state({ habits: [parent], totalHabitCount: 1 }),
      state({ habits: [], totalHabitCount: 3 }),
      state({ profile: returning }),
      state({ habits: [], profile: returning }),
      state({ habits: [], totalHabitCount: 0 }),
      state({ habits: [createMockHabit({ isCompleted: true })] }),
    ]
    for (const variant of variants) {
      const count = buildComposerChips(variant).length
      expect(count).toBeGreaterThanOrEqual(3)
      expect(count).toBeLessThanOrEqual(6)
    }
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
      { id: 'habitDetail.pauseThisWeek', key: 'shell.composer.chips.habitDetail.pauseThisWeek', params: { title: 'Reading' }, promptKey: 'shell.composer.prompts.habitDetail.pauseThisWeek' },
      { id: 'habitDetail.rename', key: 'shell.composer.chips.habitDetail.rename', params: { title: 'Reading' }, promptKey: 'shell.composer.prompts.habitDetail.rename' },
    ])
  })

  it.each(['Ler', 'Read with "quotes" and accents á '.repeat(5)])('names the open habit in rename and pause requests for %s', title => {
    const chips = buildComposerChips(state({ surface: 'habitDetail', detailHabit: { title, checklistItems: [] } }))
    for (const action of ['rename', 'pauseThisWeek'] as const) {
      const chip = chips.find(candidate => candidate.id === `habitDetail.${action}`)!
      expect(chip.params?.title).toBe(title)
      expect(chip.promptKey).toBe(`shell.composer.prompts.habitDetail.${action}`)
      for (const locale of [en, ptBR]) {
        const prompts: Record<string, Record<string, string>> = locale.shell.composer.prompts
        const prompt = prompts.habitDetail![action]!
        expect(prompt.match(/\{title\}/g)).toHaveLength(1)
        expect(prompt.replace('{title}', chip.params!.title)).toContain(title)
        expect(locale.shell.composer.chips.habitDetail[action]).not.toContain('{title}')
      }
    }
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

  it.each([en, ptBR])('separates short labels from requests with complete habit titles', locale => {
    const title = 'A habit title with spaces, "quotes", accents and '.repeat(5)
    const habit = createMockHabit({ title, hasSubHabits: true, isOverdue: true })
    const variants = [
      state({ habits: [habit] }),
      state({ habits: [habit], profile: createMockProfile({ lastCompletionDate: '2026-09-08' }) }),
      state({ habits: [{ ...habit, isCompleted: true }] }),
      state({ surface: 'progress', habits: [habit] }),
    ]
    const chips = variants.flatMap(buildComposerChips).filter(chip => chip.params)
    expect(new Set(chips.map(chip => chip.id)).size).toBe(6)
    for (const chip of chips) {
      const [, , , group, name] = chip.key.split('.')
      const labels = locale.shell.composer.chips[group as keyof typeof locale.shell.composer.chips]
      expect(labels[name as keyof typeof labels]).not.toContain('{title}')
      expect(chip.params?.title).toBe(title)
      expect(chip.promptKey).toBe(`shell.composer.prompts.${chip.id}`)
      const prompts: Record<string, string> = locale.shell.composer.prompts[group as keyof typeof locale.shell.composer.prompts]
      const prompt = prompts[name!]!
      expect(prompt.replace('{title}', chip.params!.title)).toContain(title)
      expect(prompt.match(/\{title\}/g)).toHaveLength(1)
    }
  })

  it.each(['today', 'calendar', 'progress', 'profile', 'habitDetail'] as const)('returns the required chip count on %s', surface => {
    for (const status of ['loading', 'error', 'success'] as const) {
      for (const habits of [[], [pending], [overdue, pending, parent]]) {
        const count = buildComposerChips(state({ surface, status, habits, detailHabit: { title: 'Reading', checklistItems: [] } })).length
        if (surface === 'habitDetail') {
          expect(count).toBe(status === 'success' ? 2 : 0)
        } else {
          expect(count === 0 || (count >= 3 && count <= 6)).toBe(true)
        }
      }
    }
  })
})


describe('composer strip layout', () => {
  it('keeps the full row when chips fit or measurements are still arriving', () => {
    expect(resolveComposerStripLayout(320, [80, 80, 80])).toEqual({ visibleWidth: 320, firstChipMinWidth: 0 })
    expect(resolveComposerStripLayout(320, [80, 0, 80])).toEqual({ visibleWidth: 320, firstChipMinWidth: 0 })
    expect(resolveComposerStripLayout(320, [])).toEqual({ visibleWidth: 320, firstChipMinWidth: 0 })
  })

  it('resolves natural widths independently of previous allocations', () => {
    const naturalWidths = [111, 154, 105]
    const freshNarrow = resolveComposerStripLayout(288, naturalWidths)
    const freshWide = resolveComposerStripLayout(427, naturalWidths)
    expect(freshNarrow).toEqual({ visibleWidth: 288, firstChipMinWidth: 256 })
    expect(freshWide).toEqual({ visibleWidth: 427, firstChipMinWidth: 0 })
    for (const width of [288, 427, 288, 427]) {
      expect(resolveComposerStripLayout(width, naturalWidths)).toEqual(width === 288 ? freshNarrow : freshWide)
      expect(naturalWidths).toEqual([111, 154, 105])
    }
  })

  it('keeps every chip reachable and the next chip peeking across every compact width', () => {
    for (let width = 320; width <= 1023; width++) for (const scale of [1, 2]) {
      for (const naturalWidths of [[180, 200, 160], [424, 367, 307, 313], [80, 800, 120], [160, 140, 120, 180, 160, 140]]) {
        const available = width - 32
        const chipWidths = naturalWidths.map(size => Math.min(size * scale, available - 32))
        const total = chipWidths.reduce((sum, size) => sum + size, (chipWidths.length - 1) * 8)
        const layout = resolveComposerStripLayout(available, chipWidths)
        expect(layout.visibleWidth).toBe(available)
        if (total <= available) {
          expect(layout.visibleWidth).toBe(available)
          continue
        }
        chipWidths[0] = Math.max(chipWidths[0]!, layout.firstChipMinWidth)
        const starts = chipWidths.map((_, index) => chipWidths.slice(0, index).reduce((sum, size) => sum + size + 8, 0))
        const partial = starts.findIndex((start, index) => start < layout.visibleWidth && start + chipWidths[index]! > layout.visibleWidth)
        expect(partial).toBeGreaterThan(0)
        expect(layout.visibleWidth - starts[partial]!).toBe(24)
        expect(layout.visibleWidth).toBeLessThanOrEqual(available)
        expect(chipWidths.every(size => size <= layout.visibleWidth)).toBe(true)
      }
    }
  })
})

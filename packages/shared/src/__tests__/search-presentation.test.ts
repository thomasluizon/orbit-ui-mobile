import { describe, expect, it } from 'vitest'
import { buildSearchEntries, buildSearchMatchLines, buildSearchSections, buildSearchHabitStatus } from '../utils/search-presentation'
import { createMockHabit } from './factories'
import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'

const child = createMockHabit({ id: 'child', title: 'Walk', parentId: 'parent', searchMatches: [{ field: 'title', value: null }] })
const parent = createMockHabit({ id: 'parent', title: 'Routine', hasSubHabits: true, searchMatches: [{ field: 'child', value: 'Walk' }] })
const collection = { topLevelHabits: [parent], habitsById: new Map([[parent.id, parent], [child.id, child]]), childrenByParent: new Map([[parent.id, [child.id]]]) }

describe('search presentation', () => {
  it('puts actionable results before past results and preserves completed task page order', () => {
    const habits = [
      createMockHabit({ id: 'logged', isLoggedInRange: true }),
      createMockHabit({ id: 'skipped', isSkippedOnDate: true }),
      createMockHabit({ id: 'past-task', frequencyUnit: null, dueDate: '2026-08-01' }),
      createMockHabit({ id: 'general', isGeneral: true, frequencyUnit: null }),
      createMockHabit({ id: 'future', dueDate: '2026-11-01', scheduledDates: ['2026-11-01'] }),
      createMockHabit({ id: 'overdue', isOverdue: true }),
      createMockHabit({ id: 'today', dueDate: '2026-10-31', scheduledDates: ['2026-10-31'] }),
      createMockHabit({ id: 'recent', frequencyUnit: null, isCompleted: true, completedOn: '2026-09-30', position: 9 }),
      createMockHabit({ id: 'older', frequencyUnit: null, isCompleted: true, completedOn: '2026-08-01', position: 0 }),
      createMockHabit({ id: 'unknown', frequencyUnit: null, isCompleted: true, completedOn: null }),
    ]
    const source = { ...collection, topLevelHabits: habits }
    const entries = buildSearchEntries(source, 'coders', null, '2026-10-31')
    expect(entries.map(({ habit }) => habit.id)).toEqual(['today', 'overdue', 'future', 'general', 'logged', 'skipped', 'past-task', 'recent', 'older', 'unknown'])
    expect(new Set(entries.map(({ habit }) => habit.id)).size).toBe(habits.length)
    const sections = buildSearchSections(entries)
    expect(sections.map(({ id, entries }) => [id, entries.map(({ habit }) => habit.id)])).toEqual([
      ['habits', ['today', 'overdue', 'future', 'general', 'logged', 'skipped', 'past-task']],
      ['completed', ['recent', 'older', 'unknown']],
    ])
    expect(source.topLevelHabits).toBe(habits)
    expect(habits[0]!.id).toBe('logged')
    expect(buildSearchSections(entries.slice(-3)).map(({ id }) => id)).toEqual(['completed'])
    expect(buildSearchSections([])).toEqual([])
  })

  it.each(['en', 'pt-BR'])('labels completed, skipped and past items without inventing a completion date in %s', (locale) => {
    const translate = (key: string, values?: Record<string, string | number | Date>) => {
      const messages = locale === 'en' ? en : ptBR
      const template = key.split('.').reduce<unknown>((value, part) => (value as Record<string, unknown>)[part], messages) as string
      return template.replace('{when}', String(values?.when ?? ''))
    }
    const status = (overrides: Parameters<typeof createMockHabit>[0]) => buildSearchHabitStatus(createMockHabit(overrides), translate, locale, '2026-10-31')
    expect(status({ frequencyUnit: null, isCompleted: true, completedOn: '2026-09-30' })).toEqual({ kind: 'done', label: locale === 'en' ? 'Done 1 month ago' : 'Feito há 1 mês' })
    expect(status({ isLoggedInRange: true, instances: [{ date: '2026-10-30', status: 'Completed', logId: 'positive-log' }] })?.label).toBe(locale === 'en' ? 'Done 1 day ago' : 'Feito há 1 dia')
    expect(status({ isLoggedInRange: true, instances: [{ date: '2026-10-31', status: 'Completed', logId: 'positive-log' }] })?.label).toBe(locale === 'en' ? 'Done today' : 'Feito hoje')
    expect(status({ isCompleted: true, completedOn: null })?.label).toBe(locale === 'en' ? 'Done' : 'Feito')
    expect(status({ isSkippedOnDate: true })).toEqual({ kind: 'skip', label: locale === 'en' ? 'Skipped' : 'Pulado' })
    expect(status({ isSkippedOnDate: true, isLoggedInRange: true })?.kind).toBe('done')
    expect(status({ frequencyUnit: null, dueDate: '2026-08-01' })).toEqual({ kind: 'past', label: locale === 'en' ? 'Overdue' : 'Atrasado' })
    expect(status({ frequencyUnit: null, dueDate: '2026-08-01', isOverdue: true })).toBeNull()
    expect(status({ isGeneral: true, frequencyUnit: null })).toBeNull()
    expect(status({})).toBeNull()
  })

  it('keeps completed General and flexible habits outside the completed task section', () => {
    const habits = [
      createMockHabit({ id: 'general', frequencyUnit: null, isGeneral: true, isCompleted: true }),
      createMockHabit({ id: 'flexible', frequencyUnit: null, isFlexible: true, isCompleted: true }),
      createMockHabit({ id: 'task', frequencyUnit: null, isCompleted: true }),
    ]
    const sections = buildSearchSections(habits.map((habit) => ({ habit, parentTitle: null })))
    expect(sections.map(({ id, entries }) => [id, entries.map(({ habit }) => habit.id)])).toEqual([
      ['habits', ['general', 'flexible']], ['completed', ['task']],
    ])
  })

  it('keeps parent search results but targets matching descendants in action pickers', () => {
    expect(buildSearchEntries(collection, 'walk', null)).toEqual([{ habit: parent, parentTitle: null }])
    for (const page of ['log', 'skip'] as const) expect(buildSearchEntries(collection, 'walk', page)).toEqual([{ habit: child, parentTitle: 'Routine' }])
    expect(buildSearchEntries(collection, '', null).map(({ habit }) => habit.id)).toEqual(['parent', 'child'])
    expect(buildSearchEntries(undefined, 'walk', null)).toEqual([])
  })

  it.each([en, ptBR])('formats match reasons with stable identities in each locale', (messages) => {
    const habit = createMockHabit({ searchMatches: [{ field: 'title', value: null }, { field: 'description', value: null }, { field: 'tag', value: 'walking' }, { field: 'child', value: 'Walk' }] })
    const translate = (key: string) => messages.habits.search[key.slice('habits.search.'.length) as keyof typeof messages.habits.search] as string
    const lines = buildSearchMatchLines('walk', habit, translate)
    expect(lines.map((line) => line.label)).toEqual([messages.habits.search.matchTitle, messages.habits.search.matchDescription, messages.habits.search.matchTag, messages.habits.search.matchChild])
    expect(lines.map((line) => line.fragment)).toEqual([null, null, '“walking”', '“Walk”'])
    expect(lines.map((line) => line.text)).toEqual([messages.habits.search.matchTitle, messages.habits.search.matchDescription, messages.habits.search.matchTag + ' “walking”', messages.habits.search.matchChild + ' “Walk”'])
    expect(new Set(lines.map((line) => line.id)).size).toBe(4)
    const reordered = buildSearchMatchLines('walk', { searchMatches: [...habit.searchMatches!].reverse() }, translate)
    expect(reordered.map((line) => line.id)).toEqual(lines.map((line) => line.id).reverse())
    expect(buildSearchMatchLines('', habit, translate)).toEqual([])
    expect(buildSearchMatchLines('walk', { searchMatches: null }, translate)).toEqual([])
  })
})

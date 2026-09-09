import { describe, expect, it } from 'vitest'
import { buildSearchEntries, buildSearchMatchLines } from '../utils/search-presentation'
import { createMockHabit } from './factories'
import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'

const child = createMockHabit({ id: 'child', title: 'Walk', parentId: 'parent', searchMatches: [{ field: 'title', value: null }] })
const parent = createMockHabit({ id: 'parent', title: 'Routine', hasSubHabits: true, searchMatches: [{ field: 'child', value: 'Walk' }] })
const collection = { topLevelHabits: [parent], habitsById: new Map([[parent.id, parent], [child.id, child]]), childrenByParent: new Map([[parent.id, [child.id]]]) }

describe('search presentation', () => {
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

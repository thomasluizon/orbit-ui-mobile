import type { NormalizedHabit } from '../types/habit'
import { buildCommandHabitList, type CommandHabitEntry } from './command-habit-list'
import { computeHabitMatchBadges } from './habit-card-helpers'
import type { SearchCommandPage } from './search-commands'

const MATCH_KEYS = {
  title: 'habits.search.matchTitle', description: 'habits.search.matchDescription',
  tag: 'habits.search.matchTag', child: 'habits.search.matchChild',
} as const

export interface SearchMatchLine {
  id: string
  label: string
  fragment: string | null
  text: string
}

export function buildSearchEntries(
  collection: Parameters<typeof buildCommandHabitList>[0] | undefined,
  query: string,
  page: SearchCommandPage,
): CommandHabitEntry[] {
  if (!collection) return []
  if (query.length > 0 && page === null) return collection.topLevelHabits.map((habit) => ({ habit, parentTitle: null }))
  return buildCommandHabitList(collection, query)
}

export function buildSearchMatchLines(
  query: string,
  habit: Pick<NormalizedHabit, 'searchMatches'>,
  translate: (key: string) => string,
): SearchMatchLine[] {
  return computeHabitMatchBadges(query, habit).map(({ field, value }) => {
    const label = translate(MATCH_KEYS[field])
    const fragment = value === null ? null : `“${value}”`
    return { id: JSON.stringify([field, value]), label, fragment, text: fragment === null ? label : `${label} ${fragment}` }
  })
}

import { formatConjunctionList } from './conjunction-list'

/** One habit as the tag line reads it: its title and the ids of its tags. */
export interface TagLineHabit {
  title: string
  tags: readonly { id: string }[]
}

export type TagLineItems =
  | { kind: 'items'; items: string }
  | { kind: 'empty' }

const NAMED_ITEMS = 3

/**
 * The `{items}` of the line `{tag} já tem {items}.`, read on the device from the cache that holds every habit.
 * Up to three titles are named; the rest become one count phrase at the end of the list.
 * Returns null when no cache holds every habit, so the caller shows no line instead of a guess.
 */
export function buildTagLineItems(
  tagId: string,
  habits: readonly TagLineHabit[] | undefined,
  locale: string,
  moreLabel: (count: number) => string,
): TagLineItems | null {
  if (!habits) return null
  const titles = habits.filter((habit) => habit.tags.some((tag) => tag.id === tagId)).map((habit) => habit.title)
  if (titles.length === 0) return { kind: 'empty' }
  return { kind: 'items', items: joinNamedItems(titles, locale, moreLabel) }
}

/** Names up to three items as one list in the person's language, and counts the rest in one phrase at the end. Android Hermes has no `Intl.ListFormat`, so the list goes through the shared conjunction adapter. */
export function joinNamedItems(names: readonly string[], locale: string, moreLabel: (count: number) => string): string {
  const named = names.slice(0, NAMED_ITEMS)
  const rest = names.length - named.length
  return formatConjunctionList(rest > 0 ? [...named, moreLabel(rest)] : named, locale)
}

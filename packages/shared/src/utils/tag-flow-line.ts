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
 * Up to three titles go through `Intl.ListFormat`; the rest become one count phrase at the end of the list.
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
  const named = titles.slice(0, NAMED_ITEMS)
  const rest = titles.length - named.length
  const parts = rest > 0 ? [...named, moreLabel(rest)] : named
  return { kind: 'items', items: new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(parts) }
}

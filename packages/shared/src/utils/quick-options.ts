/**
 * The quick options of a flow step: the items the person chose when the step opened come first, then the others in
 * their own order, cut at `count`. A choice made inside the step does not move a row, so a press never shifts the list.
 */
export function leadingQuickOptions<Item extends { id: string }>(items: readonly Item[], leading: ReadonlySet<string>, count: number): Item[] {
  return [...items.filter((item) => leading.has(item.id)), ...items.filter((item) => !leading.has(item.id))].slice(0, count)
}

/** The items whose title holds the typed words, with no regard to case. An empty search finds nothing, so the step shows only its quick options. */
export function searchByTitle<Item extends { title: string }>(items: readonly Item[], query: string): Item[] {
  const term = query.trim().toLocaleLowerCase()
  return term ? items.filter((item) => item.title.toLocaleLowerCase().includes(term)) : []
}

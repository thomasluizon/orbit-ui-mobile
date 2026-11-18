import { describe, expect, it } from 'vitest'
import { leadingQuickOptions, searchByTitle } from '../utils/quick-options'

const item = (id: string, title = id) => ({ id, title })

describe('quick options of a flow step', () => {
  const items = [item('a'), item('b'), item('c'), item('d'), item('e')]

  it('puts the items chosen at the open first, keeps the order of the rest and cuts at the count', () => {
    expect(leadingQuickOptions(items, new Set(['d', 'b']), 3).map(({ id }) => id)).toEqual(['b', 'd', 'a'])
  })

  it('shows the first items in their own order when nothing was chosen, and every item when the list is short', () => {
    expect(leadingQuickOptions(items, new Set(), 3).map(({ id }) => id)).toEqual(['a', 'b', 'c'])
    expect(leadingQuickOptions(items.slice(0, 2), new Set(), 4).map(({ id }) => id)).toEqual(['a', 'b'])
    expect(leadingQuickOptions([], new Set(['a']), 3)).toEqual([])
  })

  it('ignores a chosen id that is no longer in the list', () => {
    expect(leadingQuickOptions(items, new Set(['gone', 'e']), 2).map(({ id }) => id)).toEqual(['e', 'a'])
  })
})

describe('search by title', () => {
  const goals = [item('1', 'Run 5 km'), item('2', 'Read 12 books'), item('3', 'Ler a Bíblia')]

  it('finds each title that holds the typed words, with no regard to case or the outer spaces', () => {
    expect(searchByTitle(goals, '  RUN ').map(({ id }) => id)).toEqual(['1'])
    expect(searchByTitle(goals, 'bí').map(({ id }) => id)).toEqual(['3'])
    expect(searchByTitle(goals, 're').map(({ id }) => id)).toEqual(['2'])
  })

  it('finds nothing for an empty search and for words no title holds', () => {
    expect(searchByTitle(goals, '   ')).toEqual([])
    expect(searchByTitle(goals, 'swim')).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import { createHabitViewSearchState, updateHabitViewSearch } from '../hooks/habit-view-search-core'

describe('scoped habit search', () => {
  it.each(['today', 'all', 'general'])('publishes trimmed search text only when the %s debounce flushes', (view) => {
    const initial = createHabitViewSearchState(view)
    expect(initial).toEqual({ view, open: false, text: '', query: '' })
    const opened = updateHabitViewSearch(initial, { type: 'toggle' })
    const typed = updateHabitViewSearch(opened, { type: 'text', text: '  walk  ' })
    expect(typed).toEqual({ view, open: true, text: '  walk  ', query: '' })
    const searched = updateHabitViewSearch(typed, { type: 'flush', view })
    expect(searched).toEqual({ view, open: true, text: '  walk  ', query: 'walk' })
    expect(updateHabitViewSearch(searched, { type: 'toggle' })).toEqual(initial)
  })

  it('clears search on close and rejects a stale flush from the previous view', () => {
    const typed = updateHabitViewSearch(createHabitViewSearchState('all'), { type: 'text', text: 'walk' })
    const closed = updateHabitViewSearch(typed, { type: 'close' })
    expect(updateHabitViewSearch(closed, { type: 'flush', view: 'all' })).toEqual({
      view: 'all', open: false, text: '', query: '',
    })
    const next = updateHabitViewSearch(createHabitViewSearchState('general'), { type: 'text', text: 'read' })
    expect(updateHabitViewSearch(next, { type: 'flush', view: 'all' })).toEqual({
      view: 'general', open: false, text: 'read', query: '',
    })
    expect(updateHabitViewSearch(next, { type: 'flush', view: 'general' }).query).toBe('read')
  })

  it('removes a previous query when its replacement contains only whitespace', () => {
    const searched = { view: 'all', open: true, text: 'walk', query: 'walk' }
    const cleared = updateHabitViewSearch(searched, { type: 'text', text: '   ' })
    expect(updateHabitViewSearch(cleared, { type: 'flush', view: 'all' })).toEqual({
      view: 'all', open: true, text: '   ', query: '',
    })
  })
})

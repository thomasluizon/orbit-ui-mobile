import { beforeEach, describe, expect, it } from 'vitest'
import {
  canGoBackInAppHistory,
  createAppNavigationEntry,
  readAppNavigationHistory,
  updateAppNavigationHistory,
} from '@/lib/app-navigation-history'

const STORAGE_KEY = 'orbit-app-navigation-history'

describe('app navigation history', () => {
  beforeEach(() => {
    globalThis.sessionStorage.clear()
  })

  it('creates navigation entries with or without a search string', () => {
    expect(createAppNavigationEntry('/today', '')).toBe('/today')
    expect(createAppNavigationEntry('/today', 'date=2026-04-06')).toBe('/today?date=2026-04-06')
  })

  it('returns an empty state when the stored payload is missing or invalid', () => {
    expect(readAppNavigationHistory()).toEqual({ entries: [], index: -1 })

    globalThis.sessionStorage.setItem(STORAGE_KEY, '{invalid-json')
    expect(readAppNavigationHistory()).toEqual({ entries: [], index: -1 })

    globalThis.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ entries: [''], index: 'nope' }),
    )
    expect(readAppNavigationHistory()).toEqual({ entries: [], index: -1 })
  })

  it('filters invalid entries and clamps the stored index', () => {
    globalThis.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        entries: ['/today', '', 42, '/goals'],
        index: 99,
      }),
    )

    expect(readAppNavigationHistory()).toEqual({
      entries: ['/today', '/goals'],
      index: 1,
    })
  })

  it('initializes, replaces, and pushes entries', () => {
    updateAppNavigationHistory('/today', 'init')
    updateAppNavigationHistory('/calendar', 'push')
    updateAppNavigationHistory('/calendar', 'push')
    updateAppNavigationHistory('/calendar?date=2026-04-06', 'replace')

    expect(readAppNavigationHistory()).toEqual({
      entries: ['/today', '/calendar?date=2026-04-06'],
      index: 1,
    })
    expect(canGoBackInAppHistory()).toBe(true)
  })

  it('moves backward, forward, and jumps to known entries on pop', () => {
    updateAppNavigationHistory('/today', 'init')
    updateAppNavigationHistory('/calendar', 'push')
    updateAppNavigationHistory('/goals', 'push')

    updateAppNavigationHistory('/calendar', 'pop')
    expect(readAppNavigationHistory()).toEqual({
      entries: ['/today', '/calendar', '/goals'],
      index: 1,
    })

    updateAppNavigationHistory('/goals', 'pop')
    expect(readAppNavigationHistory()).toEqual({
      entries: ['/today', '/calendar', '/goals'],
      index: 2,
    })

    updateAppNavigationHistory('/today', 'pop')
    expect(readAppNavigationHistory()).toEqual({
      entries: ['/today', '/calendar', '/goals'],
      index: 0,
    })
    expect(canGoBackInAppHistory()).toBe(false)
  })

  it('falls back to appending unknown pop targets and trims to the max size', () => {
    updateAppNavigationHistory('/page-0', 'init')
    for (let index = 1; index <= 54; index += 1) {
      updateAppNavigationHistory(`/page-${index}`, 'push')
    }

    updateAppNavigationHistory('/brand-new', 'pop')

    const state = readAppNavigationHistory()
    expect(state.entries).toHaveLength(50)
    expect(state.entries[0]).toBe('/page-6')
    expect(state.entries.at(-1)).toBe('/brand-new')
    expect(state.index).toBe(49)
  })
})

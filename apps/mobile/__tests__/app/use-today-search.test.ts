import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Keyboard } from 'react-native'
import { useTodaySearch, type TodaySearch } from '@/app/(tabs)/use-today-search'
import {
  useTodayViewSync,
  type TodayViewSyncParams,
} from '@/app/(tabs)/use-today-view-sync'
import { useUIStore } from '@/stores/ui-store'

const TestRenderer = require('react-test-renderer')
const viewSyncCallbacks = {
  setShowScrollTop: vi.fn(),
  setRenderBulkActionBar: vi.fn(),
  setActiveView: vi.fn(),
  setFilters: vi.fn(),
}
const emptyFilters = {}

function renderTodaySearch(): TodaySearch {
  let current!: TodaySearch

  function Probe() {
    current = useTodaySearch()
    return null
  }

  TestRenderer.act(() => {
    TestRenderer.create(React.createElement(Probe))
  })

  return current
}

describe('useTodaySearch (mobile)', () => {
  beforeEach(() => {
    useUIStore.setState({ searchQuery: 'focus' })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    useUIStore.setState({ searchQuery: '' })
  })

  it('dismisses the soft keyboard when an open search closes', () => {
    const dismissSpy = vi.spyOn(Keyboard, 'dismiss')
    const search = renderTodaySearch()

    TestRenderer.act(() => {
      search.toggleSearch()
    })
    TestRenderer.act(() => {
      search.closeSearch()
    })

    expect(dismissSpy).toHaveBeenCalledOnce()
    expect(useUIStore.getState().searchQuery).toBe('')
  })

  it('defers view-change keyboard dismissal until after render commits', () => {
    let currentSearch!: TodaySearch
    let isRendering = false
    const dismissRenderPhases: boolean[] = []
    const dismissSpy = vi
      .spyOn(Keyboard, 'dismiss')
      .mockImplementation(() => dismissRenderPhases.push(isRendering))

    function Probe({ currentActiveView }: Pick<TodayViewSyncParams, 'currentActiveView'>) {
      isRendering = true
      const search = useTodaySearch()
      useTodayViewSync({
        currentActiveView,
        isSelectMode: false,
        pinnedDateStr: null,
        filters: emptyFilters,
        ...viewSyncCallbacks,
        closeSearch: search.closeSearch,
      })
      currentSearch = search
      isRendering = false
      return null
    }

    let renderer!: { update(element: React.ReactNode): void }
    TestRenderer.act(() => {
      renderer = TestRenderer.create(
        React.createElement(Probe, { currentActiveView: 'today' }),
      )
    })
    TestRenderer.act(() => {
      currentSearch.toggleSearch()
    })
    TestRenderer.act(() => {
      renderer.update(React.createElement(Probe, { currentActiveView: 'all' }))
    })

    expect(dismissSpy).toHaveBeenCalledOnce()
    expect(dismissRenderPhases).toEqual([false])
  })
})

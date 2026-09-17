import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useTodayViewSync, type TodayViewSyncParams } from '@/app/(app)/use-today-view-sync'

function makeParams(
  overrides: Partial<TodayViewSyncParams> = {},
): TodayViewSyncParams {
  return {
    pinnedDateStr: null,
    searchQueryStore: '',
    activeView: 'today',
    isSelectMode: false,
    setActiveView: vi.fn(),
    setLocalSearchQuery: vi.fn(),
    closeSearch: vi.fn(),
    clearSelection: vi.fn(),
    ...overrides,
  }
}

describe('useTodayViewSync', () => {
  it('clears the search query when a pinned date is deep-linked', () => {
    const closeSearch = vi.fn()
    const initial = makeParams({ closeSearch })
    const { rerender } = renderHook((props: TodayViewSyncParams) => useTodayViewSync(props), {
      initialProps: initial,
    })

    rerender(makeParams({ closeSearch, pinnedDateStr: '2026-07-20' }))

    expect(closeSearch).toHaveBeenCalledTimes(1)
  })

  it('clears the search query when the active view changes', () => {
    const closeSearch = vi.fn()
    const initial = makeParams({ closeSearch })
    const { rerender } = renderHook((props: TodayViewSyncParams) => useTodayViewSync(props), {
      initialProps: initial,
    })

    rerender(makeParams({ closeSearch, activeView: 'all' }))

    expect(closeSearch).toHaveBeenCalledTimes(1)
  })
})

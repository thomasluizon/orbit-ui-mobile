import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

const setSearchQuery = vi.fn()
const storeState = { searchQuery: '', setSearchQuery }

vi.mock('@/stores/ui-store', () => ({
  useUIStore: (selector: (state: typeof storeState) => unknown) => selector(storeState),
}))

import { useTodaySearch } from '@/app/(app)/use-today-search'

describe('useTodaySearch', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setSearchQuery.mockClear()
    storeState.searchQuery = ''
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('opens the search box, then clears the query when closing with a value', () => {
    const { result } = renderHook(() => useTodaySearch())
    expect(result.current.searchOpen).toBe(false)

    act(() => result.current.toggleSearch())
    expect(result.current.searchOpen).toBe(true)

    act(() => result.current.setLocalSearchQuery('gym'))
    expect(result.current.localSearchQuery).toBe('gym')

    act(() => result.current.toggleSearch())
    expect(result.current.searchOpen).toBe(false)
    expect(result.current.localSearchQuery).toBe('')
  })

  it('toggles closed without error when the search box is empty', () => {
    const { result } = renderHook(() => useTodaySearch())
    act(() => result.current.toggleSearch())
    expect(result.current.searchOpen).toBe(true)
    act(() => result.current.toggleSearch())
    expect(result.current.searchOpen).toBe(false)
    expect(result.current.localSearchQuery).toBe('')
  })

  it('debounces committing the local query to the shared store', () => {
    const { result } = renderHook(() => useTodaySearch())

    act(() => result.current.setLocalSearchQuery('run'))
    expect(setSearchQuery).not.toHaveBeenCalledWith('run')

    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(setSearchQuery).toHaveBeenCalledWith('run')
  })
})

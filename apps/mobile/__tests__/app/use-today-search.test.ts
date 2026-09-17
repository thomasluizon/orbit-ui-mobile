import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Keyboard } from 'react-native'
import { useTodaySearch, type TodaySearch } from '@/app/(tabs)/use-today-search'
import { useUIStore } from '@/stores/ui-store'

const TestRenderer = require('react-test-renderer')

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

  it('dismisses the soft keyboard when search closes', () => {
    const dismissSpy = vi.spyOn(Keyboard, 'dismiss')
    const search = renderTodaySearch()

    TestRenderer.act(() => {
      search.closeSearch()
    })

    expect(dismissSpy).toHaveBeenCalledOnce()
    expect(useUIStore.getState().searchQuery).toBe('')
  })
})

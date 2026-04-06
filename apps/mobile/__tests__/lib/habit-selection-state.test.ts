import { describe, expect, it } from 'vitest'
import {
  getHabitListExtraData,
  shouldResetSelectionForViewChange,
} from '@/lib/habit-selection-state'

describe('habit selection state helpers', () => {
  it('does not reset selection when the active view is unchanged', () => {
    expect(shouldResetSelectionForViewChange('today', 'today')).toBe(false)
  })

  it('resets selection when the active view changes', () => {
    expect(shouldResetSelectionForViewChange('today', 'all')).toBe(true)
  })

  it('changes the list extraData key when select mode changes', () => {
    const selectedIds = new Set<string>()
    const recentlyCompletedIds = new Set<string>()

    expect(
      getHabitListExtraData(false, selectedIds, recentlyCompletedIds),
    ).not.toBe(
      getHabitListExtraData(true, selectedIds, recentlyCompletedIds),
    )
  })

  it('changes the list extraData key when selected ids change', () => {
    const recentlyCompletedIds = new Set<string>()

    expect(
      getHabitListExtraData(false, new Set<string>(), recentlyCompletedIds),
    ).not.toBe(
      getHabitListExtraData(
        false,
        new Set<string>(['habit-1']),
        recentlyCompletedIds,
      ),
    )
  })

  it('changes the list extraData key when recently completed ids change', () => {
    const selectedIds = new Set<string>(['habit-1'])

    expect(
      getHabitListExtraData(false, selectedIds, new Set<string>()),
    ).not.toBe(
      getHabitListExtraData(
        false,
        selectedIds,
        new Set<string>(['habit-2']),
      ),
    )
  })
})

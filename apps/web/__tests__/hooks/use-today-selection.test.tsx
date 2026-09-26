import React from 'react'
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { useTodaySelection } from '@/app/(app)/use-today-selection'
import { useUIStore } from '@/stores/ui-store'
import type { HabitListHandle } from '@/components/habits/habit-list'

vi.mock('@/hooks/use-bulk-actions', () => ({
  useBulkActions: () => ({}),
}))

const habits = [
  createMockHabit({ id: 'parent', parentId: null }),
  createMockHabit({ id: 'child-a', parentId: 'parent' }),
  createMockHabit({ id: 'child-b', parentId: 'parent' }),
]

function renderSelection() {
  const habitListRef = {
    current: { allLoadedIds: new Set(habits.map((habit) => habit.id)) },
  } as React.RefObject<HabitListHandle | null>

  return renderHook(() => useTodaySelection({
    habitsById: new Map(habits.map((habit) => [habit.id, habit])),
    childrenByParent: new Map([['parent', ['child-a', 'child-b']]]),
    habitsCount: habits.length,
    habitListRef,
  }))
}

describe('web useTodaySelection cascade', () => {
  beforeEach(() => {
    useUIStore.getState().clearSelection()
  })

  it('selects a parent and its descendants', () => {
    const { result } = renderSelection()

    act(() => result.current.handleToggleSelection('parent'))

    expect(useUIStore.getState().selectedHabitIds).toEqual(
      new Set(['parent', 'child-a', 'child-b']),
    )
    expect(result.current.allSelected).toBe(true)
  })

  it('unselects a cascade-selected child while retaining its parent and sibling', () => {
    const { result } = renderSelection()

    act(() => result.current.handleToggleSelection('parent'))
    act(() => result.current.handleToggleSelection('child-a'))

    expect(useUIStore.getState().selectedHabitIds).toEqual(
      new Set(['parent', 'child-b']),
    )
    expect(useUIStore.getState().manuallySelectedIds).toEqual(new Set(['parent']))
    expect(result.current.allSelected).toBe(false)
  })
})

import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BackHandler } from 'react-native'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import type { HabitListHandle } from '@/components/habit-list'
import { useTodaySelection } from '@/app/(tabs)/use-today-selection'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => ({
  store: {
    activeView: 'today' as string,
    isSelectMode: false,
    selectedHabitIds: new Set<string>(),
    toggleSelectMode: vi.fn(),
    selectAllHabits: vi.fn(),
    clearSelection: vi.fn(),
  },
  bulkActions: {
    showBulkDeleteConfirm: false,
    showBulkLogConfirm: false,
    showBulkSkipConfirm: false,
    setShowBulkDeleteConfirm: vi.fn(),
    setShowBulkLogConfirm: vi.fn(),
    setShowBulkSkipConfirm: vi.fn(),
    confirmBulkDelete: vi.fn(),
    confirmBulkLog: vi.fn(),
    confirmBulkSkip: vi.fn(),
  },
}))

vi.mock('@/stores/ui-store', () => ({
  useUIStore: (selector: (state: typeof mocks.store) => unknown) => selector(mocks.store),
}))

vi.mock('@/hooks/use-bulk-actions', () => ({
  useBulkActions: () => mocks.bulkActions,
}))

function asMockBackHandler(handler: unknown): { emitBackPress: () => boolean } {
  return handler as { emitBackPress: () => boolean }
}

type SelectionApi = ReturnType<typeof useTodaySelection>

interface RenderOptions {
  habitListAllLoadedIds?: Set<string>
  visibleHabitIds?: Set<string>
  closeControlsMenu?: () => void
}

const mountedTrees: { unmount: () => void }[] = []

function renderSelection(options: RenderOptions = {}) {
  const ref: { current: SelectionApi | null } = { current: null }
  const habitListRef = { current: null } as React.RefObject<HabitListHandle | null>

  function Harness() {
    ref.current = useTodaySelection({
      habitsById: new Map<string, NormalizedHabit>(),
      habitListRef,
      habitListAllLoadedIds: options.habitListAllLoadedIds ?? new Set<string>(),
      visibleHabitIds: options.visibleHabitIds ?? new Set<string>(),
      closeControlsMenu: options.closeControlsMenu ?? vi.fn(),
    })
    return null
  }

  let tree: { update: (node: React.ReactElement) => void; unmount: () => void } | null = null
  TestRenderer.act(() => {
    tree = TestRenderer.create(React.createElement(Harness))
  })

  if (!ref.current || !tree) throw new Error('useTodaySelection did not render')
  mountedTrees.push(tree)
  return {
    api: ref as { current: SelectionApi },
    rerender: () =>
      TestRenderer.act(() => {
        tree!.update(React.createElement(Harness))
      }),
  }
}

afterEach(() => {
  while (mountedTrees.length > 0) {
    const tree = mountedTrees.pop()
    TestRenderer.act(() => tree?.unmount())
  }
})

describe('mobile useTodaySelection', () => {
  beforeEach(() => {
    mocks.store.activeView = 'today'
    mocks.store.isSelectMode = false
    mocks.store.selectedHabitIds = new Set<string>()
    mocks.store.toggleSelectMode.mockReset()
    mocks.store.selectAllHabits.mockReset()
    mocks.store.clearSelection.mockReset()
    Object.values(mocks.bulkActions).forEach((value) => {
      if (typeof value === 'function' && 'mockReset' in value) value.mockReset()
    })
  })

  it('derives selected count and all-selected against the loaded ids', () => {
    mocks.store.selectedHabitIds = new Set(['a', 'b'])
    const { api } = renderSelection({ habitListAllLoadedIds: new Set(['a', 'b']) })

    expect(api.current.selectedCount).toBe(2)
    expect(api.current.allSelected).toBe(true)
  })

  it('reports not-all-selected when no ids are loaded', () => {
    const { api } = renderSelection()
    expect(api.current.allSelected).toBe(false)
    expect(api.current.selectedCount).toBe(0)
  })

  it('falls back to the visible ids when no full page has loaded', () => {
    mocks.store.selectedHabitIds = new Set(['x'])
    const { api } = renderSelection({
      habitListAllLoadedIds: new Set<string>(),
      visibleHabitIds: new Set(['x']),
    })

    expect(api.current.allSelected).toBe(true)
    api.current.handleSelectAll()
    expect(mocks.store.selectAllHabits).toHaveBeenCalledWith(['x'])
  })

  it('clears the selection and closes the menu when leaving select mode', () => {
    mocks.store.isSelectMode = true
    const closeControlsMenu = vi.fn()
    const { api } = renderSelection({ closeControlsMenu })

    api.current.handleToggleSelectMode()
    expect(mocks.store.clearSelection).toHaveBeenCalledTimes(1)
    expect(mocks.store.toggleSelectMode).not.toHaveBeenCalled()
    expect(closeControlsMenu).toHaveBeenCalled()
  })

  it('enters select mode and closes the menu when currently idle', () => {
    const closeControlsMenu = vi.fn()
    const { api } = renderSelection({ closeControlsMenu })

    api.current.handleToggleSelectMode()
    expect(mocks.store.toggleSelectMode).toHaveBeenCalledTimes(1)
    expect(mocks.store.clearSelection).not.toHaveBeenCalled()
    expect(closeControlsMenu).toHaveBeenCalled()
  })

  it('opens bulk confirms only when at least one habit is selected', () => {
    const empty = renderSelection()
    empty.api.current.handleOpenBulkDelete()
    empty.api.current.handleOpenBulkLog()
    empty.api.current.handleOpenBulkSkip()
    expect(mocks.bulkActions.setShowBulkDeleteConfirm).not.toHaveBeenCalled()
    expect(mocks.bulkActions.setShowBulkLogConfirm).not.toHaveBeenCalled()
    expect(mocks.bulkActions.setShowBulkSkipConfirm).not.toHaveBeenCalled()

    mocks.store.selectedHabitIds = new Set(['a'])
    const filled = renderSelection()
    filled.api.current.handleOpenBulkDelete()
    filled.api.current.handleOpenBulkLog()
    filled.api.current.handleOpenBulkSkip()
    expect(mocks.bulkActions.setShowBulkDeleteConfirm).toHaveBeenCalledWith(true)
    expect(mocks.bulkActions.setShowBulkLogConfirm).toHaveBeenCalledWith(true)
    expect(mocks.bulkActions.setShowBulkSkipConfirm).toHaveBeenCalledWith(true)
  })

  it('deselect-all delegates to the store clearSelection', () => {
    const { api } = renderSelection()
    api.current.handleDeselectAll()
    expect(mocks.store.clearSelection).toHaveBeenCalledTimes(1)
  })

  it('resets the selection and closes the menu when the active view changes', () => {
    mocks.store.isSelectMode = true
    const closeControlsMenu = vi.fn()
    const view = renderSelection({ closeControlsMenu })

    mocks.store.clearSelection.mockClear()
    mocks.store.activeView = 'calendar'
    view.rerender()

    expect(closeControlsMenu).toHaveBeenCalled()
    expect(mocks.store.clearSelection).toHaveBeenCalledTimes(1)
  })

  it('does not reset the selection when the active view is unchanged', () => {
    mocks.store.isSelectMode = true
    const closeControlsMenu = vi.fn()
    const view = renderSelection({ closeControlsMenu })

    closeControlsMenu.mockClear()
    mocks.store.clearSelection.mockClear()
    view.rerender()

    expect(closeControlsMenu).not.toHaveBeenCalled()
    expect(mocks.store.clearSelection).not.toHaveBeenCalled()
  })

  it('clears the selection on a hardware back press while in select mode', () => {
    mocks.store.isSelectMode = true
    renderSelection()

    const handled = asMockBackHandler(BackHandler).emitBackPress()
    expect(handled).toBe(true)
    expect(mocks.store.clearSelection).toHaveBeenCalledTimes(1)
  })

  it('ignores hardware back when not in select mode', () => {
    renderSelection()
    const handled = asMockBackHandler(BackHandler).emitBackPress()
    expect(handled).toBe(false)
    expect(mocks.store.clearSelection).not.toHaveBeenCalled()
  })
})

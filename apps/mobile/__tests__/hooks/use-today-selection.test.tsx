import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BackHandler } from 'react-native'
import type { HabitListHandle } from '@/components/habit-list'
import { useTodaySelection } from '@/app/(tabs)/use-today-selection'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => ({
  store: {
    activeView: 'today',
    isSelectMode: false,
    selectedHabitIds: new Set<string>(),
    toggleSelectMode: vi.fn(),
    selectAllHabits: vi.fn(),
    clearSelection: vi.fn(),
  },
  bulkActions: {
    showBulkDeleteConfirm: false,
    setShowBulkDeleteConfirm: vi.fn(),
    confirmBulkDelete: vi.fn(),
    confirmBulkLog: vi.fn(),
    confirmBulkSkip: vi.fn(),
  },
  useBulkActions: vi.fn(),
}))

vi.mock('@/stores/ui-store', () => ({
  useUIStore: (selector: (state: typeof mocks.store) => unknown) => selector(mocks.store),
}))

vi.mock('@/hooks/use-bulk-actions', () => ({
  useBulkActions: (options: unknown) => {
    mocks.useBulkActions(options)
    return mocks.bulkActions
  },
}))

function asMockBackHandler(handler: unknown): { emitBackPress: () => boolean } {
  return handler as { emitBackPress: () => boolean }
}

type SelectionApi = ReturnType<typeof useTodaySelection>

interface RenderOptions {
  selectedDateStr?: string
  today?: string
  habitListAllLoadedIds?: Set<string>
  visibleHabitIds?: Set<string>
  closeControlsMenu?: () => void
}

const mountedTrees: { unmount: () => void }[] = []

function renderSelection(options: RenderOptions = {}) {
  const ref: { current: SelectionApi | null } = { current: null }
  const habitListRef = { current: null } as React.RefObject<HabitListHandle | null>

  function Harness({ selectedDateStr, today }: { selectedDateStr: string; today: string }) {
    ref.current = useTodaySelection({
      selectedDateStr,
      today,
      habitListRef,
      habitListAllLoadedIds: options.habitListAllLoadedIds ?? new Set<string>(),
      visibleHabitIds: options.visibleHabitIds ?? new Set<string>(),
      habitsById: new Map(),
      closeControlsMenu: options.closeControlsMenu ?? vi.fn(),
    })
    return null
  }

  let tree!: { update: (node: React.ReactElement) => void; unmount: () => void }
  const initialSelectedDateStr = options.selectedDateStr ?? '2026-04-01'
  const initialToday = options.today ?? '2026-04-08'
  TestRenderer.act(() => {
    tree = TestRenderer.create(
      React.createElement(Harness, {
        selectedDateStr: initialSelectedDateStr,
        today: initialToday,
      }),
    )
  })

  if (!ref.current) throw new Error('useTodaySelection did not render')
  mountedTrees.push(tree)
  return {
    api: ref as { current: SelectionApi },
    rerender: (selectedDateStr = initialSelectedDateStr, today = initialToday) =>
      TestRenderer.act(() => {
        tree.update(React.createElement(Harness, { selectedDateStr, today }))
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
    mocks.bulkActions.showBulkDeleteConfirm = false
    mocks.useBulkActions.mockReset()
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

  it('confirms deletion but runs reversible bulk actions directly when habits are selected', () => {
    const empty = renderSelection()
    empty.api.current.handleOpenBulkDelete()
    empty.api.current.handleOpenBulkLog()
    empty.api.current.handleOpenBulkSkip()
    expect(mocks.bulkActions.setShowBulkDeleteConfirm).not.toHaveBeenCalled()
    expect(mocks.bulkActions.confirmBulkLog).not.toHaveBeenCalled()
    expect(mocks.bulkActions.confirmBulkSkip).not.toHaveBeenCalled()

    mocks.store.selectedHabitIds = new Set(['a'])
    const filled = renderSelection()
    filled.api.current.handleOpenBulkDelete()
    filled.api.current.handleOpenBulkLog()
    filled.api.current.handleOpenBulkSkip()
    expect(mocks.bulkActions.setShowBulkDeleteConfirm).toHaveBeenCalledWith(true)
    expect(mocks.bulkActions.confirmBulkLog).toHaveBeenCalledTimes(1)
    expect(mocks.bulkActions.confirmBulkSkip).toHaveBeenCalledTimes(1)
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

  it('clears a pinned selection when today advances past its loggable window', () => {
    mocks.store.isSelectMode = true
    mocks.store.selectedHabitIds = new Set(['a'])
    const view = renderSelection({ selectedDateStr: '2026-04-01', today: '2026-04-08' })

    mocks.store.clearSelection.mockClear()
    view.rerender('2026-04-01', '2026-04-09')

    expect(mocks.store.clearSelection).toHaveBeenCalledTimes(1)
    expect(mocks.bulkActions.setShowBulkDeleteConfirm).toHaveBeenCalledWith(false)
    expect(mocks.useBulkActions).toHaveBeenLastCalledWith(
      expect.objectContaining({ readOnly: true }),
    )
  })

  it('closes an open bulk delete confirmation when today makes the pinned date read only', () => {
    mocks.store.isSelectMode = true
    mocks.store.selectedHabitIds = new Set(['a'])
    mocks.bulkActions.showBulkDeleteConfirm = true
    const view = renderSelection({ selectedDateStr: '2026-04-01', today: '2026-04-08' })

    view.rerender('2026-04-01', '2026-04-09')

    expect(mocks.bulkActions.setShowBulkDeleteConfirm).toHaveBeenCalledWith(false)
  })

  it('clears selection and closes bulk delete when navigating between loggable days', () => {
    mocks.store.isSelectMode = true
    mocks.store.selectedHabitIds = new Set(['a'])
    mocks.bulkActions.showBulkDeleteConfirm = true
    const view = renderSelection({ selectedDateStr: '2026-04-01', today: '2026-04-08' })

    mocks.store.clearSelection.mockClear()
    view.rerender('2026-04-02', '2026-04-08')

    expect(mocks.store.clearSelection).toHaveBeenCalledTimes(1)
    expect(mocks.bulkActions.setShowBulkDeleteConfirm).toHaveBeenCalledWith(false)
  })

  it('clears a loggable-day selection when navigation makes the viewed date read only', () => {
    mocks.store.isSelectMode = true
    mocks.store.selectedHabitIds = new Set(['a'])
    const view = renderSelection({ selectedDateStr: '2026-04-01' })

    mocks.store.clearSelection.mockClear()
    view.rerender('2026-03-31')

    expect(mocks.store.clearSelection).toHaveBeenCalledTimes(1)
    expect(mocks.bulkActions.setShowBulkDeleteConfirm).toHaveBeenCalledWith(false)
  })

  it('leaves selection and bulk actions unchanged on a loggable day', () => {
    mocks.store.isSelectMode = true
    mocks.store.selectedHabitIds = new Set(['a'])
    const view = renderSelection({ selectedDateStr: '2026-04-02', today: '2026-04-08' })

    mocks.store.clearSelection.mockClear()
    view.rerender()
    view.api.current.handleOpenBulkLog()

    expect(mocks.store.clearSelection).not.toHaveBeenCalled()
    expect(mocks.bulkActions.setShowBulkDeleteConfirm).not.toHaveBeenCalled()
    expect(mocks.bulkActions.confirmBulkLog).toHaveBeenCalledTimes(1)
    expect(mocks.useBulkActions).toHaveBeenLastCalledWith(
      expect.objectContaining({ readOnly: false }),
    )
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

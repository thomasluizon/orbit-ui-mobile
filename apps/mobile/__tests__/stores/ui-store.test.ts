import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useUIStore } from '@/stores/ui-store'

describe('mobile ui store', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-06T12:00:00Z'))
    useUIStore.setState({
      activeFilters: {},
      selectedDate: '2026-04-06',
      activeView: 'today',
      streakCelebration: null,
      allDoneCelebration: false,
      allDoneCelebratedDate: '',
      goalCompletedCelebration: null,
      isSelectMode: false,
      selectedHabitIds: new Set<string>(),
      manuallySelectedIds: new Set<string>(),
      lastCreatedHabitId: null,
      showCreateModal: false,
      showCreateGoalModal: false,
      searchQuery: '',
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('merges filters and updates search state', () => {
    const { setFilters, setSearchQuery, setActiveView } = useUIStore.getState()

    setFilters({ dateFrom: '2026-04-06' })
    setFilters({ dateTo: '2026-04-06' })
    setSearchQuery('focus')
    setActiveView('goals')

    expect(useUIStore.getState()).toMatchObject({
      activeFilters: { dateFrom: '2026-04-06', dateTo: '2026-04-06' },
      searchQuery: 'focus',
      activeView: 'goals',
    })
  })

  it('toggles selection mode and cascades descendant selection', () => {
    const { toggleSelectMode, toggleSelectionCascade } = useUIStore.getState()

    toggleSelectMode()
    toggleSelectionCascade(
      'parent',
      () => ['child-1', 'child-2'],
      () => false,
    )

    expect(useUIStore.getState().selectedHabitIds).toEqual(new Set(['parent', 'child-1', 'child-2']))

    toggleSelectionCascade(
      'parent',
      () => ['child-1', 'child-2'],
      () => false,
    )

    expect(useUIStore.getState().selectedHabitIds.size).toBe(0)
  })

  it('shows all-done celebration only for completed top-level habits on today filters', () => {
    useUIStore.setState({
      activeFilters: { dateFrom: '2026-04-06', dateTo: '2026-04-06' },
    })

    useUIStore.getState().checkAllDoneCelebration(
      new Map([
        ['parent-1', { parentId: null, isCompleted: true }],
        ['child-1', { parentId: 'parent-1', isCompleted: false }],
      ]),
    )

    expect(useUIStore.getState().allDoneCelebration).toBe(true)
  })

  it('clears the last created habit id after the timeout', async () => {
    useUIStore.getState().setLastCreatedHabitId('habit-1')
    expect(useUIStore.getState().lastCreatedHabitId).toBe('habit-1')

    await vi.advanceTimersByTimeAsync(1500)

    expect(useUIStore.getState().lastCreatedHabitId).toBeNull()
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createUIStoreState, type UIStoreState } from '../stores/ui-store'

function createStoreHarness() {
  let state = {} as UIStoreState

  const set = (
    partial: Partial<UIStoreState> | ((current: UIStoreState) => Partial<UIStoreState>),
  ) => {
    const next = typeof partial === 'function' ? partial(state) : partial
    state = { ...state, ...next }
  }

  const get = () => state
  state = createUIStoreState(set, get)

  return {
    getState: () => state,
    setState: (patch: Partial<UIStoreState>) => {
      state = { ...state, ...patch }
    },
  }
}

describe('shared ui store', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-06T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('merges filters and updates view/search state', () => {
    const store = createStoreHarness()
    const { setFilters, setSearchQuery, setActiveView } = store.getState()

    setFilters({ dateFrom: '2026-04-06' })
    setFilters({ dateTo: '2026-04-06' })
    setSearchQuery('focus')
    setActiveView('goals')

    expect(store.getState()).toMatchObject({
      activeFilters: { dateFrom: '2026-04-06', dateTo: '2026-04-06' },
      searchQuery: 'focus',
      activeView: 'goals',
    })
  })

  it('toggles cascaded selection and clears it when toggled again', () => {
    const store = createStoreHarness()
    const { toggleSelectMode, toggleSelectionCascade } = store.getState()

    toggleSelectMode()
    toggleSelectionCascade('parent', () => ['child-1', 'child-2'], () => false)

    expect(store.getState().selectedHabitIds).toEqual(
      new Set(['parent', 'child-1', 'child-2']),
    )

    toggleSelectionCascade('parent', () => ['child-1', 'child-2'], () => false)

    expect(store.getState().selectedHabitIds.size).toBe(0)
  })

  it('shows all-done celebration for completed top-level habits on today filters', () => {
    const store = createStoreHarness()
    store.setState({
      activeFilters: { dateFrom: '2026-04-06', dateTo: '2026-04-06' },
    })

    store.getState().checkAllDoneCelebration(
      new Map([
        ['parent-1', { parentId: null, isCompleted: true }],
        ['child-1', { parentId: 'parent-1', isCompleted: false }],
      ]),
    )

    expect(store.getState().allDoneCelebration).toBe(true)
    expect(store.getState().allDoneCelebratedDate).toBe('2026-04-06')
  })

  it('clears the last created habit id after the timeout', async () => {
    const store = createStoreHarness()

    store.getState().setLastCreatedHabitId('habit-1')
    expect(store.getState().lastCreatedHabitId).toBe('habit-1')

    await vi.advanceTimersByTimeAsync(1500)

    expect(store.getState().lastCreatedHabitId).toBeNull()
  })

  it('tracks celebration priority, de-duplicates queued items, and advances by id', () => {
    const store = createStoreHarness()
    const {
      enqueueCelebration,
      completeActiveCelebration,
      hasCelebrationInFlight,
    } = store.getState()

    enqueueCelebration('achievement', { achievementId: 'achv-1', xpReward: 10 })
    enqueueCelebration('level-up', { level: 2 })
    enqueueCelebration('level-up', { level: 2 })

    expect(hasCelebrationInFlight()).toBe(true)
    expect(store.getState().activeCelebration?.kind).toBe('achievement')
    expect(store.getState().queuedCelebrations).toHaveLength(1)

    completeActiveCelebration('different-id')
    expect(store.getState().activeCelebration?.kind).toBe('achievement')

    completeActiveCelebration(store.getState().activeCelebration?.id)
    expect(store.getState().activeCelebration?.kind).toBe('level-up')

    completeActiveCelebration(store.getState().activeCelebration?.id)
    expect(hasCelebrationInFlight()).toBe(false)
  })

  it('removes queued goal celebrations when they are cleared before becoming active', () => {
    const store = createStoreHarness()

    store.getState().setStreakCelebration({ streak: 5 })
    store.getState().setGoalCompletedCelebration({ name: 'Ship Orbit' })

    expect(store.getState().queuedCelebrations.map((item) => item.kind)).toEqual(['goal-completed'])

    store.getState().setGoalCompletedCelebration(null)

    expect(store.getState().queuedCelebrations).toEqual([])
    expect(store.getState().goalCompletedCelebration).toBeNull()
    expect(store.getState().streakCelebration).toEqual({ streak: 5 })
  })
})

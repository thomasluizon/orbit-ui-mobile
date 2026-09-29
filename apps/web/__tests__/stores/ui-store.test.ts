import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setUIAccountScope, useUIStore } from '@/stores/ui-store'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { collectSelectableDescendantIds, formatAPIDate } from '@orbit/shared/utils'

const PINNED_TEST_TIME = new Date('2026-09-12T09:00:00.000Z')
vi.setSystemTime(PINNED_TEST_TIME)
beforeEach(() => vi.setSystemTime(PINNED_TEST_TIME))
afterEach(() => vi.useRealTimers())

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/components/habits/controls-menu', () => ({
  ControlsMenu: () => null,
}))

describe('ui store', () => {
  beforeEach(() => {
    globalThis.localStorage.clear()
    useUIStore.setState({
      activeFilters: {},
      activeView: 'today',
      activeCelebration: null,
      queuedCelebrations: [],
      streakCelebration: null,
      allDoneCelebration: false,
      allDoneCelebratedDate: '',
      goalCompletedCelebration: null,
      isSelectMode: false,
      selectedHabitIds: new Set<string>(),
      manuallySelectedIds: new Set<string>(),
      lastCreatedHabitId: null,
      showCreateModal: false,
      astraConversationOpen: false,
      astraEntryPointIntent: undefined,
      searchQuery: '',
    })
  })

  afterEach(() => {
    globalThis.localStorage.clear()
  })

  it('keeps an opened create form through first account rehydration and clears it on account replacement', async () => {
    useUIStore.getState().setShowCreateModal(true)
    setUIAccountScope('first-account')
    await useUIStore.persist.rehydrate()
    expect(useUIStore.getState().showCreateModal).toBe(true)

    setUIAccountScope('replacement-account')
    await useUIStore.persist.rehydrate()
    expect(useUIStore.getState().showCreateModal).toBe(false)
    useUIStore.persist.setOptions({ name: 'orbit-ui-store' })
  })


  describe('filters', () => {
    it('starts with empty filters', () => {
      const state = useUIStore.getState()
      expect(state.activeFilters).toEqual({})
    })

    it('merges partial filters', () => {
      const { setFilters } = useUIStore.getState()
      setFilters({ dateFrom: '2025-01-01', dateTo: '2025-01-01' })

      const state = useUIStore.getState()
      expect(state.activeFilters.dateFrom).toBe('2025-01-01')
      expect(state.activeFilters.dateTo).toBe('2025-01-01')
    })

    it('preserves existing filters on partial update', () => {
      const { setFilters } = useUIStore.getState()
      setFilters({ dateFrom: '2025-01-01', dateTo: '2025-01-01' })
      setFilters({ includeOverdue: true })

      const state = useUIStore.getState()
      expect(state.activeFilters.dateFrom).toBe('2025-01-01')
      expect(state.activeFilters.includeOverdue).toBe(true)
    })

    it('overrides specific filter keys', () => {
      const { setFilters } = useUIStore.getState()
      setFilters({ dateFrom: '2025-01-01' })
      setFilters({ dateFrom: '2025-02-01' })

      const state = useUIStore.getState()
      expect(state.activeFilters.dateFrom).toBe('2025-02-01')
    })
  })


  describe('view mode', () => {
    it('starts with today view', () => {
      expect(useUIStore.getState().activeView).toBe('today')
    })

    it('changes active view', () => {
      const { setActiveView } = useUIStore.getState()
      setActiveView('all')
      expect(useUIStore.getState().activeView).toBe('all')

      setActiveView('general')
      expect(useUIStore.getState().activeView).toBe('general')

      setActiveView('all')
      expect(useUIStore.getState().activeView).toBe('all')
    })
  })


  describe('celebrations', () => {
    it('sets and clears streak celebration', () => {
      const { setStreakCelebration } = useUIStore.getState()
      setStreakCelebration({ streak: 7 })
      expect(useUIStore.getState().streakCelebration).toEqual({ streak: 7 })

      setStreakCelebration(null)
      expect(useUIStore.getState().streakCelebration).toBeNull()
    })

    it('sets and clears all-done celebration', () => {
      const { setAllDoneCelebration } = useUIStore.getState()
      setAllDoneCelebration(true)
      expect(useUIStore.getState().allDoneCelebration).toBe(true)

      setAllDoneCelebration(false)
      expect(useUIStore.getState().allDoneCelebration).toBe(false)
    })

    it('sets and clears goal completed celebration', () => {
      const { setGoalCompletedCelebration } = useUIStore.getState()
      setGoalCompletedCelebration({ name: 'Ship Orbit', count: 12, unit: 'releases' })
      expect(useUIStore.getState().goalCompletedCelebration).toEqual({
        name: 'Ship Orbit',
        count: 12,
        unit: 'releases',
      })

      setGoalCompletedCelebration(null)
      expect(useUIStore.getState().goalCompletedCelebration).toBeNull()
    })

    describe('checkAllDoneCelebration', () => {
      it('ignores a log for another day', () => {
        const today = formatAPIDate(new Date())
        const habit = createMockHabit({ id: 'h1', scheduledDates: [today], isLoggedInRange: true })
        useUIStore.getState().checkAllDoneCelebration(new Map([[habit.id, habit]]), new Map(), '2000-01-01')
        expect(useUIStore.getState().allDoneCelebration).toBe(false)
      })

      it('ignores an empty day', () => {
        useUIStore.getState().checkAllDoneCelebration(new Map(), new Map(), formatAPIDate(new Date()))
        expect(useUIStore.getState().allDoneCelebration).toBe(false)
      })

      it('celebrates once when the last due item is completed without a range log', () => {
        const today = formatAPIDate(new Date())
        const first = createMockHabit({ id: 'h1', scheduledDates: [today], isLoggedInRange: true })
        const second = createMockHabit({ id: 'h2', scheduledDates: [today], isCompleted: true, isLoggedInRange: false })
        const habits = new Map([[first.id, first], [second.id, second]])
        const check = useUIStore.getState().checkAllDoneCelebration
        check(habits, new Map(), today)
        check(habits, new Map(), today)
        expect(useUIStore.getState().activeCelebration?.kind).toBe('all-done')
        expect(useUIStore.getState().activeCelebration?.payload).toEqual({ count: 2 })
        expect(useUIStore.getState().queuedCelebrations).toHaveLength(0)
      })

      it('queues all-done behind an active streak celebration', () => {
        const today = formatAPIDate(new Date())
        const habit = createMockHabit({ id: 'h1', scheduledDates: [today], isLoggedInRange: true })
        useUIStore.getState().setStreakCelebration({ streak: 7 })
        useUIStore.getState().checkAllDoneCelebration(new Map([[habit.id, habit]]), new Map(), today)
        expect(useUIStore.getState().queuedCelebrations).toHaveLength(1)
        useUIStore.getState().completeActiveCelebration()
        expect(useUIStore.getState().activeCelebration?.kind).toBe('all-done')
      })

      it('waits while another due habit is open', () => {
        const today = formatAPIDate(new Date())
        const logged = createMockHabit({ id: 'h1', scheduledDates: [today], isLoggedInRange: true })
        const open = createMockHabit({ id: 'h2', scheduledDates: [today] })
        useUIStore.getState().checkAllDoneCelebration(new Map([[logged.id, logged], [open.id, open]]), new Map(), today)
        expect(useUIStore.getState().allDoneCelebration).toBe(false)
      })
    })
  })


  describe('select mode', () => {
    it('starts with select mode off and empty selection', () => {
      const state = useUIStore.getState()
      expect(state.isSelectMode).toBe(false)
      expect(state.selectedHabitIds.size).toBe(0)
    })

    it('toggles select mode on', () => {
      const { toggleSelectMode } = useUIStore.getState()
      toggleSelectMode()
      expect(useUIStore.getState().isSelectMode).toBe(true)
    })

    it('clears selection when toggling select mode off', () => {
      useUIStore.setState({
        isSelectMode: true,
        selectedHabitIds: new Set(['h1', 'h2']),
      })

      const { toggleSelectMode } = useUIStore.getState()
      toggleSelectMode()

      const state = useUIStore.getState()
      expect(state.isSelectMode).toBe(false)
      expect(state.selectedHabitIds.size).toBe(0)
    })

    it('toggles habit selection on and off', () => {
      useUIStore.setState({ isSelectMode: true })

      const { toggleHabitSelection } = useUIStore.getState()
      toggleHabitSelection('h1')
      expect(useUIStore.getState().selectedHabitIds.has('h1')).toBe(true)

      toggleHabitSelection('h1')
      expect(useUIStore.getState().selectedHabitIds.has('h1')).toBe(false)
    })

    it('selects multiple habits', () => {
      useUIStore.setState({ isSelectMode: true })

      const { toggleHabitSelection } = useUIStore.getState()
      toggleHabitSelection('h1')
      toggleHabitSelection('h2')
      toggleHabitSelection('h3')

      const state = useUIStore.getState()
      expect(state.selectedHabitIds.size).toBe(3)
      expect(state.selectedHabitIds.has('h1')).toBe(true)
      expect(state.selectedHabitIds.has('h2')).toBe(true)
      expect(state.selectedHabitIds.has('h3')).toBe(true)
    })

    it('clearSelection resets both select mode and selection', () => {
      useUIStore.setState({
        isSelectMode: true,
        selectedHabitIds: new Set(['h1', 'h2']),
      })

      const { clearSelection } = useUIStore.getState()
      clearSelection()

      const state = useUIStore.getState()
      expect(state.isSelectMode).toBe(false)
      expect(state.selectedHabitIds.size).toBe(0)
    })

    it('selectAllHabits selects all provided IDs', () => {
      useUIStore.setState({ isSelectMode: true })

      const { selectAllHabits } = useUIStore.getState()
      selectAllHabits(['h1', 'h2', 'h3'])

      const state = useUIStore.getState()
      expect(state.selectedHabitIds.size).toBe(3)
      expect(state.selectedHabitIds.has('h1')).toBe(true)
      expect(state.selectedHabitIds.has('h2')).toBe(true)
      expect(state.selectedHabitIds.has('h3')).toBe(true)
      expect(state.manuallySelectedIds.size).toBe(3)
    })

    describe('toggleSelectionCascade', () => {
      const getDescendantIds = (id: string) => {
        const tree: Record<string, string[]> = {
          parent: ['child-1', 'child-2'],
          'child-1': ['grandchild-1'],
        }
        return collectSelectableDescendantIds(id, (parentId) => tree[parentId] ?? [])
      }

      it('selects habit and all descendants', () => {
        useUIStore.setState({
          isSelectMode: true,
          selectedHabitIds: new Set<string>(),
          manuallySelectedIds: new Set<string>(),
        })

        const { toggleSelectionCascade } = useUIStore.getState()
        toggleSelectionCascade('parent', getDescendantIds)

        const state = useUIStore.getState()
        expect(state.selectedHabitIds.has('parent')).toBe(true)
        expect(state.selectedHabitIds.has('child-1')).toBe(true)
        expect(state.selectedHabitIds.has('child-2')).toBe(true)
        expect(state.selectedHabitIds.has('grandchild-1')).toBe(true)
        expect(state.manuallySelectedIds.has('parent')).toBe(true)
      })

      it('deselects habit and auto-selected descendants', () => {
        useUIStore.setState({
          isSelectMode: true,
          selectedHabitIds: new Set(['parent', 'child-1', 'child-2']),
          manuallySelectedIds: new Set(['parent']),
        })

        const { toggleSelectionCascade } = useUIStore.getState()
        toggleSelectionCascade('parent', getDescendantIds)

        const state = useUIStore.getState()
        expect(state.selectedHabitIds.has('parent')).toBe(false)
        expect(state.selectedHabitIds.has('child-1')).toBe(false)
        expect(state.selectedHabitIds.has('child-2')).toBe(false)
      })

      it('keeps manually selected descendants when deselecting parent', () => {
        useUIStore.setState({
          isSelectMode: true,
          selectedHabitIds: new Set(['parent', 'child-1', 'child-2']),
          manuallySelectedIds: new Set(['parent', 'child-1']),
        })

        const { toggleSelectionCascade } = useUIStore.getState()
        toggleSelectionCascade('parent', getDescendantIds)

        const state = useUIStore.getState()
        expect(state.selectedHabitIds.has('parent')).toBe(false)
        expect(state.selectedHabitIds.has('child-1')).toBe(true)
        expect(state.selectedHabitIds.has('child-2')).toBe(false)
      })

      it('excludes and restores a child selected by its parent', () => {
        useUIStore.setState({
          isSelectMode: true,
          selectedHabitIds: new Set<string>(),
          manuallySelectedIds: new Set<string>(),
        })

        const { toggleSelectionCascade } = useUIStore.getState()
        toggleSelectionCascade('parent', getDescendantIds)
        toggleSelectionCascade('child-1', getDescendantIds)

        expect(useUIStore.getState().selectedHabitIds).toEqual(new Set(['parent', 'child-2']))
        expect(useUIStore.getState().manuallySelectedIds).toEqual(new Set(['parent']))

        toggleSelectionCascade('child-1', getDescendantIds)
        expect(useUIStore.getState().selectedHabitIds).toEqual(new Set(['parent', 'child-1', 'child-2', 'grandchild-1']))
      })
    })
  })


  describe('lastCreatedHabitId', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('sets last created habit ID', () => {
      const { setLastCreatedHabitId } = useUIStore.getState()
      setLastCreatedHabitId('new-habit')
      expect(useUIStore.getState().lastCreatedHabitId).toBe('new-habit')
    })

    it('clears last created habit ID after timeout', () => {
      const { setLastCreatedHabitId } = useUIStore.getState()
      setLastCreatedHabitId('new-habit')

      vi.advanceTimersByTime(1500)

      expect(useUIStore.getState().lastCreatedHabitId).toBeNull()
    })

    it('clears immediately when set to null', () => {
      const { setLastCreatedHabitId } = useUIStore.getState()
      setLastCreatedHabitId('new-habit')
      setLastCreatedHabitId(null)
      expect(useUIStore.getState().lastCreatedHabitId).toBeNull()
    })
  })


  describe('create modals', () => {
    it('starts with create modal hidden', () => {
      expect(useUIStore.getState().showCreateModal).toBe(false)
    })

    it('toggles create modal', () => {
      const { setShowCreateModal } = useUIStore.getState()
      setShowCreateModal(true)
      expect(useUIStore.getState().showCreateModal).toBe(true)

      setShowCreateModal(false)
      expect(useUIStore.getState().showCreateModal).toBe(false)
    })

  })

  it('keeps Support intent only while its conversation is open', () => {
    const { setAstraConversationOpen } = useUIStore.getState()
    setAstraConversationOpen(true, 'support')
    expect(useUIStore.getState().astraEntryPointIntent).toBe('support')
    setAstraConversationOpen(false)
    setAstraConversationOpen(true)
    expect(useUIStore.getState().astraEntryPointIntent).toBeUndefined()
  })


  describe('search', () => {
    it('starts with empty search query', () => {
      expect(useUIStore.getState().searchQuery).toBe('')
    })

    it('updates search query', () => {
      const { setSearchQuery } = useUIStore.getState()
      setSearchQuery('exercise')
      expect(useUIStore.getState().searchQuery).toBe('exercise')
    })

    it('clears search query', () => {
      const { setSearchQuery } = useUIStore.getState()
      setSearchQuery('test')
      setSearchQuery('')
      expect(useUIStore.getState().searchQuery).toBe('')
    })

  })

  describe('persisted ui context', () => {
    it('rehydrates an existing payload without restoring retired Today controls', async () => {
      globalThis.localStorage.setItem(
        'orbit-ui-store',
        JSON.stringify({
          state: {
            activeFilters: { search: 'focus' },
            activeView: 'goals',
            searchQuery: 'focus',
            selectedFrequency: 'Month',
            selectedTagIds: ['deep-work'],
            showCompleted: true,
          },
          version: 4,
        }),
      )

      await useUIStore.persist.rehydrate()

      expect(useUIStore.getState()).toMatchObject({
        activeFilters: {},
        activeView: 'today',
        searchQuery: '',
      })
      expect(useUIStore.getState()).not.toHaveProperty('selectedFrequency')
      expect(useUIStore.getState()).not.toHaveProperty('selectedTagIds')
      expect(useUIStore.getState()).not.toHaveProperty('showCompleted')
      expect(useUIStore.getState().selectedHabitIds.size).toBe(0)
      expect(globalThis.localStorage.getItem('orbit-ui-store')).not.toContain('searchQuery')
      expect(globalThis.localStorage.getItem('orbit-ui-store')).not.toContain('showCompleted')
    })

    it('drops legacy day-selection keys when rehydrating an old snapshot', async () => {
      globalThis.localStorage.setItem(
        'orbit-ui-store',
        JSON.stringify({
          state: {
            activeFilters: {},
            selectedDate: '2000-01-01',
            followToday: false,
            activeView: 'today',
            searchQuery: '',
            selectedFrequency: null,
            selectedTagIds: [],
            showCompleted: false,
          },
          version: 2,
        }),
      )

      await useUIStore.persist.rehydrate()

      const persisted = globalThis.localStorage.getItem('orbit-ui-store')
      expect(persisted).not.toContain('selectedDate')
      expect(persisted).not.toContain('followToday')
    })
  })
})

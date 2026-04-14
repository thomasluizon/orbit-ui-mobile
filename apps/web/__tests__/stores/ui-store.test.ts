import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useUIStore } from '@/stores/ui-store'
import { formatAPIDate } from '@orbit/shared/utils'

describe('ui store', () => {
  beforeEach(() => {
    globalThis.localStorage.clear()
    // Reset store state between tests
    useUIStore.setState({
      activeFilters: {},
      selectedDate: formatAPIDate(new Date()),
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
      selectedFrequency: null,
      selectedTagIds: [],
      showCompleted: false,
    })
  })

  afterEach(() => {
    globalThis.localStorage.clear()
  })

  // -------------------------------------------------------------------------
  // Filter changes
  // -------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // Date navigation
  // -------------------------------------------------------------------------

  describe('date navigation', () => {
    it('starts with today as selected date', () => {
      const state = useUIStore.getState()
      expect(state.selectedDate).toBe(formatAPIDate(new Date()))
    })

    it('updates selected date', () => {
      const { setSelectedDate } = useUIStore.getState()
      setSelectedDate('2025-06-15')

      expect(useUIStore.getState().selectedDate).toBe('2025-06-15')
    })
  })

  // -------------------------------------------------------------------------
  // View mode
  // -------------------------------------------------------------------------

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

      setActiveView('goals')
      expect(useUIStore.getState().activeView).toBe('goals')
    })
  })

  // -------------------------------------------------------------------------
  // Celebrations
  // -------------------------------------------------------------------------

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
      setGoalCompletedCelebration({ name: 'Ship Orbit' })
      expect(useUIStore.getState().goalCompletedCelebration).toEqual({
        name: 'Ship Orbit',
      })

      setGoalCompletedCelebration(null)
      expect(useUIStore.getState().goalCompletedCelebration).toBeNull()
    })

    describe('checkAllDoneCelebration', () => {
      it('does nothing when filters are not for today', () => {
        useUIStore.setState({
          activeFilters: { dateFrom: '2025-01-01', dateTo: '2025-01-01' },
        })

        const { checkAllDoneCelebration } = useUIStore.getState()
        const habits = new Map([
          ['h1', { parentId: null, isCompleted: true }],
        ])
        checkAllDoneCelebration(habits)

        expect(useUIStore.getState().allDoneCelebration).toBe(false)
      })

      it('does nothing when habitsById is empty', () => {
        const today = formatAPIDate(new Date())
        useUIStore.setState({
          activeFilters: { dateFrom: today, dateTo: today },
        })

        const { checkAllDoneCelebration } = useUIStore.getState()
        checkAllDoneCelebration(new Map())

        expect(useUIStore.getState().allDoneCelebration).toBe(false)
      })

      it('triggers celebration when all top-level habits are completed', () => {
        const today = formatAPIDate(new Date())
        useUIStore.setState({
          activeFilters: { dateFrom: today, dateTo: today },
          allDoneCelebratedDate: '',
        })

        const { checkAllDoneCelebration } = useUIStore.getState()
        const habits = new Map([
          ['h1', { parentId: null, isCompleted: true }],
          ['h2', { parentId: null, isCompleted: true }],
          ['h3', { parentId: 'h1', isCompleted: false }], // child, ignored
        ])
        checkAllDoneCelebration(habits)

        expect(useUIStore.getState().allDoneCelebration).toBe(true)
        expect(useUIStore.getState().allDoneCelebratedDate).toBe(today)
      })

      it('does not trigger when already celebrated today', () => {
        const today = formatAPIDate(new Date())
        useUIStore.setState({
          activeFilters: { dateFrom: today, dateTo: today },
          allDoneCelebratedDate: today,
          allDoneCelebration: false,
        })

        const { checkAllDoneCelebration } = useUIStore.getState()
        const habits = new Map([
          ['h1', { parentId: null, isCompleted: true }],
        ])
        checkAllDoneCelebration(habits)

        expect(useUIStore.getState().allDoneCelebration).toBe(false)
      })

      it('delays allDone celebration when streak celebration is active', () => {
        vi.useFakeTimers()
        const today = formatAPIDate(new Date())
        useUIStore.setState({
          activeFilters: { dateFrom: today, dateTo: today },
          allDoneCelebratedDate: '',
          streakCelebration: { streak: 7 },
        })

        const { checkAllDoneCelebration } = useUIStore.getState()
        const habits = new Map([
          ['h1', { parentId: null, isCompleted: true }],
        ])
        checkAllDoneCelebration(habits)

        // Should NOT be immediately true because of the streak celebration delay
        expect(useUIStore.getState().allDoneCelebration).toBe(false)

        // After the 3s delay, it fires
        vi.advanceTimersByTime(3000)
        expect(useUIStore.getState().allDoneCelebration).toBe(true)
        vi.useRealTimers()
      })

      it('does not trigger when some habits are incomplete', () => {
        const today = formatAPIDate(new Date())
        useUIStore.setState({
          activeFilters: { dateFrom: today, dateTo: today },
          allDoneCelebratedDate: '',
        })

        const { checkAllDoneCelebration } = useUIStore.getState()
        const habits = new Map([
          ['h1', { parentId: null, isCompleted: true }],
          ['h2', { parentId: null, isCompleted: false }],
        ])
        checkAllDoneCelebration(habits)

        expect(useUIStore.getState().allDoneCelebration).toBe(false)
      })
    })
  })

  // -------------------------------------------------------------------------
  // Select mode
  // -------------------------------------------------------------------------

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
        return tree[id] ?? []
      }
      const neverSelected = () => false

      it('selects habit and all descendants', () => {
        useUIStore.setState({
          isSelectMode: true,
          selectedHabitIds: new Set<string>(),
          manuallySelectedIds: new Set<string>(),
        })

        const { toggleSelectionCascade } = useUIStore.getState()
        toggleSelectionCascade('parent', getDescendantIds, neverSelected)

        const state = useUIStore.getState()
        expect(state.selectedHabitIds.has('parent')).toBe(true)
        expect(state.selectedHabitIds.has('child-1')).toBe(true)
        expect(state.selectedHabitIds.has('child-2')).toBe(true)
        expect(state.manuallySelectedIds.has('parent')).toBe(true)
      })

      it('deselects habit and auto-selected descendants', () => {
        useUIStore.setState({
          isSelectMode: true,
          selectedHabitIds: new Set(['parent', 'child-1', 'child-2']),
          manuallySelectedIds: new Set(['parent']),
        })

        const { toggleSelectionCascade } = useUIStore.getState()
        toggleSelectionCascade('parent', getDescendantIds, neverSelected)

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
        toggleSelectionCascade('parent', getDescendantIds, neverSelected)

        const state = useUIStore.getState()
        expect(state.selectedHabitIds.has('parent')).toBe(false)
        // child-1 was manually selected, so it stays
        expect(state.selectedHabitIds.has('child-1')).toBe(true)
        // child-2 was auto-selected, so it's removed
        expect(state.selectedHabitIds.has('child-2')).toBe(false)
      })

      it('does nothing when ancestor is already selected', () => {
        useUIStore.setState({
          isSelectMode: true,
          selectedHabitIds: new Set(['parent']),
          manuallySelectedIds: new Set(['parent']),
        })

        const isAncestorSelected = (id: string) => id === 'child-1'
        const { toggleSelectionCascade } = useUIStore.getState()
        toggleSelectionCascade('child-1', getDescendantIds, isAncestorSelected)

        // State should be unchanged
        const state = useUIStore.getState()
        expect(state.selectedHabitIds.has('parent')).toBe(true)
        expect(state.selectedHabitIds.size).toBe(1)
      })
    })
  })

  // -------------------------------------------------------------------------
  // Last created habit ID
  // -------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // Create modals
  // -------------------------------------------------------------------------

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

    it('starts with create goal modal hidden', () => {
      expect(useUIStore.getState().showCreateGoalModal).toBe(false)
    })

    it('toggles create goal modal', () => {
      const { setShowCreateGoalModal } = useUIStore.getState()
      setShowCreateGoalModal(true)
      expect(useUIStore.getState().showCreateGoalModal).toBe(true)

      setShowCreateGoalModal(false)
      expect(useUIStore.getState().showCreateGoalModal).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // Search
  // -------------------------------------------------------------------------

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

  describe('durable today context', () => {
    it('updates the persisted today context fields', () => {
      const {
        setSelectedFrequency,
        setSelectedTagIds,
        setShowCompleted,
      } = useUIStore.getState()

      setSelectedFrequency('Week')
      setSelectedTagIds(['fitness', 'health'])
      setShowCompleted(true)

      expect(useUIStore.getState()).toMatchObject({
        selectedFrequency: 'Week',
        selectedTagIds: ['fitness', 'health'],
        showCompleted: true,
      })
    })

    it('rehydrates the durable today context from local storage', async () => {
      globalThis.localStorage.setItem(
        'orbit-ui-store',
        JSON.stringify({
          state: {
            activeFilters: { search: 'focus' },
            selectedDate: '2026-04-07',
            activeView: 'goals',
            searchQuery: 'focus',
            selectedFrequency: 'Month',
            selectedTagIds: ['deep-work'],
            showCompleted: true,
          },
          version: 0,
        }),
      )

      await useUIStore.persist.rehydrate()

      expect(useUIStore.getState()).toMatchObject({
        activeFilters: { search: 'focus' },
        selectedDate: '2026-04-07',
        activeView: 'goals',
        searchQuery: 'focus',
        selectedFrequency: 'Month',
        selectedTagIds: ['deep-work'],
        showCompleted: true,
      })
      expect(useUIStore.getState().selectedHabitIds.size).toBe(0)
    })
  })
})

import { create } from 'zustand'
import type { HabitsFilter } from '@orbit/shared/types/habit'
import { formatAPIDate } from '@orbit/shared/utils'

interface UIState {
  // Habit filters
  activeFilters: HabitsFilter
  setFilters: (filters: Partial<HabitsFilter>) => void

  // Date navigation
  selectedDate: string // YYYY-MM-DD
  setSelectedDate: (date: string) => void

  // View mode
  activeView: 'today' | 'all' | 'general' | 'goals'
  setActiveView: (view: 'today' | 'all' | 'general' | 'goals') => void

  // Celebrations
  streakCelebration: { streak: number } | null
  allDoneCelebration: boolean
  allDoneCelebratedDate: string
  goalCompletedCelebration: { name: string } | null
  setStreakCelebration: (data: { streak: number } | null) => void
  setAllDoneCelebration: (value: boolean) => void
  setGoalCompletedCelebration: (data: { name: string } | null) => void
  checkAllDoneCelebration: (
    habitsById: Map<string, { parentId: string | null; isCompleted: boolean }>,
  ) => void

  // Select mode (bulk operations)
  isSelectMode: boolean
  selectedHabitIds: Set<string>
  lastCreatedHabitId: string | null
  toggleSelectMode: () => void
  toggleHabitSelection: (id: string) => void
  clearSelection: () => void
  setLastCreatedHabitId: (id: string | null) => void

  // Create modal (shared between layout BottomNav and pages)
  showCreateModal: boolean
  setShowCreateModal: (show: boolean) => void

  // Search
  searchQuery: string
  setSearchQuery: (query: string) => void
}

let createdHabitTimer: ReturnType<typeof setTimeout> | undefined

export const useUIStore = create<UIState>((set, get) => ({
  // -- Filters ----------------------------------------------------------------
  activeFilters: {},
  setFilters: (filters) =>
    set((state) => ({
      activeFilters: { ...state.activeFilters, ...filters },
    })),

  // -- Date navigation --------------------------------------------------------
  selectedDate: formatAPIDate(new Date()),
  setSelectedDate: (date) => set({ selectedDate: date }),

  // -- View mode --------------------------------------------------------------
  activeView: 'today',
  setActiveView: (view) => set({ activeView: view }),

  // -- Celebrations -----------------------------------------------------------
  streakCelebration: null,
  allDoneCelebration: false,
  allDoneCelebratedDate: '',
  goalCompletedCelebration: null,

  setStreakCelebration: (data) => set({ streakCelebration: data }),
  setAllDoneCelebration: (value) => set({ allDoneCelebration: value }),
  setGoalCompletedCelebration: (data) => set({ goalCompletedCelebration: data }),

  checkAllDoneCelebration: (habitsById) => {
    const { activeFilters, allDoneCelebratedDate, streakCelebration } = get()
    const today = formatAPIDate(new Date())

    if (activeFilters.dateFrom !== today || activeFilters.dateTo !== today) return
    if (allDoneCelebratedDate === today) return
    if (habitsById.size === 0) return

    const topLevel = Array.from(habitsById.values()).filter((h) => h.parentId === null)
    const allDone = topLevel.every((h) => h.isCompleted)
    const hasCompletion = topLevel.some((h) => h.isCompleted)

    if (allDone && hasCompletion) {
      set({ allDoneCelebratedDate: today })
      if (streakCelebration) {
        setTimeout(() => set({ allDoneCelebration: true }), 3000)
      } else {
        set({ allDoneCelebration: true })
      }
    }
  },

  // -- Select mode ------------------------------------------------------------
  isSelectMode: false,
  selectedHabitIds: new Set<string>(),
  lastCreatedHabitId: null,

  toggleSelectMode: () =>
    set((state) => ({
      isSelectMode: !state.isSelectMode,
      selectedHabitIds: state.isSelectMode ? new Set<string>() : state.selectedHabitIds,
    })),

  toggleHabitSelection: (id) =>
    set((state) => {
      const next = new Set(state.selectedHabitIds)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return { selectedHabitIds: next }
    }),

  clearSelection: () =>
    set({ isSelectMode: false, selectedHabitIds: new Set<string>() }),

  setLastCreatedHabitId: (id) => {
    if (createdHabitTimer) clearTimeout(createdHabitTimer)
    set({ lastCreatedHabitId: id })
    if (id) {
      createdHabitTimer = setTimeout(() => set({ lastCreatedHabitId: null }), 1500)
    }
  },

  // -- Create modal -----------------------------------------------------------
  showCreateModal: false,
  setShowCreateModal: (show) => set({ showCreateModal: show }),

  // -- Search -----------------------------------------------------------------
  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),
}))

import type { HabitsFilter } from '../types/habit'
import { formatAPIDate } from '../utils/dates'

type UIStoreSet = {
  (partial: Partial<UIStoreState> | ((state: UIStoreState) => Partial<UIStoreState>), replace?: false): void
  (state: UIStoreState | ((state: UIStoreState) => UIStoreState), replace: true): void
}

type UIStoreGet = () => UIStoreState

export interface UIStoreState {
  activeFilters: HabitsFilter
  setFilters: (filters: Partial<HabitsFilter>) => void

  selectedDate: string
  setSelectedDate: (date: string) => void

  activeView: 'today' | 'all' | 'general' | 'goals'
  setActiveView: (view: 'today' | 'all' | 'general' | 'goals') => void

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

  isSelectMode: boolean
  selectedHabitIds: Set<string>
  manuallySelectedIds: Set<string>
  lastCreatedHabitId: string | null
  toggleSelectMode: () => void
  toggleHabitSelection: (id: string) => void
  toggleSelectionCascade: (
    habitId: string,
    getDescendantIds: (id: string) => string[],
    isAncestorSelected: (id: string) => boolean,
  ) => void
  selectAllHabits: (allIds: string[]) => void
  clearSelection: () => void
  setLastCreatedHabitId: (id: string | null) => void

  showCreateModal: boolean
  setShowCreateModal: (show: boolean) => void
  showCreateGoalModal: boolean
  setShowCreateGoalModal: (show: boolean) => void

  searchQuery: string
  setSearchQuery: (query: string) => void
}

export function createUIStoreState(
  set: UIStoreSet,
  get: UIStoreGet,
): UIStoreState {
  let createdHabitTimer: ReturnType<typeof setTimeout> | undefined

  return {
    activeFilters: {},
    setFilters: (filters) =>
      set((state) => ({
        activeFilters: { ...state.activeFilters, ...filters },
      })),

    selectedDate: formatAPIDate(new Date()),
    setSelectedDate: (date) => set({ selectedDate: date }),

    activeView: 'today',
    setActiveView: (view) => set({ activeView: view }),

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

    isSelectMode: false,
    selectedHabitIds: new Set<string>(),
    manuallySelectedIds: new Set<string>(),
    lastCreatedHabitId: null,

    toggleSelectMode: () =>
      set((state) => ({
        isSelectMode: !state.isSelectMode,
        selectedHabitIds: state.isSelectMode ? new Set<string>() : state.selectedHabitIds,
        manuallySelectedIds: state.isSelectMode ? new Set<string>() : state.manuallySelectedIds,
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

    toggleSelectionCascade: (habitId, getDescendantIds, isAncestorSelected) =>
      set((state) => {
        if (isAncestorSelected(habitId)) return state

        const selected = new Set(state.selectedHabitIds)
        const manual = new Set(state.manuallySelectedIds)
        const descendants = getDescendantIds(habitId)

        if (selected.has(habitId)) {
          selected.delete(habitId)
          manual.delete(habitId)
          for (const id of descendants) {
            if (!manual.has(id)) selected.delete(id)
          }
        } else {
          selected.add(habitId)
          manual.add(habitId)
          for (const id of descendants) selected.add(id)
        }

        return { selectedHabitIds: selected, manuallySelectedIds: manual }
      }),

    selectAllHabits: (allIds) =>
      set({
        selectedHabitIds: new Set(allIds),
        manuallySelectedIds: new Set(allIds),
      }),

    clearSelection: () =>
      set({
        isSelectMode: false,
        selectedHabitIds: new Set<string>(),
        manuallySelectedIds: new Set<string>(),
      }),

    setLastCreatedHabitId: (id) => {
      if (createdHabitTimer) clearTimeout(createdHabitTimer)
      set({ lastCreatedHabitId: id })
      if (id) {
        createdHabitTimer = setTimeout(() => set({ lastCreatedHabitId: null }), 1500)
      }
    },

    showCreateModal: false,
    setShowCreateModal: (show) => set({ showCreateModal: show }),
    showCreateGoalModal: false,
    setShowCreateGoalModal: (show) => set({ showCreateGoalModal: show }),

    searchQuery: '',
    setSearchQuery: (query) => set({ searchQuery: query }),
  }
}

import type { HabitsFilter } from '../types/habit'
import { formatAPIDate } from '../utils/dates'

type UIStoreSet = {
  (partial: Partial<UIStoreState> | ((state: UIStoreState) => Partial<UIStoreState>), replace?: false): void
  (state: UIStoreState | ((state: UIStoreState) => UIStoreState), replace: true): void
}

type UIStoreGet = () => UIStoreState

export type HabitFrequencyFilter = 'Day' | 'Week' | 'Month' | 'Year' | 'none'

export type CelebrationKind =
  | 'streak'
  | 'achievement'
  | 'all-done'
  | 'goal-completed'
  | 'level-up'

export interface CelebrationPayloadMap {
  streak: { streak: number }
  achievement: { achievementId: string; xpReward: number }
  'all-done': Record<string, never>
  'goal-completed': { name: string }
  'level-up': { level: number }
}

export type CelebrationQueueItem =
  | {
      id: string
      kind: 'streak'
      payload: CelebrationPayloadMap['streak']
      priority: number
      sequence: number
    }
  | {
      id: string
      kind: 'achievement'
      payload: CelebrationPayloadMap['achievement']
      priority: number
      sequence: number
    }
  | {
      id: string
      kind: 'all-done'
      payload: CelebrationPayloadMap['all-done']
      priority: number
      sequence: number
    }
  | {
      id: string
      kind: 'goal-completed'
      payload: CelebrationPayloadMap['goal-completed']
      priority: number
      sequence: number
    }
  | {
      id: string
      kind: 'level-up'
      payload: CelebrationPayloadMap['level-up']
      priority: number
      sequence: number
    }

function getCelebrationPriority(kind: CelebrationKind): number {
  switch (kind) {
    case 'streak':
      return 0
    case 'achievement':
      return 1
    case 'goal-completed':
    case 'all-done':
      return 2
    case 'level-up':
      return 3
    default:
      return 99
  }
}

function sortCelebrationQueue(queue: CelebrationQueueItem[]): CelebrationQueueItem[] {
  return [...queue].sort((left, right) => {
    if (left.priority !== right.priority) {
      return left.priority - right.priority
    }

    return left.sequence - right.sequence
  })
}

function isDuplicateCelebration(
  queue: CelebrationQueueItem[],
  active: CelebrationQueueItem | null,
  candidate: CelebrationQueueItem,
): boolean {
  const matches = [active, ...queue]
    .filter((item): item is CelebrationQueueItem => item !== null)
    .some((item) => {
      if (item.kind !== candidate.kind) return false

      switch (item.kind) {
        case 'streak':
          return item.payload.streak === (candidate.payload as CelebrationPayloadMap['streak']).streak
        case 'achievement':
          return item.payload.achievementId === (candidate.payload as CelebrationPayloadMap['achievement']).achievementId
        case 'goal-completed':
          return item.payload.name === (candidate.payload as CelebrationPayloadMap['goal-completed']).name
        case 'level-up':
          return item.payload.level === (candidate.payload as CelebrationPayloadMap['level-up']).level
        case 'all-done':
          return true
        default:
          return false
      }
    })

  return matches
}

function createCelebrationItem<TKind extends CelebrationKind>(
  kind: TKind,
  payload: CelebrationPayloadMap[TKind],
  sequence: number,
): Extract<CelebrationQueueItem, { kind: TKind }> {
  return {
    id: `${kind}-${sequence}`,
    kind,
    payload,
    priority: getCelebrationPriority(kind),
    sequence,
  } as Extract<CelebrationQueueItem, { kind: TKind }>
}

function deriveLegacyCelebrationState(activeCelebration: CelebrationQueueItem | null): Pick<
  UIStoreState,
  'streakCelebration' | 'allDoneCelebration' | 'goalCompletedCelebration'
> {
  return {
    streakCelebration:
      activeCelebration?.kind === 'streak'
        ? activeCelebration.payload
        : null,
    allDoneCelebration: activeCelebration?.kind === 'all-done',
    goalCompletedCelebration:
      activeCelebration?.kind === 'goal-completed'
        ? activeCelebration.payload
        : null,
  }
}

type ActiveCelebrationState = Pick<
  UIStoreState,
  'activeCelebration' | 'queuedCelebrations' | 'streakCelebration' | 'allDoneCelebration' | 'goalCompletedCelebration'
>

function activateNextCelebration(queue: CelebrationQueueItem[]): ActiveCelebrationState {
  const sortedQueue = sortCelebrationQueue(queue)
  const [nextCelebration, ...remainingCelebrations] = sortedQueue

  return {
    activeCelebration: nextCelebration ?? null,
    queuedCelebrations: remainingCelebrations,
    ...deriveLegacyCelebrationState(nextCelebration ?? null),
  }
}

export interface PersistedUIState {
  activeFilters: HabitsFilter
  selectedDate: string
  activeView: UIStoreState['activeView']
  searchQuery: string
  selectedFrequency: HabitFrequencyFilter | null
  selectedTagIds: string[]
  showCompleted: boolean
}

export interface UIStoreState {
  activeFilters: HabitsFilter
  setFilters: (filters: Partial<HabitsFilter>) => void

  selectedDate: string
  setSelectedDate: (date: string) => void

  activeView: 'today' | 'all' | 'general' | 'goals'
  setActiveView: (view: 'today' | 'all' | 'general' | 'goals') => void

  activeCelebration: CelebrationQueueItem | null
  queuedCelebrations: CelebrationQueueItem[]
  enqueueCelebration: <TKind extends CelebrationKind>(
    kind: TKind,
    payload: CelebrationPayloadMap[TKind],
  ) => void
  completeActiveCelebration: (id?: string) => void
  hasCelebrationInFlight: () => boolean

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

  selectedFrequency: HabitFrequencyFilter | null
  setSelectedFrequency: (frequency: HabitFrequencyFilter | null) => void

  selectedTagIds: string[]
  setSelectedTagIds: (tagIds: string[]) => void

  showCompleted: boolean
  setShowCompleted: (show: boolean) => void
}

export function getPersistedUIState(state: UIStoreState): PersistedUIState {
  return {
    activeFilters: state.activeFilters,
    selectedDate: state.selectedDate,
    activeView: state.activeView,
    searchQuery: state.searchQuery,
    selectedFrequency: state.selectedFrequency,
    selectedTagIds: state.selectedTagIds,
    showCompleted: state.showCompleted,
  }
}

export function createUIStoreState(
  set: UIStoreSet,
  get: UIStoreGet,
): UIStoreState {
  let createdHabitTimer: ReturnType<typeof setTimeout> | undefined
  let celebrationSequence = 0

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

    activeCelebration: null,
    queuedCelebrations: [],
    streakCelebration: null,
    allDoneCelebration: false,
    allDoneCelebratedDate: '',
    goalCompletedCelebration: null,

    enqueueCelebration: (kind, payload) =>
      set((state) => {
        const nextItem = createCelebrationItem(kind, payload, celebrationSequence)
        celebrationSequence += 1

        if (isDuplicateCelebration(state.queuedCelebrations, state.activeCelebration, nextItem)) {
          return {}
        }

        const nextQueue = [...state.queuedCelebrations, nextItem]
        if (state.activeCelebration) {
          return { queuedCelebrations: sortCelebrationQueue(nextQueue) }
        }

        return activateNextCelebration(nextQueue)
      }),

    completeActiveCelebration: (id) =>
      set((state) => {
        if (!state.activeCelebration) return {}
        if (id && state.activeCelebration.id !== id) return {}
        return activateNextCelebration(state.queuedCelebrations)
      }),

    hasCelebrationInFlight: () => {
      const state = get()
      return state.activeCelebration !== null || state.queuedCelebrations.length > 0
    },

    setStreakCelebration: (data) =>
      set((state) => {
        if (data) {
          const nextItem = createCelebrationItem('streak', data, celebrationSequence)
          celebrationSequence += 1

          if (isDuplicateCelebration(state.queuedCelebrations, state.activeCelebration, nextItem)) {
            return {}
          }

          const nextQueue = [...state.queuedCelebrations, nextItem]
          if (state.activeCelebration) {
            return { queuedCelebrations: sortCelebrationQueue(nextQueue) }
          }

          return activateNextCelebration(nextQueue)
        }

        const remainingQueued = state.queuedCelebrations.filter((item) => item.kind !== 'streak')
        if (state.activeCelebration?.kind === 'streak') {
          return activateNextCelebration(remainingQueued)
        }

        return {
          queuedCelebrations: remainingQueued,
          streakCelebration: null,
        }
      }),

    setAllDoneCelebration: (value) =>
      set((state) => {
        if (value) {
          const nextItem = createCelebrationItem('all-done', {}, celebrationSequence)
          celebrationSequence += 1

          if (isDuplicateCelebration(state.queuedCelebrations, state.activeCelebration, nextItem)) {
            return {}
          }

          const nextQueue = [...state.queuedCelebrations, nextItem]
          if (state.activeCelebration) {
            return { queuedCelebrations: sortCelebrationQueue(nextQueue) }
          }

          return activateNextCelebration(nextQueue)
        }

        const remainingQueued = state.queuedCelebrations.filter((item) => item.kind !== 'all-done')
        if (state.activeCelebration?.kind === 'all-done') {
          return activateNextCelebration(remainingQueued)
        }

        return {
          queuedCelebrations: remainingQueued,
          allDoneCelebration: false,
        }
      }),

    setGoalCompletedCelebration: (data) =>
      set((state) => {
        if (data) {
          const nextItem = createCelebrationItem('goal-completed', data, celebrationSequence)
          celebrationSequence += 1

          if (isDuplicateCelebration(state.queuedCelebrations, state.activeCelebration, nextItem)) {
            return {}
          }

          const nextQueue = [...state.queuedCelebrations, nextItem]
          if (state.activeCelebration) {
            return { queuedCelebrations: sortCelebrationQueue(nextQueue) }
          }

          return activateNextCelebration(nextQueue)
        }

        const remainingQueued = state.queuedCelebrations.filter((item) => item.kind !== 'goal-completed')
        if (state.activeCelebration?.kind === 'goal-completed') {
          return activateNextCelebration(remainingQueued)
        }

        return {
          queuedCelebrations: remainingQueued,
          goalCompletedCelebration: null,
        }
      }),

    checkAllDoneCelebration: (habitsById) => {
      const { activeFilters, allDoneCelebratedDate, enqueueCelebration } = get()
      const today = formatAPIDate(new Date())

      if (activeFilters.dateFrom !== today || activeFilters.dateTo !== today) return
      if (allDoneCelebratedDate === today) return
      if (habitsById.size === 0) return

      const topLevel = Array.from(habitsById.values()).filter((h) => h.parentId === null)
      const allDone = topLevel.every((h) => h.isCompleted)
      const hasCompletion = topLevel.some((h) => h.isCompleted)

      if (allDone && hasCompletion) {
        set({ allDoneCelebratedDate: today })
        enqueueCelebration('all-done', {})
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

    selectedFrequency: null,
    setSelectedFrequency: (frequency) => set({ selectedFrequency: frequency }),

    selectedTagIds: [],
    setSelectedTagIds: (tagIds) => set({ selectedTagIds: tagIds }),

    showCompleted: false,
    setShowCompleted: (show) => set({ showCompleted: show }),
  }
}

import type {
  HabitDetail,
  HabitScheduleChild,
  HabitScheduleItem,
  LinkedGoalUpdate,
  NormalizedHabit,
} from '../types/habit'
import type { Goal } from '../types/goal'
import { formatAPIDate } from './dates'

export interface NormalizedHabitQueryData {
  habitsById: Map<string, NormalizedHabit>
  childrenByParent: Map<string, string[]>
  topLevelHabits: NormalizedHabit[]
  totalCount: number
  totalPages: number
  currentPage: number
}

export function sortNormalizedHabits(a: NormalizedHabit, b: NormalizedHabit): number {
  if (a.position !== null && b.position !== null) {
    const diff = a.position - b.position
    if (diff !== 0) return diff
  }

  if (a.position !== null && b.position === null) return -1
  if (a.position === null && b.position !== null) return 1

  return a.createdAtUtc.localeCompare(b.createdAtUtc)
}

function normalizeChildren(
  children: HabitScheduleChild[],
  parentId: string,
  rootItem: HabitScheduleItem,
  map: Map<string, NormalizedHabit>,
): void {
  const todayStr = formatAPIDate(new Date())

  for (const child of children) {
    const { children: grandchildren, ...childData } = child
    map.set(child.id, {
      ...childData,
      createdAtUtc: rootItem.createdAtUtc,
      parentId,
      position: child.position ?? null,
      scheduledDates: [],
      isOverdue:
        !child.isCompleted &&
        !child.frequencyUnit &&
        !!child.dueDate &&
        child.dueDate < todayStr,
      reminderEnabled: false,
      reminderTimes: [],
      scheduledReminders: [],
      slipAlertEnabled: false,
      hasSubHabits: child.hasSubHabits ?? grandchildren.length > 0,
      flexibleTarget: null,
      flexibleCompleted: null,
      isLoggedInRange: child.isLoggedInRange ?? false,
      instances: child.instances ?? [],
      searchMatches: child.searchMatches ?? null,
    })

    if (grandchildren.length > 0) {
      normalizeChildren(grandchildren, child.id, rootItem, map)
    }
  }
}

export function normalizeHabits(
  items: HabitScheduleItem[],
): Map<string, NormalizedHabit> {
  const map = new Map<string, NormalizedHabit>()

  for (const item of items) {
    const { children, ...parentData } = item
    map.set(item.id, {
      ...parentData,
      parentId: null,
      position: item.position ?? null,
      hasSubHabits: item.hasSubHabits,
      flexibleTarget: item.flexibleTarget ?? null,
      flexibleCompleted: item.flexibleCompleted ?? null,
      isLoggedInRange: false,
      instances: item.instances ?? [],
      searchMatches: item.searchMatches ?? null,
    })

    if (children.length > 0) {
      normalizeChildren(children, item.id, item, map)
    }
  }

  return map
}

export function buildChildrenIndex(
  habitsById: Map<string, NormalizedHabit>,
): Map<string, string[]> {
  const index = new Map<string, string[]>()

  for (const habit of habitsById.values()) {
    if (habit.parentId === null) continue

    const siblings = index.get(habit.parentId)
    if (siblings) {
      siblings.push(habit.id)
    } else {
      index.set(habit.parentId, [habit.id])
    }
  }

  return index
}

export function normalizeHabitQueryData(
  items: HabitScheduleItem[],
): NormalizedHabitQueryData {
  const habitsById = normalizeHabits(items)
  const childrenByParent = buildChildrenIndex(habitsById)
  const topLevelHabits = Array.from(habitsById.values())
    .filter((habit) => habit.parentId === null)
    .sort(sortNormalizedHabits)

  return {
    habitsById,
    childrenByParent,
    topLevelHabits,
    totalCount: items.length,
    totalPages: 1,
    currentPage: 1,
  }
}

export function applyLinkedGoalUpdates(
  goals: Goal[],
  updates: LinkedGoalUpdate[],
): Goal[] {
  return goals.map((goal) => {
    const update = updates.find((entry) => entry.goalId === goal.id)
    if (!update) return goal

    return {
      ...goal,
      currentValue: update.newProgress,
      progressPercentage: update.targetValue > 0
        ? Math.min(100, Math.round((update.newProgress / update.targetValue) * 1000) / 10)
        : 0,
    }
  })
}

/**
 * Converts a single HabitDetail (from GET /api/habits/:id) to a NormalizedHabit
 * stub suitable for HabitDetailDrawer's `habit` prop. Fills schedule/list-only
 * fields with safe defaults; the drawer's internal useHabitFullDetail loads the
 * authoritative metrics and logs separately.
 *
 * Use this when opening the drawer from a context that does NOT have a cached
 * habit list (e.g., the chat screen tapping an action chip).
 */
export function habitDetailToNormalized(detail: HabitDetail): NormalizedHabit {
  const { children: _children, ...base } = detail
  return {
    ...base,
    parentId: null,
    scheduledDates: [],
    isOverdue: false,
    slipAlertEnabled: false,
    tags: [],
    hasSubHabits: detail.children.length > 0,
    flexibleTarget: null,
    flexibleCompleted: null,
    isLoggedInRange: false,
    instances: [],
  }
}

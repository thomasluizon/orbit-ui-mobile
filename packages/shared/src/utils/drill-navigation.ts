import type {
  HabitDetail,
  HabitDetailChild,
  NormalizedHabit,
} from '../types/habit'
import { formatAPIDate } from './dates'
import { fallbackChildOverdue } from './habit-normalization'
import {
  createHabitVisibilityHelpers,
  isHabitLoggedOnDate,
  type HabitVisibilityOptions,
  type HabitVisibilityView,
} from './habit-visibility'

export interface NormalizedDrillDetail {
  parent: NormalizedHabit
  childrenByParent: Map<string, NormalizedHabit[]>
}

/**
 * Fetches a habit's detail through the injected platform fetcher and
 * normalizes it for drill-down navigation against today's date.
 */
export async function loadDrillChildren(
  habitId: string,
  fetchHabitDetail: (habitId: string) => Promise<HabitDetail>,
): Promise<NormalizedDrillDetail> {
  const detail = await fetchHabitDetail(habitId)
  return normalizeHabitDetailForDrill(detail, formatAPIDate(new Date()))
}

/**
 * Merges freshly fetched drill children into the existing children-by-parent
 * map, returning a new map so state containers can swap by reference.
 */
export function mergeDrillChildrenMap(
  previous: ReadonlyMap<string, NormalizedHabit[]>,
  fetched: ReadonlyMap<string, NormalizedHabit[]>,
): Map<string, NormalizedHabit[]> {
  const next = new Map(previous)
  for (const [parentId, children] of fetched.entries()) {
    next.set(parentId, children)
  }
  return next
}

function enrichDrillChild(
  child: NormalizedHabit,
  listChild: NormalizedHabit | undefined,
  options: HabitVisibilityOptions,
  isSelectedDateToday: boolean,
  today: string,
): NormalizedHabit {
  return {
    ...child,
    ...(!listChild && !isSelectedDateToday ? { isOverdue: false } : {}),
    ...(!listChild && isSelectedDateToday && options.showCompleted &&
      child.isCompleted && child.frequencyUnit === null && child.dueDate <= today
      ? { isLoggedInRange: true }
      : {}),
    ...(listChild ? {
      scheduledDates: listChild.scheduledDates,
      isLoggedInRange: listChild.isLoggedInRange,
      instances: listChild.instances,
      searchMatches: listChild.searchMatches,
      isOverdue: listChild.isOverdue,
      ...(listChild.isGeneral ? { isCompleted: listChild.isCompleted } : {}),
    } : {}),
  }
}

export function getVisibleDrillChildren(
  parentId: string,
  drillChildrenMap: ReadonlyMap<string, NormalizedHabit[]>,
  options: HabitVisibilityOptions,
  view: HabitVisibilityView,
  today: string,
): NormalizedHabit[] {
  const isSelectedDateToday = !options.selectedDate || options.selectedDate === today
  const habitsById = new Map(options.habitsById)
  const childrenByParent = new Map(options.childrenByParent)

  for (const [id, children] of drillChildrenMap) {
    childrenByParent.set(id, children.map((child) => child.id))
    for (const child of children) {
      const listChild = options.habitsById.get(child.id)
      habitsById.set(child.id, enrichDrillChild(child, listChild, options, isSelectedDateToday, today))
    }
  }

  return createHabitVisibilityHelpers({
    ...options,
    habitsById,
    childrenByParent,
  }).getVisibleChildren(parentId, view)
}

export function canRevealCompletedDrillChildren(
  parentId: string,
  drillChildrenMap: ReadonlyMap<string, NormalizedHabit[]>,
  options: HabitVisibilityOptions,
  view: HabitVisibilityView,
  today: string,
): boolean {
  if (options.showCompleted) return false
  return getVisibleDrillChildren(parentId, drillChildrenMap, {
    ...options,
    showCompleted: true,
  }, view, today).length > 0
}

export function countCompletedDrillChildren(
  children: readonly NormalizedHabit[],
  selectedDate: string,
): number {
  return children.filter((child) =>
    isHabitLoggedOnDate(child, selectedDate) ||
    (child.isCompleted && (child.isGeneral || child.frequencyUnit === null)),
  ).length
}

export function normalizeDrillDetailChild(
  child: HabitDetailChild,
  parentId: string | null,
  today: string,
): NormalizedHabit {
  return {
    id: child.id,
    title: child.title,
    description: child.description,
    emoji: child.emoji ?? null,
    frequencyUnit: child.frequencyUnit,
    frequencyQuantity: child.frequencyQuantity,
    intervalWeeks: child.intervalWeeks,
    isBadHabit: child.isBadHabit,
    isCompleted: child.isCompleted,
    isGeneral: child.isGeneral,
    isFlexible: child.isFlexible,
    days: child.days,
    dueDate: child.dueDate,
    dueTime: child.dueTime ?? '',
    dueEndTime: child.dueEndTime ?? '',
    endDate: child.endDate ?? '',
    position: child.position ?? 0,
    checklistItems: child.checklistItems,
    createdAtUtc: '',
    parentId,
    scheduledDates: [],
    isOverdue: child.isOverdue ?? fallbackChildOverdue(child, today),
    reminderEnabled: false,
    reminderTimes: [],
    scheduledReminders: [],
    slipAlertEnabled: false,
    tags: [],
    hasSubHabits: child.children.length > 0,
    flexibleTarget: null,
    flexibleCompleted: 0,
    isLoggedInRange: false,
    linkedGoals: [],
    instances: [],
    searchMatches: null,
  }
}

export function normalizeHabitDetailForDrill(
  detail: HabitDetail,
  today: string,
): NormalizedDrillDetail {
  const safeChildren = detail.children
  const parent = normalizeDrillDetailChild(
    { ...detail, children: safeChildren },
    null,
    today,
  )
  parent.createdAtUtc = detail.createdAtUtc
  parent.position = detail.position ?? 0
  parent.reminderEnabled = detail.reminderEnabled
  parent.reminderTimes = detail.reminderTimes
  parent.scheduledReminders = detail.scheduledReminders

  const childrenByParent = new Map<string, NormalizedHabit[]>()
  const children = safeChildren.map((child) =>
    normalizeDrillDetailChild(child, detail.id, today),
  )
  childrenByParent.set(detail.id, children)

  for (const child of safeChildren) {
    const grandChildren = child.children
    if (grandChildren.length === 0) continue
    childrenByParent.set(
      child.id,
      grandChildren.map((grandChild) =>
        normalizeDrillDetailChild(grandChild, child.id, today),
      ),
    )
  }

  return {
    parent,
    childrenByParent,
  }
}

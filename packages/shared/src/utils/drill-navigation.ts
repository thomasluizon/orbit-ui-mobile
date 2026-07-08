import type {
  HabitDetail,
  HabitDetailChild,
  NormalizedHabit,
} from '../types/habit'
import { formatAPIDate } from './dates'

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

function fallbackChildOverdue(
  child: Pick<HabitDetailChild, 'isCompleted' | 'frequencyUnit' | 'dueDate'>,
  today: string,
): boolean {
  return !child.isCompleted &&
    !child.frequencyUnit &&
    !!child.dueDate &&
    child.dueDate < today
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
    checklistItems: child.checklistItems ?? [],
    createdAtUtc: '',
    parentId,
    scheduledDates: [],
    isOverdue: child.isOverdue ?? fallbackChildOverdue(child, today),
    reminderEnabled: false,
    reminderTimes: [],
    scheduledReminders: [],
    slipAlertEnabled: false,
    tags: [],
    hasSubHabits: (child.children?.length ?? 0) > 0,
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
  const safeChildren = detail.children ?? []
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
    const grandChildren = child.children ?? []
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

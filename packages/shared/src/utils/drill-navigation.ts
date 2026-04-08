import type {
  HabitDetail,
  HabitDetailChild,
  NormalizedHabit,
} from '../types/habit'

export interface NormalizedDrillDetail {
  parent: NormalizedHabit
  childrenByParent: Map<string, NormalizedHabit[]>
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
    isOverdue:
      !child.isCompleted &&
      !child.frequencyUnit &&
      !!child.dueDate &&
      child.dueDate < today,
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
    { ...detail, children: safeChildren } as HabitDetailChild,
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

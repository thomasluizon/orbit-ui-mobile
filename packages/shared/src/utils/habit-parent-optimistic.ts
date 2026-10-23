import type { HabitScheduleItem, HabitScheduleChild, MoveHabitParentRequest } from '../types/habit'
import { findHabitInList as findHabitNode } from './habit-optimistic'

type HabitTreeNode = HabitScheduleItem | HabitScheduleChild

function cloneChildHabit(node: HabitTreeNode): HabitScheduleChild {
  const children = node.children.map((child) => cloneChildHabit(child))

  return {
    ...node,
    id: node.id,
    createdAtUtc: node.createdAtUtc,
    reminderEnabled: node.reminderEnabled,
    reminderTimes: node.reminderTimes,
    scheduledReminders: node.scheduledReminders,
    relativeReminders: node.relativeReminders,
    slipAlertEnabled: node.slipAlertEnabled,
    title: node.title,
    description: node.description,
    frequencyUnit: node.frequencyUnit,
    frequencyQuantity: node.frequencyQuantity,
    isBadHabit: node.isBadHabit,
    isCompleted: node.isCompleted,
    isGeneral: node.isGeneral,
    isFlexible: node.isFlexible,
    days: node.days,
    dueDate: node.dueDate,
    dueTime: node.dueTime,
    dueEndTime: node.dueEndTime,
    endDate: node.endDate,
    scheduledDates: ('scheduledDates' in node ? node.scheduledDates : []) ?? [],
    isOverdue: ('isOverdue' in node ? node.isOverdue : false) ?? false,
    position: node.position,
    checklistItems: node.checklistItems,
    tags: node.tags,
    children,
    hasSubHabits: children.length > 0 || node.hasSubHabits,
    isLoggedInRange: ('isLoggedInRange' in node ? node.isLoggedInRange : false) ?? false,
    instances: 'instances' in node ? node.instances : [],
    searchMatches: node.searchMatches ?? null,
  }
}

function cloneTopLevelHabit(node: HabitTreeNode): HabitScheduleItem {
  const children = node.children.map((child) => cloneChildHabit(child))

  return {
    ...node,
    id: node.id,
    title: node.title,
    description: node.description,
    frequencyUnit: node.frequencyUnit,
    frequencyQuantity: node.frequencyQuantity,
    isBadHabit: node.isBadHabit,
    isCompleted: node.isCompleted,
    isGeneral: node.isGeneral,
    isFlexible: node.isFlexible,
    days: node.days,
    dueDate: node.dueDate,
    dueTime: node.dueTime,
    dueEndTime: node.dueEndTime,
    endDate: node.endDate,
    position: node.position,
    checklistItems: node.checklistItems,
    createdAtUtc: node.createdAtUtc ?? new Date().toISOString(),
    scheduledDates: ('scheduledDates' in node ? node.scheduledDates : []) ?? [],
    isOverdue: ('isOverdue' in node ? node.isOverdue : false) ?? false,
    reminderEnabled: node.reminderEnabled ?? false,
    reminderTimes: node.reminderTimes ?? [],
    scheduledReminders: node.scheduledReminders ?? [],
    relativeReminders: node.relativeReminders ?? [],
    slipAlertEnabled: node.slipAlertEnabled ?? false,
    tags: node.tags,
    children,
    hasSubHabits: children.length > 0 || node.hasSubHabits,
    flexibleTarget: ('flexibleTarget' in node ? node.flexibleTarget : null) ?? null,
    flexibleCompleted: ('flexibleCompleted' in node ? node.flexibleCompleted : null) ?? null,
    isLoggedInRange: ('isLoggedInRange' in node ? node.isLoggedInRange : false) ?? false,
    linkedGoals: 'linkedGoals' in node ? node.linkedGoals : [],
    instances: 'instances' in node ? node.instances : [],
    searchMatches: node.searchMatches ?? null,
  }
}

function findHabitParentId(
  items: HabitScheduleItem[],
  habitId: string,
  parentId: string | null = null,
): string | null | undefined {
  for (const item of items) {
    if (item.id === habitId) return parentId

    const nested = findHabitParentIdInChildren(item.children, habitId, item.id)
    if (nested !== undefined) return nested
  }

  return undefined
}

function findHabitParentIdInChildren(
  children: HabitScheduleChild[],
  habitId: string,
  parentId: string,
): string | null | undefined {
  for (const child of children) {
    if (child.id === habitId) return parentId

    const nested = findHabitParentIdInChildren(child.children, habitId, child.id)
    if (nested !== undefined) return nested
  }

  return undefined
}

function containsHabitId(node: HabitTreeNode, habitId: string): boolean {
  if (node.id === habitId) return true

  return node.children.some((child) => containsHabitId(child, habitId))
}

function reindexChildHabits(children: HabitScheduleChild[]): HabitScheduleChild[] {
  return children.map((child, index) => {
    const nextChildren = reindexChildHabits(child.children)

    return {
      ...child,
      position: index,
      children: nextChildren,
      hasSubHabits: nextChildren.length > 0,
    }
  })
}

function reindexTopLevelHabits(items: HabitScheduleItem[]): HabitScheduleItem[] {
  return items.map((item, index) => {
    const nextChildren = reindexChildHabits(item.children)

    return {
      ...item,
      position: index,
      children: nextChildren,
      hasSubHabits: nextChildren.length > 0,
    }
  })
}

function extractHabitFromChildren(
  children: HabitScheduleChild[],
  habitId: string,
): { children: HabitScheduleChild[]; removed: HabitTreeNode | null } {
  let removed: HabitTreeNode | null = null

  const nextChildren = children.flatMap((child) => {
    if (child.id === habitId) {
      removed = child
      return []
    }

    const nested = extractHabitFromChildren(child.children, habitId)
    if (nested.removed) {
      removed = nested.removed
    }

    return [{
      ...child,
      children: nested.children,
      hasSubHabits: nested.children.length > 0,
    }]
  })

  return { children: nextChildren, removed }
}

function extractHabitFromItems(
  items: HabitScheduleItem[],
  habitId: string,
): { items: HabitScheduleItem[]; removed: HabitTreeNode | null } {
  let removed: HabitTreeNode | null = null

  const nextItems = items.flatMap((item) => {
    if (item.id === habitId) {
      removed = item
      return []
    }

    const nested = extractHabitFromChildren(item.children, habitId)
    if (nested.removed) {
      removed = nested.removed
    }

    return [{
      ...item,
      children: nested.children,
      hasSubHabits: nested.children.length > 0,
    }]
  })

  return { items: nextItems, removed }
}

function insertHabitIntoChildren(
  children: HabitScheduleChild[],
  parentId: string,
  habit: HabitScheduleChild,
): HabitScheduleChild[] {
  return children.map((child) => {
    if (child.id === parentId) {
      return {
        ...child,
        children: [...child.children, habit],
        hasSubHabits: true,
      }
    }

    const nextChildren = insertHabitIntoChildren(child.children, parentId, habit)
    return {
      ...child,
      children: nextChildren,
      hasSubHabits: nextChildren.length > 0,
    }
  })
}

function insertHabitIntoItems(
  items: HabitScheduleItem[],
  parentId: string,
  habit: HabitScheduleChild,
): HabitScheduleItem[] {
  return items.map((item) => {
    if (item.id === parentId) {
      return {
        ...item,
        children: [...item.children, habit],
        hasSubHabits: true,
      }
    }

    const nextChildren = insertHabitIntoChildren(item.children, parentId, habit)
    return {
      ...item,
      children: nextChildren,
      hasSubHabits: nextChildren.length > 0,
    }
  })
}

export function optimisticMoveHabitParent(
  items: HabitScheduleItem[],
  habitId: string,
  parentId: MoveHabitParentRequest['parentId'],
  removeIfTargetAbsent = false,
): HabitScheduleItem[] {
  const currentParentId = findHabitParentId(items, habitId)
  if (currentParentId === undefined || currentParentId === parentId) {
    return items
  }

  const sourceNode = findHabitNode(items, habitId)
  if (!sourceNode) return items

  if (parentId !== null) {
    const targetNode = findHabitNode(items, parentId)
    if ((!targetNode && !removeIfTargetAbsent) || containsHabitId(sourceNode, parentId)) {
      return items
    }
  }

  const extracted = extractHabitFromItems(items, habitId)
  if (!extracted.removed) return items

  if (parentId === null) {
    return reindexTopLevelHabits([
      ...extracted.items,
      cloneTopLevelHabit(extracted.removed),
    ])
  }

  const nextItems = insertHabitIntoItems(
    extracted.items,
    parentId,
    cloneChildHabit(extracted.removed),
  )

  return reindexTopLevelHabits(nextItems)
}

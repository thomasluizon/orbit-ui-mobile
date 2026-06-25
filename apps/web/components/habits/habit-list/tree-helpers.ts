import type { NormalizedHabit } from '@orbit/shared/types/habit'
import type { MoveParentOption } from './move-parent-overlay'

export type HabitView = 'today' | 'all' | 'general'

export interface DragItem {
  id: string
  habit: NormalizedHabit
  depth: number
  parentId: string | null
  hasChildren: boolean
  hasSubHabits: boolean
}

export interface MoveTargetValidation {
  valid: boolean
  reason: string | null
}

interface MoveValidationDeps {
  habitsById: Map<string, NormalizedHabit>
  getChildren: (habitId: string) => NormalizedHabit[]
  maxHabitDepth: number
  t: (key: string, params?: Record<string, string | number | Date>) => string
}

interface MoveParentOptionsDeps {
  topLevelHabits: NormalizedHabit[]
  getChildren: (habitId: string) => NormalizedHabit[]
  validateMoveTarget: (
    targetParentId: string | null,
    draggedId: string,
  ) => MoveTargetValidation
  t: (key: string, params?: Record<string, string | number | Date>) => string
}

/** Depth of a habit in the tree (0 = top level), by walking parent links. */
export function getHabitDepth(
  habitsById: Map<string, NormalizedHabit>,
  habitId: string,
): number {
  let depth = 0
  let current = habitsById.get(habitId)
  while (current?.parentId) {
    depth++
    current = habitsById.get(current.parentId)
  }
  return depth
}

/** Deepest depth reachable below (and including) a habit, given a base depth. */
export function getSubtreeMaxDepth(
  getChildren: (habitId: string) => NormalizedHabit[],
  habitId: string,
  baseDepth: number,
): number {
  let max = baseDepth
  const children = getChildren(habitId)
  for (const child of children) {
    const childMax = getSubtreeMaxDepth(getChildren, child.id, baseDepth + 1)
    if (childMax > max) max = childMax
  }
  return max
}

/** Whether candidateId sits anywhere below ancestorId in the tree. */
export function isHabitDescendant(
  habitsById: Map<string, NormalizedHabit>,
  candidateId: string,
  ancestorId: string,
): boolean {
  let current = habitsById.get(candidateId)
  while (current?.parentId) {
    if (current.parentId === ancestorId) return true
    current = habitsById.get(current.parentId)
  }
  return false
}

/** Validates whether draggedId may be re-parented under targetParentId,
 *  rejecting self, descendant targets, and depth-limit violations. */
export function validateMoveTarget(
  deps: MoveValidationDeps,
  targetParentId: string | null,
  draggedId: string,
): MoveTargetValidation {
  const { habitsById, getChildren, maxHabitDepth, t } = deps

  if (targetParentId === draggedId) {
    return { valid: false, reason: t('habits.moveParent.invalidSelf') }
  }

  if (targetParentId && isHabitDescendant(habitsById, targetParentId, draggedId)) {
    return { valid: false, reason: t('habits.moveParent.invalidDescendant') }
  }

  const newParentDepth = targetParentId
    ? getHabitDepth(habitsById, targetParentId)
    : -1
  const subtreeMax = getSubtreeMaxDepth(getChildren, draggedId, newParentDepth + 1)
  if (subtreeMax >= maxHabitDepth) {
    return {
      valid: false,
      reason: t('habits.moveParent.invalidDepth', { max: maxHabitDepth }),
    }
  }

  return { valid: true, reason: null }
}

/** Builds the flattened, depth-ordered list of move-parent targets (root plus
 *  every habit in pre-order), each tagged with its validation result. */
export function buildMoveParentOptions(
  deps: MoveParentOptionsDeps,
  movingHabitId: string,
): MoveParentOption[] {
  const { topLevelHabits, getChildren, validateMoveTarget: validate, t } = deps

  const options: MoveParentOption[] = []
  const rootValidation = validate(null, movingHabitId)
  options.push({
    id: null,
    label: t('habits.moveParent.toRoot'),
    depth: 0,
    disabled: !rootValidation.valid,
    reason: rootValidation.reason,
  })

  const stack: Array<{ habit: NormalizedHabit; depth: number }> = []
  for (let i = topLevelHabits.length - 1; i >= 0; i--) {
    const habit = topLevelHabits[i]
    if (habit) stack.push({ habit, depth: 0 })
  }
  while (stack.length > 0) {
    const top = stack.pop()
    if (!top) break
    const { habit, depth } = top
    const validation = validate(habit.id, movingHabitId)
    options.push({
      id: habit.id,
      label: habit.title,
      depth,
      disabled: !validation.valid,
      reason: validation.reason,
    })
    const children = getChildren(habit.id)
    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i]
      if (child) stack.push({ habit: child, depth: depth + 1 })
    }
  }

  return options
}

/** Flattens the visible habit forest into draggable rows in render order,
 *  descending into a habit's children only when it is not collapsed. */
export function buildDragItemsFlat(
  habits: NormalizedHabit[],
  collapsedIds: Set<string>,
  getVisibleChildrenForView: (
    habitId: string,
    view: HabitView,
  ) => NormalizedHabit[],
  view: HabitView,
): DragItem[] {
  const items: DragItem[] = []

  function addHabitTree(
    habit: NormalizedHabit,
    depth: number,
    parentId: string | null,
  ) {
    const visChildren = getVisibleChildrenForView(habit.id, view)
    items.push({
      id: habit.id,
      habit,
      depth,
      parentId,
      hasChildren: visChildren.length > 0,
      hasSubHabits: habit.hasSubHabits,
    })
    if (!collapsedIds.has(habit.id)) {
      for (const child of visChildren) {
        addHabitTree(child, depth + 1, habit.id)
      }
    }
  }

  for (const h of habits) {
    addHabitTree(h, 0, null)
  }

  return items
}

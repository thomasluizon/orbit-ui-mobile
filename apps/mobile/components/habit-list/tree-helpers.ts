import type { NormalizedHabit } from '@orbit/shared/types/habit'
import {
  isHabitSelectableAsMoveTarget,
  type ReorderableHabitItem,
} from '@orbit/shared/utils'
import type { MoveParentOption } from './move-parent-dialog'

export interface DragItem extends ReorderableHabitItem {
  id: string
  habit: NormalizedHabit
  depth: number
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
  t: (key: string, params?: Record<string, unknown>) => string
}

interface MoveParentOptionsDeps {
  topLevelHabits: NormalizedHabit[]
  getChildren: (habitId: string) => NormalizedHabit[]
  validateMoveTarget: (
    targetParentId: string | null,
    draggedId: string,
  ) => MoveTargetValidation
  t: (key: string, params?: Record<string, unknown>) => string
}

/** Depth of a habit in the tree (0 = top level), by walking parent links. */
export function getHabitDepth(
  habitsById: Map<string, NormalizedHabit>,
  habitId: string,
): number {
  let depth = 0
  let current = habitsById.get(habitId)

  while (current?.parentId) {
    depth += 1
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
  function walk(currentId: string, currentDepth: number): number {
    let maxDepth = currentDepth
    const children = getChildren(currentId)

    for (const child of children) {
      const childMaxDepth = walk(child.id, currentDepth + 1)
      if (childMaxDepth > maxDepth) {
        maxDepth = childMaxDepth
      }
    }

    return maxDepth
  }

  return walk(habitId, baseDepth)
}

/** Whether candidateId sits anywhere below ancestorId in the tree. */
export function isHabitDescendant(
  habitsById: Map<string, NormalizedHabit>,
  candidateId: string,
  ancestorId: string,
): boolean {
  let current = habitsById.get(candidateId)

  while (current?.parentId) {
    if (current.parentId === ancestorId) {
      return true
    }
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
    return {
      valid: false,
      reason: t('habits.moveParent.invalidSelf'),
    }
  }

  if (targetParentId && isHabitDescendant(habitsById, targetParentId, draggedId)) {
    return {
      valid: false,
      reason: t('habits.moveParent.invalidDescendant'),
    }
  }

  const newParentDepth = targetParentId
    ? getHabitDepth(habitsById, targetParentId)
    : -1
  const subtreeMaxDepth = getSubtreeMaxDepth(
    getChildren,
    draggedId,
    newParentDepth + 1,
  )

  if (subtreeMaxDepth >= maxHabitDepth) {
    return {
      valid: false,
      reason: t('habits.moveParent.invalidDepth', { max: maxHabitDepth }),
    }
  }

  return {
    valid: true,
    reason: null,
  }
}

/** Builds the flattened, depth-ordered list of move-parent targets (root plus
 *  every selectable habit in pre-order), each tagged with its validation result,
 *  emoji, and count of selectable children. Completed one-time habits are
 *  omitted unless a descendant is still active. */
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
    emoji: null,
    depth: 0,
    childCount: 0,
    disabled: !rootValidation.valid,
    reason: rootValidation.reason,
  })

  function addOption(habit: NormalizedHabit, depth: number) {
    const selectableChildren = getChildren(habit.id).filter((child) =>
      isHabitSelectableAsMoveTarget(child, getChildren),
    )
    const validation = validate(habit.id, movingHabitId)
    options.push({
      id: habit.id,
      label: habit.title,
      emoji: habit.emoji ?? null,
      depth,
      childCount: selectableChildren.length,
      disabled: !validation.valid,
      reason: validation.reason,
    })

    for (const child of selectableChildren) {
      addOption(child, depth + 1)
    }
  }

  for (const habit of topLevelHabits) {
    if (isHabitSelectableAsMoveTarget(habit, getChildren)) {
      addOption(habit, 0)
    }
  }

  return options
}

/** Deepest inline depth rendered in the Today list before a node drills in
 *  instead of expanding: depth 0 (parent) and depths 1-2 (two sub-habit levels)
 *  are inline, anything deeper is reached via the violet drill chevron. Matches
 *  the Today (C) mockup's three inline tiers (#539). */
export const MAX_INLINE_DEPTH = 2

/** Flattens the visible habit forest into draggable rows in render order,
 *  descending into a habit's children only when it is not collapsed and the
 *  inline depth cap has not been reached. */
export function buildFlatHabitItems(
  visibleHabits: NormalizedHabit[],
  collapsedIds: Set<string>,
  getVisibleChildren: (parentId: string) => NormalizedHabit[],
): DragItem[] {
  const items: DragItem[] = []

  function addHabitTree(habit: NormalizedHabit, depth: number) {
    const children = getVisibleChildren(habit.id)
    items.push({
      id: habit.id,
      parentId: habit.parentId ?? null,
      habit,
      depth,
      hasChildren: children.length > 0,
      hasSubHabits: habit.hasSubHabits,
    })
    if (depth < MAX_INLINE_DEPTH && !collapsedIds.has(habit.id)) {
      for (const child of children) {
        addHabitTree(child, depth + 1)
      }
    }
  }

  for (const habit of visibleHabits) {
    addHabitTree(habit, 0)
  }

  return items
}

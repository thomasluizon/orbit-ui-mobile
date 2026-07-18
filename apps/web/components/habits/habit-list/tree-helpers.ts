import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { isHabitSelectableAsMoveTarget } from '@orbit/shared/utils'
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

  const visit = (habit: NormalizedHabit, depth: number): void => {
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
    for (const child of selectableChildren) visit(child, depth + 1)
  }

  for (const habit of topLevelHabits) {
    if (isHabitSelectableAsMoveTarget(habit, getChildren)) visit(habit, 0)
  }

  return options
}

/** Deepest 0-indexed depth rendered inline before a node must be drilled into.
 *  Levels 0, 1 and 2 show inline (parent + two sub-habit levels); a level-2 node
 *  with children exposes a drill affordance instead of expanding to level 3.
 *  Frozen habit-list treatment — matches the Today (C) mockup's three inline
 *  tiers (Water > Água da manhã > Copo grande, then drill).
 *  https://github.com/thomasluizon/orbit-ui-mobile/issues/539 */
export const MAX_INLINE_DEPTH = 2

/** Flattens the visible habit forest into draggable rows in render order,
 *  descending into a habit's children only when it is not collapsed and the
 *  child would stay within the inline depth cap. */
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
    if (depth < MAX_INLINE_DEPTH && !collapsedIds.has(habit.id)) {
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

/** A tonal panel: one top-level habit plus its inline descendants, grouped so
 *  the list can wrap each family (or single habit) in one surface. */
export interface HabitPanelGroup {
  rootId: string
  items: DragItem[]
}

/** Groups a depth-ordered flat item list into per-top-level-habit panels: a new
 *  panel opens at every depth-0 item and absorbs the inline descendants after it. */
export function groupHabitItemsIntoPanels(items: DragItem[]): HabitPanelGroup[] {
  const panels: HabitPanelGroup[] = []
  let current: HabitPanelGroup | null = null
  for (const item of items) {
    if (item.depth === 0 || !current) {
      current = { rootId: item.id, items: [item] }
      panels.push(current)
    } else {
      current.items.push(item)
    }
  }
  return panels
}

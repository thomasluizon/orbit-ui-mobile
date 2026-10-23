import type { HabitDetail, NormalizedHabit, UpdateHabitRequest } from '../types/habit'
import { buildChildrenIndex, sortNormalizedHabits } from './habit-normalization'
import { filterMoveTargetsBySearch, isHabitSelectableAsMoveTarget } from './habit-visibility'

export interface MoveParentOption {
  id: string | null
  label: string
  emoji: string | null
  depth: number
  childCount: number
  disabled: boolean
  reason: string | null
}

interface MoveInventoryQuery {
  data: { habitsById: ReadonlyMap<string, NormalizedHabit> } | undefined
  isSuccess: boolean
  isFetching: boolean
  isError: boolean
}

interface MoveParentInventory {
  habitsById: Map<string, NormalizedHabit>
  getChildren: (parentId: string) => NormalizedHabit[]
  topLevelHabits: NormalizedHabit[]
  state: 'loading' | 'error' | undefined
}

export function getMoveParentInventory(scheduled: MoveInventoryQuery, general: MoveInventoryQuery): MoveParentInventory {
  const state = scheduled.isError || general.isError ? 'error' as const
    : !scheduled.isSuccess || !general.isSuccess || scheduled.isFetching || general.isFetching
      || !scheduled.data || !general.data ? 'loading' as const : undefined
  const habitsById = new Map<string, NormalizedHabit>(state ? [] : [
    ...scheduled.data!.habitsById, ...general.data!.habitsById,
  ])
  const childrenByParent = buildChildrenIndex(habitsById)
  const getChildren = (parentId: string) => (childrenByParent.get(parentId) ?? [])
    .map((id) => habitsById.get(id)!).sort(sortNormalizedHabits)
  const topLevelHabits = Array.from(habitsById.values())
    .filter((habit) => habit.parentId === null).sort(sortNormalizedHabits)
  return { habitsById, getChildren, topLevelHabits, state }
}

export interface MoveTargetValidation {
  valid: boolean
  reason: string | null
}

interface MoveValidationDeps {
  habitsById: ReadonlyMap<string, NormalizedHabit>
  getChildren: (habitId: string) => NormalizedHabit[]
  maxHabitDepth: number
  t: (key: string, params?: Record<string, number>) => string
}

interface MoveParentOptionsDeps {
  includeCompleted?: boolean
  topLevelHabits: NormalizedHabit[]
  getChildren: (habitId: string) => NormalizedHabit[]
  validateMoveTarget: (
    targetParentId: string | null,
    draggedId: string,
  ) => MoveTargetValidation
  t: (key: string, params?: Record<string, number>) => string
}

/** Depth of a habit in the tree (0 = top level), by walking parent links. */
export function getHabitDepth(
  habitsById: ReadonlyMap<string, NormalizedHabit>,
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
  habitsById: ReadonlyMap<string, NormalizedHabit>,
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
 *  omitted by default unless a descendant is active; editor inclusion keeps them. */
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
      deps.includeCompleted || isHabitSelectableAsMoveTarget(child, getChildren),
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
    if (deps.includeCompleted || isHabitSelectableAsMoveTarget(habit, getChildren)) visit(habit, 0)
  }

  return options
}


export function buildEditorParentChange(baseline: HabitDetail['parentId'], selected: string | null | undefined): Pick<UpdateHabitRequest, 'parentId' | 'clearParent'> {
  if (selected === undefined || baseline === undefined || selected === baseline) return {}
  return selected === null ? { clearParent: true } : { parentId: selected }
}

export function validateEditorParent(
  deps: MoveValidationDeps,
  parentId: string | null,
  sourceId: string,
  isGeneral: boolean,
): MoveTargetValidation {
  const parent = parentId === null ? null : deps.habitsById.get(parentId)
  if (!deps.habitsById.has(sourceId) || (parentId !== null && !parent)) {
    return { valid: false, reason: deps.t('habits.loadError') }
  }
  if ((parent && parent.isGeneral !== isGeneral) || deps.getChildren(sourceId).some((child) => child.isGeneral !== isGeneral)) {
    return { valid: false, reason: deps.t('errors.api.generalMismatchWithParent') }
  }
  return validateMoveTarget(deps, parentId, sourceId)
}

export function getMoveParentPickerRows(options: MoveParentOption[], searchQuery: string): {
  rootOption: MoveParentOption | null
  showSearch: boolean
  treeRows: MoveParentOption[]
  isSearchEmpty: boolean
} {
  const rootOption = options.find((option) => option.id === null) ?? null
  const showSearch = options.filter((option) => option.id !== null).length > 8
  const rows = showSearch ? filterMoveTargetsBySearch(options, searchQuery) : options
  const treeRows = rows.filter((option) => option.id !== null)
  return { rootOption, showSearch, treeRows, isSearchEmpty: showSearch && searchQuery.trim().length > 0 && treeRows.length === 0 }
}

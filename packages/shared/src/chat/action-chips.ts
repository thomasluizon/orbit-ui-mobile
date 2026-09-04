import type { ActionResult, ConflictWarning } from '../types/chat'

interface ActionLabelKeys {
  success: string
  failed: string
}

function labelKeys(success: string, failed: string): Readonly<ActionLabelKeys> {
  return { success, failed }
}

export const ACTION_LABEL_KEYS: Readonly<Record<string, Readonly<ActionLabelKeys>>> = {
  log_habit: labelKeys('chat.action.logged', 'chat.action.logFailed'),
  create_habit: labelKeys('chat.action.created', 'chat.action.createFailed'),
  update_habit: labelKeys('chat.action.updated', 'chat.action.updateFailed'),
  delete_habit: labelKeys('chat.action.deleted', 'chat.action.deleteFailed'),
  skip_habit: labelKeys('chat.action.skipped', 'chat.action.skipFailed'),
  create_sub_habit: labelKeys('chat.action.createdSubHabit', 'chat.action.createSubHabitFailed'),
  suggest_breakdown: labelKeys('chat.action.breakdown', 'chat.action.breakdownFailed'),
  assign_tags: labelKeys('chat.action.tagsUpdated', 'chat.action.tagsUpdateFailed'),
  duplicate_habit: labelKeys('chat.action.duplicated', 'chat.action.duplicateFailed'),
  move_habit: labelKeys('chat.action.moved', 'chat.action.moveFailed'),
  LogHabit: labelKeys('chat.action.logged', 'chat.action.logFailed'),
  CreateHabit: labelKeys('chat.action.created', 'chat.action.createFailed'),
  UpdateHabit: labelKeys('chat.action.updated', 'chat.action.updateFailed'),
  DeleteHabit: labelKeys('chat.action.deleted', 'chat.action.deleteFailed'),
  SkipHabit: labelKeys('chat.action.skipped', 'chat.action.skipFailed'),
  CreateSubHabit: labelKeys('chat.action.createdSubHabit', 'chat.action.createSubHabitFailed'),
  SuggestBreakdown: labelKeys('chat.action.breakdown', 'chat.action.breakdownFailed'),
  AssignTags: labelKeys('chat.action.tagsUpdated', 'chat.action.tagsUpdateFailed'),
  BulkLogHabits: labelKeys('chat.action.logged', 'chat.action.logFailed'),
  BulkSkipHabits: labelKeys('chat.action.skipped', 'chat.action.skipFailed'),
  CreateGoal: labelKeys('chat.action.createdGoal', 'chat.action.createGoalFailed'),
  UpdateGoal: labelKeys('chat.action.updatedGoal', 'chat.action.updateGoalFailed'),
  DeleteGoal: labelKeys('chat.action.deletedGoal', 'chat.action.deleteGoalFailed'),
  UpdateGoalProgress: labelKeys('chat.action.updatedGoalProgress', 'chat.action.updateGoalProgressFailed'),
  UpdateGoalStatus: labelKeys('chat.action.updatedGoalStatus', 'chat.action.updateGoalStatusFailed'),
  LinkHabitsToGoal: labelKeys('chat.action.linkedGoalHabits', 'chat.action.linkGoalHabitsFailed'),
  create_tag: labelKeys('chat.action.createdTag', 'chat.action.createTagFailed'),
  update_tag: labelKeys('chat.action.updatedTag', 'chat.action.updateTagFailed'),
  delete_tag: labelKeys('chat.action.deletedTag', 'chat.action.deleteTagFailed'),
  reorder_goals: labelKeys('chat.action.reorderedGoals', 'chat.action.reorderGoalsFailed'),
  reorder_habits: labelKeys('chat.action.reorderedHabits', 'chat.action.reorderHabitsFailed'),
  CreateTag: labelKeys('chat.action.createdTag', 'chat.action.createTagFailed'),
  UpdateTag: labelKeys('chat.action.updatedTag', 'chat.action.updateTagFailed'),
  DeleteTag: labelKeys('chat.action.deletedTag', 'chat.action.deleteTagFailed'),
  ReorderGoals: labelKeys('chat.action.reorderedGoals', 'chat.action.reorderGoalsFailed'),
  ReorderHabits: labelKeys('chat.action.reorderedHabits', 'chat.action.reorderHabitsFailed'),
}

const NON_NAVIGABLE_ACTION_TYPES = new Set([
  'delete_habit',
  'DeleteHabit',
  'DeleteGoal',
  'delete_sub_habit',
  'DeleteSubHabit',
  'suggest_breakdown',
  'SuggestBreakdown',
  'create_tag',
  'CreateTag',
  'update_tag',
  'UpdateTag',
  'delete_tag',
  'DeleteTag',
])

type ActionChipNavigation =
  | { navigable: true; entityId: string; actionType: string }
  | { navigable: false }

export interface ActionChipRow {
  id: string
  labelKey: string | undefined
  entityName: string | null | undefined
  status: 'done' | 'failed' | undefined
  navigation: ActionChipNavigation
}

export interface ActionChipConflict {
  key: string
  warning: ConflictWarning
}

export interface ActionChipsModel {
  state: 'partiallyFailed' | 'resting'
  rows: ActionChipRow[]
  conflicts: ActionChipConflict[]
}

function getNavigation(action: ActionResult, hasHandler: boolean): ActionChipNavigation {
  if (
    hasHandler &&
    action.status === 'Success' &&
    action.entityId &&
    !NON_NAVIGABLE_ACTION_TYPES.has(action.type)
  ) {
    return { navigable: true, entityId: action.entityId, actionType: action.type }
  }
  return { navigable: false }
}

function getLabelKey(action: ActionResult): string | undefined {
  const keys = ACTION_LABEL_KEYS[action.type]
  if (action.status !== 'Failed') return keys?.success
  if (!action.entityName) return 'chat.action.failed'
  return keys?.failed ?? 'chat.action.failedNamed'
}

export function buildActionChipsModel(
  actions: readonly ActionResult[],
  hasHandler: boolean,
): ActionChipsModel {
  const visibleActions = actions.filter((action) => action.status !== 'Suggestion')
  return {
    state: visibleActions.some((action) => action.status === 'Failed')
      ? 'partiallyFailed'
      : 'resting',
    rows: visibleActions.map((action, index) => ({
      id: `action-${action.entityId ?? 'none'}-${index}`,
      labelKey: getLabelKey(action),
      entityName: action.entityName,
      status: action.status === 'Success'
        ? 'done'
        : action.status === 'Failed'
          ? 'failed'
          : undefined,
      navigation: getNavigation(action, hasHandler),
    })),
    conflicts: visibleActions.flatMap((action, index) =>
      action.conflictWarning?.hasConflict
        ? [{
            key: `${action.type}-${action.entityId ?? 'none'}-${index}`,
            warning: action.conflictWarning,
          }]
        : [],
    ),
  }
}

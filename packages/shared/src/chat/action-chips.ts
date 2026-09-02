import type { ActionResult, ConflictWarning } from '../types/chat'

const ACTION_LABEL_KEYS: Readonly<Record<string, string>> = {
  log_habit: 'chat.action.logged',
  create_habit: 'chat.action.created',
  update_habit: 'chat.action.updated',
  delete_habit: 'chat.action.deleted',
  skip_habit: 'chat.action.skipped',
  create_sub_habit: 'chat.action.createdSubHabit',
  suggest_breakdown: 'chat.action.breakdown',
  assign_tags: 'chat.action.tagsUpdated',
  duplicate_habit: 'chat.action.duplicated',
  move_habit: 'chat.action.moved',
  LogHabit: 'chat.action.logged',
  CreateHabit: 'chat.action.created',
  UpdateHabit: 'chat.action.updated',
  DeleteHabit: 'chat.action.deleted',
  SkipHabit: 'chat.action.skipped',
  CreateSubHabit: 'chat.action.createdSubHabit',
  SuggestBreakdown: 'chat.action.breakdown',
  AssignTags: 'chat.action.tagsUpdated',
  BulkLogHabits: 'chat.action.logged',
  BulkSkipHabits: 'chat.action.skipped',
  CreateGoal: 'chat.action.createdGoal',
  UpdateGoal: 'chat.action.updatedGoal',
  DeleteGoal: 'chat.action.deletedGoal',
  UpdateGoalProgress: 'chat.action.updatedGoalProgress',
  UpdateGoalStatus: 'chat.action.updatedGoalStatus',
  LinkHabitsToGoal: 'chat.action.linkedGoalHabits',
  create_tag: 'chat.action.createdTag',
  update_tag: 'chat.action.updatedTag',
  delete_tag: 'chat.action.deletedTag',
  reorder_goals: 'chat.action.reorderedGoals',
  reorder_habits: 'chat.action.reorderedHabits',
  CreateTag: 'chat.action.createdTag',
  UpdateTag: 'chat.action.updatedTag',
  DeleteTag: 'chat.action.deletedTag',
  ReorderGoals: 'chat.action.reorderedGoals',
  ReorderHabits: 'chat.action.reorderedHabits',
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
      labelKey: ACTION_LABEL_KEYS[action.type],
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

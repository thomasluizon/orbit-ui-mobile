import type { ActionResult } from '../types/chat'

interface ActionLabelKeys {
  readonly success: string
  readonly failed: string
}

const keys = (success: string, failed: string): ActionLabelKeys => ({ success, failed })

const ACTION_LABEL_KEYS: Readonly<Record<string, ActionLabelKeys>> = {
  log_habit: keys('chat.action.logged', 'chat.action.logFailed'),
  create_habit: keys('chat.action.created', 'chat.action.createFailed'),
  update_habit: keys('chat.action.updated', 'chat.action.updateFailed'),
  delete_habit: keys('chat.action.deleted', 'chat.action.deleteFailed'),
  skip_habit: keys('chat.action.skipped', 'chat.action.skipFailed'),
  create_sub_habit: keys('chat.action.createdSubHabit', 'chat.action.createSubHabitFailed'),
  suggest_breakdown: keys('chat.action.breakdown', 'chat.action.breakdownFailed'),
  assign_tags: keys('chat.action.tagsUpdated', 'chat.action.tagsUpdateFailed'),
  duplicate_habit: keys('chat.action.duplicated', 'chat.action.duplicateFailed'),
  move_habit: keys('chat.action.moved', 'chat.action.moveFailed'),
  LogHabit: keys('chat.action.logged', 'chat.action.logFailed'),
  CreateHabit: keys('chat.action.created', 'chat.action.createFailed'),
  UpdateHabit: keys('chat.action.updated', 'chat.action.updateFailed'),
  DeleteHabit: keys('chat.action.deleted', 'chat.action.deleteFailed'),
  SkipHabit: keys('chat.action.skipped', 'chat.action.skipFailed'),
  CreateSubHabit: keys('chat.action.createdSubHabit', 'chat.action.createSubHabitFailed'),
  SuggestBreakdown: keys('chat.action.breakdown', 'chat.action.breakdownFailed'),
  AssignTags: keys('chat.action.tagsUpdated', 'chat.action.tagsUpdateFailed'),
  DuplicateHabit: keys('chat.action.duplicated', 'chat.action.duplicateFailed'),
  MoveHabit: keys('chat.action.moved', 'chat.action.moveFailed'),
  BulkLogHabits: keys('chat.action.logged', 'chat.action.logFailed'),
  BulkSkipHabits: keys('chat.action.skipped', 'chat.action.skipFailed'),
  CreateGoal: keys('chat.action.createdGoal', 'chat.action.createGoalFailed'),
  UpdateGoal: keys('chat.action.updatedGoal', 'chat.action.updateGoalFailed'),
  DeleteGoal: keys('chat.action.deletedGoal', 'chat.action.deleteGoalFailed'),
  UpdateGoalProgress: keys('chat.action.updatedGoalProgress', 'chat.action.updateGoalProgressFailed'),
  UpdateGoalStatus: keys('chat.action.updatedGoalStatus', 'chat.action.updateGoalStatusFailed'),
  LinkHabitsToGoal: keys('chat.action.linkedGoalHabits', 'chat.action.linkGoalHabitsFailed'),
  create_tag: keys('chat.action.createdTag', 'chat.action.createTagFailed'),
  update_tag: keys('chat.action.updatedTag', 'chat.action.updateTagFailed'),
  delete_tag: keys('chat.action.deletedTag', 'chat.action.deleteTagFailed'),
  reorder_goals: keys('chat.action.reorderedGoals', 'chat.action.reorderGoalsFailed'),
  reorder_habits: keys('chat.action.reorderedHabits', 'chat.action.reorderHabitsFailed'),
  CreateTag: keys('chat.action.createdTag', 'chat.action.createTagFailed'),
  UpdateTag: keys('chat.action.updatedTag', 'chat.action.updateTagFailed'),
  DeleteTag: keys('chat.action.deletedTag', 'chat.action.deleteTagFailed'),
  ReorderGoals: keys('chat.action.reorderedGoals', 'chat.action.reorderGoalsFailed'),
  ReorderHabits: keys('chat.action.reorderedHabits', 'chat.action.reorderHabitsFailed'),
}

export function resolveActionLabelKey(
  type: string,
  status: ActionResult['status'],
  entityName: string | null | undefined,
): string | undefined {
  const actionKeys = ACTION_LABEL_KEYS[type]
  if (status !== 'Failed') return actionKeys?.success
  if (!entityName) return 'chat.action.failed'
  return actionKeys?.failed ?? 'chat.action.failedNamed'
}

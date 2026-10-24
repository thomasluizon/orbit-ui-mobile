import { getToolResultFieldLabel, resolveToolResultMessage } from './tool-result-message'
import type { ActionResult, AiActionType, ConflictWarning } from '../types/chat'

interface ActionLabelKeys {
  success: string
  failed: string
}

function labelKeys(success: string, failed: string): Readonly<ActionLabelKeys> {
  return { success, failed }
}

const ACTION_LABEL_KEYS: Readonly<Record<string, Readonly<ActionLabelKeys>>> = {
  LinkGoalsToHabit: labelKeys('chat.action.linkedHabitGoals', 'chat.action.linkHabitGoalsFailed'),
  MoveHabitParent: labelKeys('chat.action.changedHabitParent', 'chat.action.changeHabitParentFailed'),
  UpdateChecklist: labelKeys('chat.action.updatedChecklist', 'chat.action.updateChecklistFailed'),
  UnlogHabit: labelKeys('chat.action.unlogged', 'chat.action.unlogFailed'),
  LogHabit: labelKeys('chat.action.logged', 'chat.action.logFailed'),
  CreateHabit: labelKeys('chat.action.created', 'chat.action.createFailed'),
  UpdateHabit: labelKeys('chat.action.updated', 'chat.action.updateFailed'),
  DeleteHabit: labelKeys('chat.action.deleted', 'chat.action.deleteFailed'),
  SkipHabit: labelKeys('chat.action.skipped', 'chat.action.skipFailed'),
  CreateSubHabit: labelKeys('chat.action.createdSubHabit', 'chat.action.createSubHabitFailed'),
  SuggestBreakdown: labelKeys('chat.action.breakdown', 'chat.action.breakdownFailed'),
  AssignTags: labelKeys('chat.action.tagsUpdated', 'chat.action.tagsUpdateFailed'),
  DuplicateHabit: labelKeys('chat.action.duplicated', 'chat.action.duplicateFailed'),
  MoveHabit: labelKeys('chat.action.moved', 'chat.action.moveFailed'),
  BulkLogHabits: labelKeys('chat.action.logged', 'chat.action.logFailed'),
  BulkSkipHabits: labelKeys('chat.action.skipped', 'chat.action.skipFailed'),
  CreateGoal: labelKeys('chat.action.createdGoal', 'chat.action.createGoalFailed'),
  UpdateGoal: labelKeys('chat.action.updatedGoal', 'chat.action.updateGoalFailed'),
  DeleteGoal: labelKeys('chat.action.deletedGoal', 'chat.action.deleteGoalFailed'),
  UpdateGoalProgress: labelKeys('chat.action.updatedGoalProgress', 'chat.action.updateGoalProgressFailed'),
  UpdateGoalStatus: labelKeys('chat.action.updatedGoalStatus', 'chat.action.updateGoalStatusFailed'),
  LinkHabitsToGoal: labelKeys('chat.action.linkedGoalHabits', 'chat.action.linkGoalHabitsFailed'),
  CreateTag: labelKeys('chat.action.createdTag', 'chat.action.createTagFailed'),
  UpdateTag: labelKeys('chat.action.updatedTag', 'chat.action.updateTagFailed'),
  DeleteTag: labelKeys('chat.action.deletedTag', 'chat.action.deleteTagFailed'),
  ReorderGoals: labelKeys('chat.action.reorderedGoals', 'chat.action.reorderGoalsFailed'),
  ReorderHabits: labelKeys('chat.action.reorderedHabits', 'chat.action.reorderHabitsFailed'),
} satisfies Record<AiActionType | 'LinkGoalsToHabit' | 'MoveHabitParent' | 'UpdateChecklist', Readonly<ActionLabelKeys>>

function canonicalActionType(type: string): string {
  return type.split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join('')
}

const NON_NAVIGABLE_ACTION_TYPES = new Set([
  'DeleteHabit',
  'DeleteGoal',
  'DeleteSubHabit',
  'SuggestBreakdown',
  'CreateTag',
  'UpdateTag',
  'DeleteTag',
])

export type ActionChipNavigation =
  | { navigable: true; entityId: string; actionType: string }
  | { navigable: false }

export interface ActionChipRow {
  id: string
  labelKey: string | undefined
  entityName: string | null | undefined
  status: 'done' | 'failed' | undefined
  navigation: ActionChipNavigation
  messageKey: ActionResult['messageKey']
  params: ActionResult['params']
  hasLegacyText: boolean
  field: ActionResult['field']
}

interface ActionChipTranslations {
  translate: (key: string, params?: Record<string, string | number>) => string
  has: (key: string) => boolean
}

export function resolveActionChipText(row: ActionChipRow, { translate, has }: ActionChipTranslations): { label: string; personal: boolean; wrapLabel: boolean } | undefined {
  const message = resolveToolResultMessage(row, translate, has)
  if (message) {
    return {
      label: message,
      personal: Boolean(row.params?.entityName || row.params?.referralCode),
      wrapLabel: true,
    }
  }
  if (row.status === 'failed' && row.field) {
    const fieldName = getToolResultFieldLabel(row.field, translate)
    const guidance = fieldName ? translate('chat.action.invalidField', { fieldName }) : translate('chat.toolResult.invalidDetails')
    return {
      label: row.entityName
        ? `${translate(row.labelKey ?? 'chat.action.failedNamed', { name: row.entityName })}. ${guidance}`
        : guidance,
      personal: Boolean(row.entityName),
      wrapLabel: true,
    }
  }
  if (!row.hasLegacyText) return undefined
  const entityName = row.entityName || undefined
  return {
    label: row.labelKey
      ? translate(row.labelKey, entityName ? { name: entityName } : undefined)
      : entityName ?? translate('chat.action.completed'),
    personal: Boolean(entityName),
    wrapLabel: Boolean(entityName),
  }
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

export function getActionChipNavigation(action: ActionResult, hasHandler: boolean): ActionChipNavigation {
  if (
    hasHandler &&
    action.status === 'Success' &&
    action.entityId &&
    !NON_NAVIGABLE_ACTION_TYPES.has(canonicalActionType(action.type))
  ) {
    return { navigable: true, entityId: action.entityId, actionType: action.type }
  }
  return { navigable: false }
}

function getLabelKey(action: ActionResult): string | undefined {
  const keys = ACTION_LABEL_KEYS[canonicalActionType(action.type)]
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
      navigation: getActionChipNavigation(action, hasHandler),
      messageKey: action.messageKey,
      params: action.params,
      hasLegacyText: Boolean(action.entityName || action.error),
      field: action.field,
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

'use client'

import { useTranslations } from 'next-intl'
import type { ActionResult } from '@orbit/shared/types/chat'
import { BlockFrame } from '@/components/ui/block-frame'
import { Button } from '@/components/ui/pill-button'
import { ConflictWarning } from './conflict-warning'

const ACTION_LABELS: Record<string, string> = {
  log_habit: 'chat.action.logged', create_habit: 'chat.action.created', update_habit: 'chat.action.updated',
  delete_habit: 'chat.action.deleted', skip_habit: 'chat.action.skipped', create_sub_habit: 'chat.action.createdSubHabit',
  suggest_breakdown: 'chat.action.breakdown', assign_tags: 'chat.action.tagsUpdated', duplicate_habit: 'chat.action.duplicated',
  move_habit: 'chat.action.moved', LogHabit: 'chat.action.logged', CreateHabit: 'chat.action.created',
  UpdateHabit: 'chat.action.updated', DeleteHabit: 'chat.action.deleted', SkipHabit: 'chat.action.skipped',
  CreateSubHabit: 'chat.action.createdSubHabit', SuggestBreakdown: 'chat.action.breakdown', AssignTags: 'chat.action.tagsUpdated',
  BulkLogHabits: 'chat.action.logged', BulkSkipHabits: 'chat.action.skipped', CreateGoal: 'chat.action.createdGoal',
  UpdateGoal: 'chat.action.updatedGoal', DeleteGoal: 'chat.action.deletedGoal', UpdateGoalProgress: 'chat.action.updatedGoalProgress',
  UpdateGoalStatus: 'chat.action.updatedGoalStatus', LinkHabitsToGoal: 'chat.action.linkedGoalHabits', create_tag: 'chat.action.createdTag',
  update_tag: 'chat.action.updatedTag', delete_tag: 'chat.action.deletedTag', reorder_goals: 'chat.action.reorderedGoals',
  reorder_habits: 'chat.action.reorderedHabits', CreateTag: 'chat.action.createdTag', UpdateTag: 'chat.action.updatedTag',
  DeleteTag: 'chat.action.deletedTag', ReorderGoals: 'chat.action.reorderedGoals', ReorderHabits: 'chat.action.reorderedHabits',
}

const NON_NAVIGABLE_ACTION_TYPES = new Set([
  'delete_habit', 'DeleteHabit', 'DeleteGoal', 'delete_sub_habit', 'DeleteSubHabit', 'suggest_breakdown',
  'SuggestBreakdown', 'create_tag', 'CreateTag', 'update_tag', 'UpdateTag', 'delete_tag', 'DeleteTag',
])

interface ActionChipsProps {
  actions: ActionResult[]
  onChipClick?: (entityId: string, actionType: string) => void
}

function isNavigable(action: ActionResult, hasHandler: boolean): boolean {
  return hasHandler && action.status === 'Success' && !!action.entityId && !NON_NAVIGABLE_ACTION_TYPES.has(action.type)
}

export function ActionChips({ actions, onChipClick }: Readonly<ActionChipsProps>) {
  const t = useTranslations()
  const visible = actions.filter((action) => action.status !== 'Suggestion')
  if (visible.length === 0) return null

  const actionLabel = (action: ActionResult) => {
    const key = ACTION_LABELS[action.type]
    return key ? t(key, { name: action.entityName || t('chat.unknownEntity') }) : t('chat.action.completed')
  }
  const failed = visible.some((action) => action.status === 'Failed')
  const conflicts = visible.filter((action) => action.conflictWarning?.hasConflict)

  return (
    <BlockFrame
      state={failed ? 'partiallyFailed' : 'resting'}
      title={t('chat.action.changes')}
      items={visible.map((action, index) => ({
        id: `action-${action.entityId ?? 'none'}-${index}`,
        label: actionLabel(action),
        meta: action.status === 'Failed' ? t('chat.operation.status.Failed') : undefined,
        status: action.status === 'Success' ? 'done' : action.status === 'Failed' ? 'failed' : undefined,
        control: isNavigable(action, !!onChipClick) ? (
          <Button size="sm" variant="ghost" onClick={() => onChipClick!(action.entityId!, action.type)}>
            {t('chat.action.open')}
          </Button>
        ) : undefined,
      }))}
      actions={conflicts.length > 0 ? conflicts.map((action, index) => (
        <ConflictWarning key={`${action.type}-${action.entityId ?? 'none'}-${index}`} warning={action.conflictWarning!} />
      )) : undefined}
    />
  )
}

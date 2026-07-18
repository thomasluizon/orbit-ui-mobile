'use client'

import { CheckCircle, XCircle, Info } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import type { ActionResult } from '@orbit/shared/types/chat'
import { ConflictWarning } from './conflict-warning'

const ACTION_LABELS: Record<string, string> = {
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

interface ChipPalette {
  color: string
  iconColor: string
  background: string
  ring: string
  Icon: typeof CheckCircle
}

const CHIP_STYLES: Record<string, ChipPalette> = {
  Success: {
    color: 'var(--status-done)',
    iconColor: 'var(--status-done)',
    background: 'var(--bg-elev)',
    ring: 'var(--hairline)',
    Icon: CheckCircle,
  },
  Failed: {
    color: 'var(--status-bad-text)',
    iconColor: 'var(--status-bad)',
    background: 'color-mix(in srgb, var(--status-bad) 10%, transparent)',
    ring: 'color-mix(in srgb, var(--status-bad) 30%, transparent)',
    Icon: XCircle,
  },
}

const DEFAULT_CHIP_STYLE: ChipPalette = {
  color: 'var(--fg-2)',
  iconColor: 'var(--fg-2)',
  background: 'var(--bg-elev)',
  ring: 'var(--hairline)',
  Icon: Info,
}

function chipStyle(action: ActionResult): ChipPalette {
  return CHIP_STYLES[action.status] ?? DEFAULT_CHIP_STYLE
}

interface ActionChipsProps {
  actions: ActionResult[]
  onChipClick?: (entityId: string, actionType: string) => void
}

function isNavigable(action: ActionResult, hasHandler: boolean): boolean {
  return (
    hasHandler &&
    action.status === 'Success' &&
    !!action.entityId &&
    !NON_NAVIGABLE_ACTION_TYPES.has(action.type)
  )
}

export function ActionChips({ actions, onChipClick }: Readonly<ActionChipsProps>) {
  const t = useTranslations()

  function actionLabel(action: ActionResult): string {
    const name = action.entityName || t('chat.unknownEntity')
    const labelKey = ACTION_LABELS[action.type]
    if (labelKey) return t(labelKey, { name })
    return `${action.type.replaceAll('_', ' ')}: ${name}`
  }

  return (
    <div className="flex flex-col gap-2 mt-2">
      {actions.map((action, index) => {
        if (action.status === 'Suggestion') return null
        const palette = chipStyle(action)
        const IconComponent = palette.Icon
        const navigable = isNavigable(action, !!onChipClick)
        const chipClassName =
          'inline-flex items-center max-w-full rounded-full transition-[background-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)]'
        const chipStyleProps = {
          gap: 8,
          minHeight: 32,
          padding: '0 16px',
          fontFamily: 'var(--font-sans)',
          fontSize: 13,
          fontWeight: 500,
          color: palette.color,
          background: palette.background,
          boxShadow: `inset 0 0 0 1px ${palette.ring}`,
        }

        return (
          <div
            key={`${action.type}-${action.entityId || index}`}
            className="animate-chip-in"
            data-action-status={action.status}
            style={{ animationDelay: `${index * 80}ms` }}
          >
            {navigable ? (
              <button
                type="button"
                onClick={() => onChipClick!(action.entityId!, action.type)}
                aria-label={t('chat.action.openEntity', { name: actionLabel(action) })}
                className={`${chipClassName} touch-target-y cursor-pointer border-0 hover:scale-[1.02] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/60`}
                style={chipStyleProps}
              >
                <IconComponent
                  size={16}
                  strokeWidth={1.8}
                  color={palette.iconColor}
                  className="shrink-0"
                />
                <span className="min-w-0 truncate">{actionLabel(action)}</span>
              </button>
            ) : (
              <span className={chipClassName} style={chipStyleProps}>
                <IconComponent
                  size={16}
                  strokeWidth={1.8}
                  color={palette.iconColor}
                  className="shrink-0"
                />
                <span className="min-w-0 truncate">{actionLabel(action)}</span>
              </span>
            )}

            {action.status === 'Failed' && action.error && (
              <p className="text-xs text-[var(--status-bad-text)] mt-1 pl-1">{action.error}</p>
            )}

            {action.conflictWarning?.hasConflict && (
              <ConflictWarning warning={action.conflictWarning} />
            )}
          </div>
        )
      })}
    </div>
  )
}

'use client'

import { MoreVertical } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { ParentRing } from '@/components/ui/parent-ring'
import { Popover } from '@/components/ui/popover'
import { CheckCircle } from './habit-row-check-circle'
import { HabitRowMenu } from './habit-row-menu'
import type { HabitRowActions } from './habit-row'
import type { StatusDotState } from '@/components/ui/status-dot'

function runParentProgressAction(
  isDone: boolean,
  childProgress: { done: number; total: number } | undefined,
  actions: HabitRowActions,
) {
  if (isDone) {
    actions.onUnlog?.()
  } else if (
    childProgress &&
    childProgress.total > 0 &&
    childProgress.done >= childProgress.total
  ) {
    actions.onLog?.()
  } else {
    actions.onForceLogParent?.()
  }
}

function resolveParentRingColor(isBadHabit: boolean): string | undefined {
  return isBadHabit ? 'var(--status-bad)' : undefined
}

function resolveParentRingTrackColor(
  isBadHabit: boolean,
  state: StatusDotState,
): string | undefined {
  if (isBadHabit) return 'color-mix(in srgb, var(--status-bad) 40%, transparent)'
  if (state === 'overdue') return 'color-mix(in srgb, var(--status-overdue) 40%, transparent)'
  return undefined
}

interface HabitRowTrailingProps {
  habit: NormalizedHabit
  selectMode: boolean
  hasChildren: boolean
  childProgress?: { done: number; total: number }
  showLinkedGoalDot: boolean
  state: StatusDotState
  isDone: boolean
  canLog: boolean
  hasMenuActions: boolean
  canSelect: boolean
  canDrillInto: boolean
  actions: HabitRowActions
  onToggleStatus: () => void
}

/** Trailing cluster of a habit row: linked-goal dot, parent-ring or status dot, and the overflow menu. */
export function HabitRowTrailing({
  habit,
  selectMode,
  hasChildren,
  childProgress,
  showLinkedGoalDot,
  state,
  isDone,
  canLog,
  hasMenuActions,
  canSelect,
  canDrillInto,
  actions,
  onToggleStatus,
}: Readonly<HabitRowTrailingProps>) {
  const t = useTranslations()
  const {
    onEdit,
    onDuplicate,
    onAddSubHabit,
    onMoveParent,
    onSkip,
    onReschedule,
    onDelete,
    onEnterSelectMode,
    onDrillInto,
  } = actions
  const statusDotLabelKey = `habits.statusDot.${state}`

  return (
    <div className="flex items-center shrink-0" style={{ gap: 10 }}>
      {showLinkedGoalDot && (
        <span
          role="img"
          aria-label={t('habits.detail.linkedGoal')}
          className="rounded-full"
          style={{
            width: 5,
            height: 5,
            background: 'var(--primary)',
          }}
        />
      )}
      {!selectMode &&
        (hasChildren ? (
          <>
            {childProgress && childProgress.total > 0 && (
              <span
                aria-hidden="true"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  fontVariantNumeric: 'tabular-nums',
                  color: 'var(--fg-3)',
                }}
              >
                {childProgress.done}/{childProgress.total}
              </span>
            )}
            <button
              type="button"
              aria-label={
                childProgress
                  ? `${habit.title} ${childProgress.done}/${childProgress.total}`
                  : habit.title
              }
              onClick={(event) => {
                event.stopPropagation()
                runParentProgressAction(isDone, childProgress, actions)
              }}
              className="appearance-none border-0 bg-transparent flex items-center justify-center cursor-pointer"
              style={{ padding: 7, margin: -7 }}
            >
              <ParentRing
                done={childProgress?.done ?? 0}
                total={childProgress?.total ?? 0}
                size={30}
                color={resolveParentRingColor(habit.isBadHabit)}
                trackColor={resolveParentRingTrackColor(habit.isBadHabit, state)}
              />
            </button>
          </>
        ) : (
          <CheckCircle
            state={state}
            tone={habit.isBadHabit ? 'bad' : 'default'}
            onToggle={onToggleStatus}
            disabled={!canLog && !isDone}
            ariaLabel={`${t(statusDotLabelKey)}, ${
              isDone ? t('habits.actions.unlog') : t('habits.logHabit')
            }`}
          />
        ))}
      {!selectMode && hasMenuActions && (
        <Popover
          placement="bottom-end"
          className="min-w-[180px]"
          trigger={
            <button
              type="button"
              aria-label={t('habits.actions.more')}
              onClick={(event) => event.stopPropagation()}
              className="touch-target appearance-none border-0 bg-transparent flex items-center justify-center rounded-full text-[var(--fg-3)] transition-[background-color,color,transform] duration-[160ms] ease-[var(--ease-standard)] hover:bg-[var(--bg-elev-pressed)] hover:text-[var(--fg-1)] active:scale-[0.96]"
              style={{
                width: 34,
                height: 34,
                margin: '-3px',
                cursor: 'pointer',
              }}
            >
              <MoreVertical size={18} strokeWidth={1.8} />
            </button>
          }
        >
          {(close) => (
            <HabitRowMenu
              close={close}
              onEdit={onEdit}
              onDuplicate={onDuplicate}
              onAddSubHabit={onAddSubHabit}
              onMoveParent={onMoveParent}
              onSkip={onSkip}
              onReschedule={onReschedule}
              onDelete={onDelete}
              onEnterSelectMode={canSelect ? onEnterSelectMode : undefined}
              onDrillInto={canDrillInto ? onDrillInto : undefined}
              t={t}
            />
          )}
        </Popover>
      )}
    </div>
  )
}

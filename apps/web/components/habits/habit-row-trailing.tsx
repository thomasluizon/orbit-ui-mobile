'use client'

import { MoreVertical } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { ParentRing } from '@/components/ui/parent-ring'
import { Popover } from '@/components/ui/popover'
import { CheckCircle } from './habit-row-check-circle'
import { HabitRowMenu } from './habit-row-menu'
import type { HabitRowActions } from './habit-row'
import type { HabitStatus } from '@orbit/shared/contracts/lists'

function resolveLogAction(
  childProgress: { done: number; total: number } | undefined,
  actions: HabitRowActions,
): (() => void) | undefined {
  const childrenComplete =
    !!childProgress && childProgress.total > 0 && childProgress.done >= childProgress.total
  return childrenComplete ? actions.onLog : actions.onForceLogParent
}

function resolveParentRingColor(isBadHabit: boolean): string | undefined {
  return isBadHabit ? 'var(--status-bad)' : undefined
}

function resolveParentRingTrackColor(
  isBadHabit: boolean,
  state: HabitStatus,
): string | undefined {
  if (isBadHabit) return 'color-mix(in srgb, var(--status-bad) 40%, transparent)'
  if (state === 'overdue') return 'color-mix(in srgb, var(--status-overdue) 40%, transparent)'
  return undefined
}

interface HabitRowTrailingProps {
  habit: NormalizedHabit
  depth: 0 | 1
  selectMode: boolean
  hasChildren: boolean
  childProgress?: { done: number; total: number }
  state: HabitStatus
  isDone: boolean
  canLog: boolean
  hasMenuActions: boolean
  canSelect: boolean
  canDrillInto: boolean
  actions: HabitRowActions
  onToggleStatus: () => void
}

/** Trailing cluster of a habit row: parent ring or status ring, then overflow. */
// react-doctor-disable-next-line no-many-boolean-props -- these are derived per-row display flags computed once by HabitRow and passed straight through; they are not independent configuration axes and splitting the cluster adds indirection without benefit https://github.com/thomasluizon/orbit-ui-mobile/issues/243
export function HabitRowTrailing({
  habit,
  depth,
  selectMode,
  hasChildren,
  childProgress,
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
  const statusLabel = t(statusDotLabelKey)
  const toggleLabel = isDone ? t('habits.actions.unlog') : t('habits.logHabit')

  return (
    <div className="flex items-center shrink-0" style={{ gap: 8 }}>
      {!selectMode &&
        (hasChildren ? (
          <>
            <button
              type="button"
              aria-label={
                childProgress
                  ? `${statusLabel}, ${toggleLabel}: ${habit.title}, ${childProgress.done}/${childProgress.total}`
                  : `${statusLabel}, ${toggleLabel}: ${habit.title}`
              }
              onClick={(event) => {
                event.stopPropagation()
                const parentAction = isDone ? actions.onUnlog : resolveLogAction(childProgress, actions)
                parentAction?.()
              }}
              className="appearance-none border-0 bg-transparent flex h-11 w-11 items-center justify-center cursor-pointer rounded-full hover:bg-[var(--bg-hover)] active:scale-[0.96]"
            >
              <ParentRing
                done={childProgress?.done ?? 0}
                total={childProgress?.total ?? 0}
                size={depth === 1 ? 24 : 30}
                color={resolveParentRingColor(habit.isBadHabit)}
                trackColor={resolveParentRingTrackColor(habit.isBadHabit, state)}
              />
            </button>
          </>
        ) : (
          <CheckCircle
            state={state}
            onToggle={onToggleStatus}
            disabled={!canLog && !isDone}
            size={depth === 1 ? 24 : 30}
            ariaLabel={`${statusLabel}, ${toggleLabel}: ${habit.title}`}
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
              style={{ width: 44, height: 44, cursor: 'pointer' }}
            >
              <MoreVertical size={20} strokeWidth={1.8} />
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

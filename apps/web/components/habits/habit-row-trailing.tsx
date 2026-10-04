'use client'

import { useId, useRef, useState } from 'react'
import { MoreVertical } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { ParentRing } from '@/components/ui/parent-ring'
import { StatusRing } from '@/components/ui/status-ring'
import { Menu } from '@/components/ui/menu'
import { CheckCircle } from './habit-row-check-circle'
import type { HabitRowActions } from './habit-row'
import type { MenuItem } from '@orbit/shared/contracts/overlay'
import type { HabitStatus } from '@orbit/shared/contracts/lists'

function completionIsDisabled(completionReadOnly: boolean, canLog: boolean, isDone: boolean): boolean {
  return completionReadOnly || (!canLog && !isDone)
}

function availableStatusLabel(unavailable: boolean, label: string): string | undefined {
  return unavailable ? undefined : label
}

function showParentRing(hasChildren: boolean, unavailable: boolean): boolean {
  return hasChildren && !unavailable
}

function completionReasonId(disabled: boolean, reason: string | undefined, id: string): string | undefined {
  return disabled && reason ? id : undefined
}

function CompletionReason({ id, disabled, reason }: Readonly<{ id: string; disabled: boolean; reason?: string }>) {
  return disabled && reason ? <span id={id} className="sr-only">{reason}</span> : null
}

function parentRingLabel(status: string | undefined, action: string, title: string, progress?: { done: number; total: number }): string {
  const actionLabel = progress ? `${action}: ${title}, ${progress.done}/${progress.total}` : `${action}: ${title}`
  return status ? `${status}, ${actionLabel}` : actionLabel
}

function triggerParentCompletion(event: React.MouseEvent, disabled: boolean, isDone: boolean, actions: HabitRowActions): void {
  event.stopPropagation()
  if (disabled) return
  const parentAction = isDone ? actions.onUnlog : actions.onLog
  parentAction?.()
}

function resolveParentRingColors(isBadHabit: boolean) {
  if (isBadHabit) {
    return {
      stroke: 'var(--status-bad)',
    }
  }
  return {
    stroke: undefined,
  }
}

function buildMenuItems(
  t: ReturnType<typeof useTranslations>,
  actions: HabitRowActions,
  canSelect: boolean,
  canDrillInto: boolean,
  hasProAccess: boolean,
  completionReadOnly: boolean,
  state: HabitStatus,
): MenuItem[] {
  const items: MenuItem[] = []
  if (actions.onAddSubHabit) items.push({ id: 'add', label: t('habits.actions.addSubHabit'), icon: 'subtask', badge: hasProAccess ? undefined : 'Pro' })
  if (actions.onMoveParent) items.push({ id: 'move', label: t('habits.actions.moveUnder'), icon: 'arrows-move' })
  if (actions.onSkip && !completionReadOnly) items.push({ id: 'skip', label: t('habits.actions.skip'), icon: 'player-skip-forward' })
  if (actions.onReschedule && state === 'overdue' && !completionReadOnly) items.push({ id: 'reschedule', label: t('habits.actions.reschedule'), icon: 'calendar-time' })
  if (actions.onEdit) items.push({ id: 'edit', label: t('common.edit'), icon: 'pencil' })
  if (actions.onDuplicate) items.push({ id: 'duplicate', label: t('habits.actions.duplicate'), icon: 'copy' })
  if (canSelect && actions.onEnterSelectMode) items.push({ id: 'select', label: t('common.select'), icon: 'checkbox' })
  if (canDrillInto && actions.onDrillInto) {
    items.push({ id: 'drill', label: t('habits.actions.openSubHabits'), icon: 'list-tree' })
  }
  if (actions.onDelete) {
    items.push({ id: 'delete', label: t('habits.actions.delete'), icon: 'trash', destructive: true })
  }
  return items
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
  hasProAccess: boolean
  onToggleStatus: () => void
  completionReadOnly: boolean
  completionReason?: string
  completionStatusUnavailable: boolean
}

function SelectionStatusGlyph({
  habit, depth, hasChildren, childProgress, state, isDone, canLog,
  completionReadOnly, completionStatusUnavailable,
}: Readonly<HabitRowTrailingProps>) {
  const t = useTranslations()
  const statusName = t(`habits.statusDot.${state}`)
  const dimmed = completionIsDisabled(completionReadOnly, canLog, isDone)
  if (showParentRing(hasChildren, completionStatusUnavailable)) {
    return (
      <span role="img" aria-label={`${statusName}, ${childProgress?.done ?? 0}/${childProgress?.total ?? 0}`}
        className="flex min-h-[48px] w-[48px] items-center justify-center" style={{ opacity: dimmed ? 0.4 : 1 }}>
        <ParentRing done={childProgress?.done ?? 0} total={childProgress?.total ?? 0}
          size={depth === 1 ? 24 : 30} {...resolveParentRingColors(habit.isBadHabit)} />
      </span>
    )
  }
  return (
    <span className="flex min-h-[48px] w-[48px] items-center justify-center" style={{ opacity: dimmed ? 0.4 : 1 }}>
      <StatusRing status={state} size={depth === 1 ? 24 : 30} label={statusName} />
    </span>
  )
}

function InteractiveParentRing({
  habit, depth, childProgress, state, isDone, canLog, actions,
  completionReadOnly, completionReason, completionStatusUnavailable,
}: Readonly<HabitRowTrailingProps>) {
  const t = useTranslations()
  const reasonId = useId()
  const statusLabel = availableStatusLabel(completionStatusUnavailable, t(`habits.statusDot.${state}`))
  const toggleLabel = isDone ? t('habits.actions.unlog') : t('habits.logHabit')
  const disabled = completionIsDisabled(completionReadOnly, canLog, isDone)
  return (
    <button type="button" data-habit-row-control="ring"
      aria-label={parentRingLabel(statusLabel, toggleLabel, habit.title, childProgress)}
      onClick={(event) => triggerParentCompletion(event, disabled, isDone, actions)}
      disabled={disabled && !completionReason}
      aria-disabled={disabled && completionReason ? true : undefined}
      aria-describedby={completionReasonId(disabled, completionReason, reasonId)}
      title={disabled ? completionReason : undefined}
      className={`appearance-none border-0 bg-transparent flex min-h-[48px] w-[48px] items-center justify-center rounded-full transition-[background-color,transform] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] ${disabled ? 'cursor-default opacity-40' : 'cursor-pointer hover:bg-[var(--bg-hover)] active:scale-[0.96]'}`}>
      <ParentRing done={childProgress?.done ?? 0} total={childProgress?.total ?? 0}
        size={depth === 1 ? 24 : 30} {...resolveParentRingColors(habit.isBadHabit)} />
      <CompletionReason id={reasonId} disabled={disabled} reason={completionReason} />
    </button>
  )
}

function HabitRowCompletion(props: Readonly<HabitRowTrailingProps>) {
  const t = useTranslations()
  if (props.selectMode) return <SelectionStatusGlyph {...props} />
  if (showParentRing(props.hasChildren, props.completionStatusUnavailable)) {
    return <InteractiveParentRing {...props} />
  }
  const statusLabel = availableStatusLabel(props.completionStatusUnavailable, t(`habits.statusDot.${props.state}`))
  const toggleLabel = props.isDone ? t('habits.actions.unlog') : t('habits.logHabit')
  return <CheckCircle state={props.state} unavailable={props.completionStatusUnavailable}
    onToggle={props.onToggleStatus}
    disabled={completionIsDisabled(props.completionReadOnly, props.canLog, props.isDone)}
    disabledReason={props.completionReason} size={props.depth === 1 ? 24 : 30}
    ariaLabel={parentRingLabel(statusLabel, toggleLabel, props.habit.title)} />
}

/** Trailing cluster of a habit row: parent ring or status ring, then overflow. */
// react-doctor-disable-next-line no-many-boolean-props -- these are derived per-row display flags computed once by HabitRow and passed straight through; they are not independent configuration axes and splitting the cluster adds indirection without benefit https://github.com/thomasluizon/orbit-ui-mobile/issues/243
export function HabitRowTrailing(props: Readonly<HabitRowTrailingProps>) {
  const {
  habit,
  selectMode,
  state,
  hasMenuActions,
  canSelect,
  canDrillInto,
  actions,
  hasProAccess,
  completionReadOnly,
  } = props
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
  const [menuOpen, setMenuOpen] = useState(false)
  const menuAnchorRef = useRef<HTMLButtonElement>(null)
  const closeMenu = () => setMenuOpen(false)
  const openMenu = () => setMenuOpen(true)
  const menuId = useId()
  const menuItems = buildMenuItems(t, actions, canSelect, canDrillInto, hasProAccess, completionReadOnly, state)

  return (
    <div className="flex items-center shrink-0" style={{ gap: 8 }}>
      <HabitRowCompletion {...props} />
      {!selectMode && hasMenuActions && (
        <>
          <button
            ref={menuAnchorRef}
            type="button"
            data-habit-row-control="menu"
            aria-label={t('habits.actions.more')}
            aria-expanded={menuOpen}
            aria-controls={menuId}
            onClick={(event) => {
              event.stopPropagation()
              if (menuOpen) closeMenu()
              else openMenu()
            }}
            className="touch-target appearance-none border-0 bg-transparent flex items-center justify-center rounded-full text-[var(--fg-3)] transition-[background-color,color,transform] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] cursor-pointer hover:text-[var(--fg-1)] active:scale-[0.96]"
            style={{ width: 48, minHeight: 48 }}
          >
            <MoreVertical size={20} strokeWidth={1.8} />
          </button>
          <Menu
            id={menuId}
            open={menuOpen}
            anchorRef={menuAnchorRef}
            title={habit.title || t('habits.actions.menuTitle')}
            titleMode={habit.title ? 'typed' : 'label'}
            items={menuItems}
            onClose={closeMenu}
            onSelect={(id) => {
              const handlers: Record<string, (() => void) | undefined> = {
                add: onAddSubHabit, move: onMoveParent, skip: onSkip, reschedule: onReschedule,
                edit: onEdit, duplicate: onDuplicate, select: onEnterSelectMode,
                drill: onDrillInto, delete: onDelete,
              }
              handlers[id]?.()
            }}
          />
        </>
      )}
    </div>
  )
}

'use client'

import { useRef, useState } from 'react'
import { MoreVertical } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { ParentRing } from '@/components/ui/parent-ring'
import { Menu } from '@/components/ui/menu'
import { CheckCircle } from './habit-row-check-circle'
import type { HabitRowActions } from './habit-row'
import type { MenuItem } from '@orbit/shared/contracts/overlay'
import type { HabitStatus } from '@orbit/shared/contracts/lists'

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

function buildMenuItems(
  t: ReturnType<typeof useTranslations>,
  actions: HabitRowActions,
  canSelect: boolean,
  canDrillInto: boolean,
  hasProAccess: boolean,
): MenuItem[] {
  const items: MenuItem[] = []
  if (actions.onAddSubHabit) items.push({ id: 'add', label: t('habits.form.addSubHabit'), badge: hasProAccess ? undefined : 'Pro' })
  if (actions.onMoveParent) items.push({ id: 'move', label: t('habits.moveParent.button') })
  if (actions.onSkip) items.push({ id: 'skip', label: t('habits.actions.skip') })
  if (actions.onReschedule) items.push({ id: 'reschedule', label: t('habits.actions.reschedule') })
  if (actions.onEdit) items.push({ id: 'edit', label: t('common.edit') })
  if (actions.onDuplicate) items.push({ id: 'duplicate', label: t('habits.actions.duplicate') })
  if (canSelect && actions.onEnterSelectMode) items.push({ id: 'select', label: t('common.select') })
  if (canDrillInto && actions.onDrillInto) {
    items.push({ id: 'drill', label: t('habits.actions.openSubHabits') })
  }
  if (actions.onDelete) {
    items.push({ id: 'delete', label: t('habits.deleteHabit'), destructive: true })
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
  readOnly: boolean
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
  hasProAccess,
  onToggleStatus,
  readOnly,
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
  const [menuOpen, setMenuOpen] = useState(false)
  const menuAnchorRef = useRef<HTMLButtonElement>(null)
  const menuItems = buildMenuItems(t, actions, canSelect, canDrillInto, hasProAccess)
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
                if (readOnly) return
                const parentAction = isDone ? actions.onUnlog : actions.onLog
                parentAction?.()
              }}
              disabled={readOnly}
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
            disabled={readOnly || (!canLog && !isDone)}
            size={depth === 1 ? 24 : 30}
            ariaLabel={`${statusLabel}, ${toggleLabel}: ${habit.title}`}
          />
        ))}
      {!selectMode && hasMenuActions && (
        <>
          <button
            ref={menuAnchorRef}
            type="button"
            aria-label={t('habits.actions.more')}
            aria-expanded={menuOpen}
            disabled={readOnly}
            onClick={(event) => {
              event.stopPropagation()
              if (readOnly) return
              setMenuOpen((current) => !current)
            }}
            className="touch-target appearance-none border-0 bg-transparent flex items-center justify-center rounded-full text-[var(--fg-3)] transition-[background-color,color,transform] duration-[160ms] ease-[var(--ease-standard)] hover:bg-[var(--bg-elev-pressed)] hover:text-[var(--fg-1)] active:scale-[0.96]"
            style={{ width: 44, height: 44, cursor: 'pointer' }}
          >
            <MoreVertical size={20} strokeWidth={1.8} />
          </button>
          <Menu
            open={menuOpen}
            anchorRef={menuAnchorRef}
            title={t('habits.actions.more')}
            items={menuItems}
            onClose={() => setMenuOpen(false)}
            onSelect={(id) => {
              if (readOnly) return
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

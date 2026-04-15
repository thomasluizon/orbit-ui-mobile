'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Copy,
  FastForward,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { HighlightText } from '@/components/ui/highlight-text'
import { useTimeFormat } from '@/hooks/use-time-format'
import { HabitAvatarTile } from './habit-avatar-tile'
import { HabitLogButton } from './habit-log-button'
import { HabitMetaRow } from './habit-meta-row'
import { HabitCardMenu, type HabitCardMenuItem } from './habit-card-menu'
import {
  computeHabitCardStatus,
  computeHabitFlexibleProgressLabel,
  computeHabitFrequencyLabel,
  computeHabitMatchBadges,
  computeHabitStatusBadge,
  getHabitProgressRatio,
  shouldShowHabitProgressArc,
  type HabitCardStatus,
  type HabitCardTranslationAdapter,
} from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HabitCardActions {
  onLog?: () => void
  onUnlog?: () => void
  onSkip?: () => void
  onDelete?: () => void
  onDuplicate?: () => void
  onEdit?: () => void
  onMoveParent?: () => void
  onDetail?: () => void
  onDrillInto?: () => void
  onToggleSelection?: () => void
  onAddSubHabit?: () => void
  onToggleExpand?: () => void
  onForceLogParent?: () => void
  onEnterSelectMode?: () => void
}

interface HabitCardProps {
  habit: NormalizedHabit
  selectedDate?: Date
  depth?: number
  isSelectMode?: boolean
  isSelected?: boolean
  isJustCreated?: boolean
  showAddSubHabit?: boolean
  hasChildren?: boolean
  hasSubHabits?: boolean
  isExpanded?: boolean
  isLastChild?: boolean
  isDraggingList?: boolean
  childrenDone?: number
  childrenTotal?: number
  searchQuery?: string
  maxHabitDepth?: number
  actions?: HabitCardActions
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface CardClassesArgs {
  isChild: boolean
  status: HabitCardStatus
  isCompletedForRange: boolean
  isNotDueToday: boolean
  isSelected: boolean
}

function buildCardClasses({
  isChild,
  status,
  isCompletedForRange,
  isNotDueToday,
  isSelected,
}: CardClassesArgs): string {
  const classes: string[] = ['habit-card', 'cursor-pointer', 'group/card']
  classes.push(isChild ? 'habit-card-child' : 'habit-card-parent')
  if (!isChild && status === 'due-today') classes.push('habit-status-due')
  if (!isChild && status === 'overdue') classes.push('habit-status-overdue')
  if (isCompletedForRange) classes.push('habit-state-completed opacity-[0.55]')
  else if (isNotDueToday) classes.push('opacity-40')
  if (isSelected) classes.push('habit-state-selected ring-2 ring-primary ring-offset-2 ring-offset-background')
  return classes.join(' ')
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const HabitCard = React.memo(function HabitCard({
  habit,
  selectedDate,
  depth = 0,
  isSelectMode = false,
  isSelected = false,
  isJustCreated = false,
  showAddSubHabit = false,
  hasChildren = false,
  hasSubHabits = false,
  isExpanded = true,
  childrenDone = 0,
  childrenTotal = 0,
  searchQuery = '',
  maxHabitDepth = 5,
  actions = {},
}: Readonly<HabitCardProps>) {
  const {
    onLog,
    onUnlog,
    onSkip,
    onDelete,
    onDuplicate,
    onEdit,
    onMoveParent,
    onDetail,
    onDrillInto,
    onToggleSelection,
    onAddSubHabit,
    onToggleExpand,
    onForceLogParent,
    onEnterSelectMode,
  } = actions
  const t = useTranslations()
  const { displayTime } = useTimeFormat()

  const isChild = depth > 0
  const isCompletedForRange = habit.isCompleted || habit.isLoggedInRange
  const checkedCount = habit.checklistItems?.filter((i) => i.isChecked).length ?? 0
  const tagsAnchorRef = useRef<HTMLSpanElement>(null)

  // ---------------------------------------------------------------------------
  // Status, labels, derived state
  // ---------------------------------------------------------------------------

  const status = useMemo(
    () => computeHabitCardStatus(habit, selectedDate),
    [habit, selectedDate],
  )

  const canSkip =
    !habit.isGeneral &&
    !habit.isCompleted &&
    (status === 'due-today' || status === 'overdue')
  const isPostpone = !habit.frequencyUnit

  const statusBadge = useMemo(
    () => computeHabitStatusBadge(status, t as HabitCardTranslationAdapter),
    [status, t],
  )

  const isNotDueToday = useMemo(() => {
    if (!selectedDate) return false
    if (habit.isGeneral) return false
    return status === 'pending'
  }, [habit.isGeneral, selectedDate, status])

  const isParentWithChildren = hasChildren && childrenTotal > 0
  const childRatio = childrenTotal === 0 ? 0 : childrenDone / childrenTotal
  const progressRatio = useMemo(
    () =>
      getHabitProgressRatio(habit, {
        hasChildren: isParentWithChildren,
        childrenDone,
        childrenTotal,
      }),
    [habit, isParentWithChildren, childrenDone, childrenTotal],
  )
  const showArc = useMemo(
    () =>
      shouldShowHabitProgressArc(habit, {
        hasChildren: isParentWithChildren,
        childrenTotal,
      }),
    [habit, isParentWithChildren, childrenTotal],
  )

  const frequencyLabel = useMemo(
    () => computeHabitFrequencyLabel(habit, t as HabitCardTranslationAdapter),
    [habit, t],
  )
  const flexibleProgressLabel = useMemo(
    () => computeHabitFlexibleProgressLabel(habit, t as HabitCardTranslationAdapter),
    [habit, t],
  )
  const matchBadges = useMemo(
    () => computeHabitMatchBadges(searchQuery, habit, t as HabitCardTranslationAdapter),
    [searchQuery, habit, t],
  )

  // ---------------------------------------------------------------------------
  // Animations: completion pulse + creation glow
  // ---------------------------------------------------------------------------

  const [pulseTile, setPulseTile] = useState(false)
  const [glowTile, setGlowTile] = useState(false)
  const prevDoneRef = useRef(isCompletedForRange)
  const completionTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const creationTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (isCompletedForRange && !prevDoneRef.current) {
      setPulseTile(true)
      if (completionTimer.current) clearTimeout(completionTimer.current)
      completionTimer.current = setTimeout(() => setPulseTile(false), 600)
    }
    prevDoneRef.current = isCompletedForRange
    return () => {
      if (completionTimer.current) clearTimeout(completionTimer.current)
    }
  }, [isCompletedForRange])

  useEffect(() => {
    if (isJustCreated) {
      setGlowTile(true)
      if (creationTimer.current) clearTimeout(creationTimer.current)
      creationTimer.current = setTimeout(() => setGlowTile(false), 1400)
    }
    return () => {
      if (creationTimer.current) clearTimeout(creationTimer.current)
    }
  }, [isJustCreated])

  // ---------------------------------------------------------------------------
  // Tile log handler (also covers parent w/ children: "force log parent")
  // ---------------------------------------------------------------------------

  // The avatar tile is replaced by SelectionCircle while the list is in
  // select mode, so this handler only runs outside select mode. We still
  // branch on `isSelectMode` as a belt-and-braces safeguard in case a parent
  // ever starts rendering the tile in both modes.
  const handleTileTap = useCallback(() => {
    if (isSelectMode) {
      onToggleSelection?.()
      return
    }
    if (isCompletedForRange) {
      onUnlog?.()
      return
    }
    if (isParentWithChildren && childrenDone < childrenTotal) {
      onForceLogParent?.()
      return
    }
    onLog?.()
  }, [
    isSelectMode,
    isCompletedForRange,
    isParentWithChildren,
    childrenDone,
    childrenTotal,
    onToggleSelection,
    onUnlog,
    onForceLogParent,
    onLog,
  ])

  // ---------------------------------------------------------------------------
  // Card click → detail (or selection toggle)
  //
  // The click handler lives on the card container itself so that taps on the
  // title, description, meta row, or any empty space inside the card all work.
  // Interactive children (avatar tile, expand toggle, kebab menu, checklist
  // progress bar) live above this surface and must `stopPropagation` on their
  // own click handlers so the card-level handler does not double-fire.
  // ---------------------------------------------------------------------------

  const handleCardClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Guard against clicks originating from interactive children. They set
      // `data-card-click-ignore` (or stopPropagation) to opt out of the
      // card-level action. This is belt-and-braces protection in case a
      // descendant forgets to stopPropagation (e.g. nested portals).
      const target = e.target as HTMLElement | null
      if (target?.closest('[data-card-click-ignore]')) return
      if (isSelectMode) {
        onToggleSelection?.()
      } else {
        onDetail?.()
      }
    },
    [isSelectMode, onToggleSelection, onDetail],
  )

  const handleCardKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget) return
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        if (isSelectMode) onToggleSelection?.()
        else onDetail?.()
      }
    },
    [isSelectMode, onToggleSelection, onDetail],
  )

  // ---------------------------------------------------------------------------
  // Menu items
  // ---------------------------------------------------------------------------

  const menuItems = useMemo<HabitCardMenuItem[]>(() => {
    return [
      {
        key: 'add-sub-habit',
        icon: Plus,
        label: t('habits.form.addSubHabit'),
        onClick: () => onAddSubHabit?.(),
        hidden: !(showAddSubHabit && depth < maxHabitDepth - 1),
      },
      {
        key: 'move-parent',
        icon: ArrowRight,
        label: t('habits.moveParent.button'),
        onClick: () => onMoveParent?.(),
      },
      {
        key: 'skip',
        icon: FastForward,
        label: isPostpone ? t('habits.actions.postpone') : t('habits.actions.skip'),
        onClick: () => onSkip?.(),
        variant: 'warning' as const,
        hidden: !canSkip,
      },
      {
        key: 'edit',
        icon: Pencil,
        label: t('common.edit'),
        onClick: () => onEdit?.(),
      },
      {
        key: 'duplicate',
        icon: Copy,
        label: t('habits.actions.duplicate'),
        onClick: () => onDuplicate?.(),
      },
      {
        key: 'select',
        icon: CheckCircle2,
        label: t('common.select'),
        onClick: () => onEnterSelectMode?.(),
      },
      {
        key: 'drill-into',
        icon: ChevronRight,
        label: t('habits.actions.openSubHabits'),
        onClick: () => onDrillInto?.(),
        hidden: !hasSubHabits,
      },
      {
        key: 'delete',
        icon: Trash2,
        label: t('common.delete'),
        onClick: () => onDelete?.(),
        variant: 'danger' as const,
      },
    ]
  }, [
    t,
    showAddSubHabit,
    depth,
    maxHabitDepth,
    canSkip,
    isPostpone,
    hasSubHabits,
    onAddSubHabit,
    onMoveParent,
    onSkip,
    onEdit,
    onDuplicate,
    onEnterSelectMode,
    onDrillInto,
    onDelete,
  ])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const indentStyle = depth > 0 ? { marginLeft: `${depth * 1.5}rem` } : undefined
  const cardClasses = buildCardClasses({
    isChild,
    status,
    isCompletedForRange,
    isNotDueToday,
    isSelected,
  })

  // Avatar tile centerLabel: parent-with-children shows "x/n" inside the tile.
  const tileCenterLabel =
    isParentWithChildren && !isCompletedForRange
      ? `${childrenDone}/${childrenTotal}`
      : null

  // Selection-mode shows a checkbox in the tile slot instead of the avatar
  // (we still want the tile to be the only accent surface).
  const tileSize = isChild ? 'sm' : 'md'

  return (
    <div style={isChild ? indentStyle : undefined}>
      <div
        data-tour="tour-habit-card"
        role="button"
        tabIndex={0}
        aria-label={habit.title}
        aria-pressed={isSelectMode ? isSelected : undefined}
        onClick={handleCardClick}
        onKeyDown={handleCardKeyDown}
        className={`${cardClasses} relative w-full text-left flex items-center gap-3 sm:gap-3.5 ${isChild ? 'p-3' : 'p-3 sm:p-3.5'} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background`}
      >
        {/* ExpandToggle (children only) */}
        {hasChildren ? (
          <div className="relative z-10 shrink-0" data-card-click-ignore>
            <button
              type="button"
              data-no-drag
              aria-label={isExpanded ? t('habits.collapseAll') : t('habits.expandAll')}
              aria-expanded={isExpanded}
              onClick={(e) => {
                e.stopPropagation()
                onToggleExpand?.()
              }}
              className={`shrink-0 inline-flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-elevated/60 transition-all duration-200 size-7 ${
                isExpanded ? 'rotate-90' : ''
              }`}
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        ) : null}

        {/* Log/finalize button + decorative emoji tile (or selection checkbox
            in select mode). The log button is an interactive target that must
            NOT bubble to the card-level detail handler (hence its own
            `data-card-click-ignore` + stopPropagation). The emoji tile is
            purely decorative — clicks on it fall through to the card handler
            so there is no dead zone on the card surface. */}
        {isSelectMode ? (
          <div className="relative z-10 shrink-0">
            <SelectionCircle
              isSelected={isSelected}
              habitTitle={habit.title}
              size={tileSize === 'md' ? 52 : 40}
            />
          </div>
        ) : (
          <div className="relative z-10 shrink-0 flex items-center gap-2">
            <div data-card-click-ignore>
              <HabitLogButton
                size={tileSize}
                isCompleted={isCompletedForRange}
                isOverdue={status === 'overdue'}
                isBadHabit={!!habit.isBadHabit}
                showArc={showArc && !isChild}
                progressRatio={isParentWithChildren ? childRatio : progressRatio}
                centerLabel={tileCenterLabel}
                isDisabled={isNotDueToday && !isCompletedForRange}
                pulse={pulseTile}
                glow={glowTile}
                onClick={handleTileTap}
                ariaLabel={
                  isCompletedForRange
                    ? t('habits.actions.unlog', { title: habit.title })
                    : t('habits.logHabit')
                }
              />
            </div>
            {habit.icon && habit.icon.trim().length > 0 ? (
              <HabitAvatarTile
                icon={habit.icon}
                title={habit.title}
                size={tileSize}
                isCompleted={isCompletedForRange}
                isBadHabit={!!habit.isBadHabit}
              />
            ) : null}
          </div>
        )}

        {/* Title + meta */}
        <div className="relative z-10 flex-1 min-w-0">
          <h3
            className={`font-semibold text-text-primary truncate tracking-[-0.005em] ${
              isChild ? 'text-[14px] leading-5' : 'text-[15px] sm:text-[16px] leading-5'
            } ${isCompletedForRange ? 'line-through decoration-text-muted/40 decoration-1' : ''}`}
          >
            <HighlightText text={habit.title} query={searchQuery} />
          </h3>
          {habit.description ? (
            <p
              className={`text-text-muted truncate mt-0.5 ${
                isChild ? 'text-[11px]' : 'text-[12px]'
              }`}
            >
              <HighlightText text={habit.description} query={searchQuery} />
            </p>
          ) : null}
          <div className="mt-1.5">
            <HabitMetaRow
              habit={habit}
              isChild={isChild}
              isCompleted={isCompletedForRange}
              frequencyLabel={frequencyLabel}
              flexibleProgressLabel={flexibleProgressLabel}
              statusBadge={statusBadge}
              status={status}
              checkedCount={checkedCount}
              matchBadges={matchBadges}
              displayTime={displayTime}
              tagsAnchorRef={tagsAnchorRef}
            />
          </div>
        </div>

        {/* Actions menu */}
        {!isSelectMode ? (
          <div className="relative z-10" data-card-click-ignore>
            <HabitCardMenu items={menuItems} isSelectMode={isSelectMode} />
          </div>
        ) : null}

        {/* Checklist progress bar — full-bleed bottom strip */}
        {habit.checklistItems && habit.checklistItems.length > 0 ? (
          <ChecklistProgressBar
            done={checkedCount}
            total={habit.checklistItems.length}
            isCompleted={isCompletedForRange}
          />
        ) : null}
      </div>
    </div>
  )
})

// ---------------------------------------------------------------------------
// Internal: selection checkbox in tile slot
// ---------------------------------------------------------------------------

/**
 * Presentational selection indicator rendered in the avatar tile slot while
 * the list is in select mode. Clicks bubble up to the card's click handler,
 * which owns the selection toggle — keeping a single source of truth.
 */
function SelectionCircle({
  isSelected,
  habitTitle,
  size,
}: Readonly<{
  isSelected: boolean
  habitTitle: string
  size: number
}>) {
  const t = useTranslations()
  return (
    <span
      data-no-drag
      role="checkbox"
      aria-checked={isSelected}
      aria-label={`${t('common.select')}: ${habitTitle}`}
      className={`pointer-events-none shrink-0 inline-flex items-center justify-center rounded-2xl border-2 transition-all duration-200 ${
        isSelected
          ? 'border-transparent bg-primary text-white'
          : 'border-border-emphasis text-transparent'
      }`}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 24 24" width={size * 0.42} height={size * 0.42} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </span>
  )
}

// ---------------------------------------------------------------------------
// Internal: checklist progress bar
// ---------------------------------------------------------------------------

function ChecklistProgressBar({
  done,
  total,
  isCompleted,
}: Readonly<{ done: number; total: number; isCompleted: boolean }>) {
  if (total === 0) return null
  const ratio = isCompleted ? 1 : Math.max(0, Math.min(1, done / total))
  return (
    <span
      aria-hidden="true"
      className="absolute left-0 right-0 bottom-0 h-[3px] overflow-hidden rounded-b-2xl bg-border-muted/50"
    >
      <span
        className="block h-full bg-primary transition-[width] duration-500"
        style={{ width: `${(ratio * 100).toFixed(2)}%` }}
      />
    </span>
  )
}

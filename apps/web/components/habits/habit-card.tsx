'use client'

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  ChevronRight,
  Check,
  MoreVertical,
  Plus,
  ArrowRight,
  FastForward,
  Copy,
  CheckCircle2,
  Pencil,
  Trash2,
  ClipboardCheck,
  Flame,
  type LucideIcon,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { HighlightText } from '@/components/ui/highlight-text'
import { useTimeFormat } from '@/hooks/use-time-format'
import {
  computeHabitCardStatus,
  computeHabitFlexibleProgressLabel,
  computeHabitFrequencyLabel,
  computeHabitMatchBadges,
  computeHabitStatusBadge,
  type HabitCardTranslationAdapter,
  type HabitCardStatus,
} from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'

// ---------------------------------------------------------------------------
// Props
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

interface MenuAction {
  key: string
  icon: LucideIcon
  label: string
  onClick: () => void
  variant?: 'danger'
  hidden?: boolean
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

type MutableDivRef = { current: HTMLDivElement | null }

/** Build article className from flags (replaces long ternary chain). */
interface ArticleClassNameOptions {
  isChild: boolean
  status: HabitCardStatus
  isDoneForRange: boolean
  isNotDueToday: boolean
  isSelected: boolean
  justCompleted: boolean
  justCreated: boolean
}

function buildArticleClassName(opts: ArticleClassNameOptions): string {
  const { isChild, status, isDoneForRange, isNotDueToday, isSelected, justCompleted, justCreated } = opts
  const classes: string[] = ['cursor-pointer']

  if (isChild) {
    classes.push('habit-card-child rounded-xl py-3 px-3.5')
  } else {
    classes.push('habit-card-parent rounded-2xl p-4 sm:p-5')
  }
  if (!isChild && status === 'due-today') classes.push('habit-status-due pl-4 sm:pl-5')
  if (!isChild && status === 'overdue') classes.push('habit-status-overdue pl-4 sm:pl-5')
  if (isDoneForRange || isNotDueToday) classes.push('opacity-40')
  if (isSelected) classes.push('ring-2 ring-primary ring-offset-2 ring-offset-background')
  if (justCompleted) classes.push('animate-complete-glow')
  if (justCreated) classes.push('animate-creation-glow')

  return classes.join(' ')
}

// Spark positions as a module-level constant (S6479: stable keys via coordinates)
const SPARK_POSITIONS = [
  { x: '12px', y: '-12px' },
  { x: '-12px', y: '8px' },
  { x: '8px', y: '12px' },
  { x: '-8px', y: '-8px' },
] as const

// Menu positioning constants
const MENU_WIDTH_PX = 176
const MENU_MARGIN_PX = 8
const MENU_ESTIMATED_HEIGHT_PX = 220

// ---------------------------------------------------------------------------
// Sub-components (extracted to reduce cognitive complexity - S3776)
// ---------------------------------------------------------------------------

function CompletionSparks({ show }: Readonly<{ show: boolean }>) {
  if (!show) return null
  return (
    <>
      {SPARK_POSITIONS.map((pos, idx) => (
        <span
          key={`${pos.x}-${pos.y}`}
          className="absolute size-1.5 rounded-full bg-primary animate-complete-spark pointer-events-none"
          style={
            {
              '--spark-x': pos.x,
              '--spark-y': pos.y,
              animationDelay: `${idx * 50}ms`,
            } as React.CSSProperties
          }
        />
      ))}
    </>
  )
}

function BadHabitBadge() {
  const t = useTranslations()
  return (
    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase text-red-400 bg-red-500/10 border border-red-500/10">
      {t('habits.badHabit')}
    </span>
  )
}

function TagBadge({ tag, searchQuery }: Readonly<{ tag: { id: string; name: string; color: string }; searchQuery: string }>) {
  return (
    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold text-white/95" style={{ backgroundColor: tag.color }}>
      <HighlightText text={tag.name} query={searchQuery} />
    </span>
  )
}

function StreakBadgeInline({ streak }: Readonly<{ streak: number | null | undefined }>) {
  if (streak == null || streak < 2) return null
  return (
    <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] font-bold text-amber-400 bg-amber-400/10 border border-amber-400/10">
      <Flame className="size-3" />
      {streak}
    </span>
  )
}

function ChecklistBadge({ items, checkedCount, hasBorder }: Readonly<{
  items: Array<{ text: string; isChecked: boolean }> | undefined | null
  checkedCount: number
  hasBorder?: boolean
}>) {
  if (!items || items.length === 0) return null
  return (
    <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] font-bold text-text-secondary bg-surface-elevated/60 ${hasBorder ? 'border border-border-muted' : ''}`}>
      <ClipboardCheck className="size-3" />
      {checkedCount}/{items.length}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Badge rows
// ---------------------------------------------------------------------------

interface TopLevelBadgesProps {
  habit: NormalizedHabit
  frequencyLabel: string
  flexibleProgressLabel: string | null
  statusBadge: { text: string; color: string; bg: string } | null
  checkedCount: number
  searchQuery: string
  matchBadges: Array<{ label: string }>
  displayTime: (time: string) => string
}

function TopLevelBadges({
  habit, frequencyLabel, flexibleProgressLabel, statusBadge,
  checkedCount, searchQuery, matchBadges, displayTime,
}: Readonly<TopLevelBadgesProps>) {
  return (
    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-text-muted/70">
        {frequencyLabel}
      </span>
      {flexibleProgressLabel && (
        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] font-bold text-primary bg-primary/10 border border-primary/10">
          {flexibleProgressLabel}
        </span>
      )}
      {habit.dueTime && (
        <span className="text-[10px] font-medium text-text-secondary">
          {displayTime(habit.dueTime)}
          {habit.dueEndTime ? ` - ${displayTime(habit.dueEndTime)}` : ''}
        </span>
      )}
      {statusBadge && (
        <span className={`shrink-0 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${statusBadge.color} ${statusBadge.bg}`}>
          {statusBadge.text}
        </span>
      )}
      {habit.isBadHabit && <BadHabitBadge />}
      {habit.tags && habit.tags.length > 0 && (
        <span data-tour="tour-habit-tags" className="inline-flex flex-wrap gap-1">
          {habit.tags.map((tag) => (
            <TagBadge key={tag.id} tag={tag} searchQuery={searchQuery} />
          ))}
        </span>
      )}
      {(habit.linkedGoals ?? []).map((goal) => (
        <span key={goal.id} className="px-2 py-0.5 rounded-full text-[9px] font-bold text-primary bg-primary/10 border border-primary/10">
          {goal.title}
        </span>
      ))}
      <StreakBadgeInline streak={habit.currentStreak} />
      <ChecklistBadge items={habit.checklistItems} checkedCount={checkedCount} hasBorder />
      {matchBadges.map((badge) => (
        <span key={badge.label} className="px-2 py-0.5 rounded-full text-[9px] font-bold text-primary bg-primary/10 border border-primary/10">
          {badge.label}
        </span>
      ))}
    </div>
  )
}

function ChildBadHabitBadges({ habit, searchQuery, checkedCount }: Readonly<{
  habit: NormalizedHabit; searchQuery: string; checkedCount: number
}>) {
  return (
    <div className="flex items-center gap-1.5 mt-0.5">
      <BadHabitBadge />
      {habit.tags?.map((tag) => (
        <TagBadge key={tag.id} tag={tag} searchQuery={searchQuery} />
      ))}
      <StreakBadgeInline streak={habit.currentStreak} />
      <ChecklistBadge items={habit.checklistItems} checkedCount={checkedCount} />
    </div>
  )
}

function ChildDefaultBadges({ habit, frequencyLabel, statusBadge, searchQuery, checkedCount }: Readonly<{
  habit: NormalizedHabit; frequencyLabel: string
  statusBadge: { text: string; color: string; bg: string } | null
  searchQuery: string; checkedCount: number
}>) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
      <span className="text-[9px] font-semibold uppercase tracking-widest text-text-muted/60">
        {frequencyLabel}
      </span>
      {statusBadge && (
        <span className={`shrink-0 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${statusBadge.color} ${statusBadge.bg}`}>
          {statusBadge.text}
        </span>
      )}
      {habit.tags?.map((tag) => (
        <TagBadge key={tag.id} tag={tag} searchQuery={searchQuery} />
      ))}
      <StreakBadgeInline streak={habit.currentStreak} />
      <ChecklistBadge items={habit.checklistItems} checkedCount={checkedCount} />
    </div>
  )
}

/** Replaces nested ternary for badge row selection (S3358). */
function BadgesRow({ isChild, habit, frequencyLabel, flexibleProgressLabel, statusBadge, checkedCount, searchQuery, matchBadges, displayTime }: Readonly<{
  isChild: boolean
  habit: NormalizedHabit
  frequencyLabel: string
  flexibleProgressLabel: string | null
  statusBadge: { text: string; color: string; bg: string } | null
  checkedCount: number
  searchQuery: string
  matchBadges: Array<{ label: string }>
  displayTime: (time: string) => string
}>) {
  if (!isChild) {
    return (
      <TopLevelBadges
        habit={habit}
        frequencyLabel={frequencyLabel}
        flexibleProgressLabel={flexibleProgressLabel}
        statusBadge={statusBadge}
        checkedCount={checkedCount}
        searchQuery={searchQuery}
        matchBadges={matchBadges}
        displayTime={displayTime}
      />
    )
  }
  if (habit.isBadHabit) {
    return <ChildBadHabitBadges habit={habit} searchQuery={searchQuery} checkedCount={checkedCount} />
  }
  return <ChildDefaultBadges habit={habit} frequencyLabel={frequencyLabel} statusBadge={statusBadge} searchQuery={searchQuery} checkedCount={checkedCount} />
}

// ---------------------------------------------------------------------------
// Selection checkbox (S6819: native <input type="checkbox">, S6842: no role)
// ---------------------------------------------------------------------------

function SelectionCheckbox({ isChild, isSelected, habitTitle, onToggle }: Readonly<{
  isChild: boolean
  isSelected: boolean
  habitTitle: string
  onToggle: (() => void) | undefined
}>) {
  const t = useTranslations()
  return (
    <label
      data-no-drag
      className={`shrink-0 rounded-full border-2 flex items-center justify-center transition-all duration-200 cursor-pointer ${
        isChild ? 'size-8' : 'size-10 sm:size-11'
      } ${
        isSelected
          ? 'log-btn-done border-transparent text-white'
          : 'border-border-emphasis hover:border-primary/40 hover:bg-primary/5'
      }`}
    >
      <input
        type="checkbox"
        checked={isSelected}
        aria-label={`${t('common.select')}: ${habitTitle}`}
        className="sr-only"
        onChange={(e) => {
          e.stopPropagation()
          onToggle?.()
        }}
        onClick={(e) => e.stopPropagation()}
      />
      {isSelected && (
        <Check className={isChild ? 'size-4' : 'size-5'} aria-hidden="true" />
      )}
    </label>
  )
}

// ---------------------------------------------------------------------------
// Progress ring SVG (extracted from ParentLogButton)
// ---------------------------------------------------------------------------

function ProgressRingSvg({ isDoneForRange, progressPercent, ringPulse }: Readonly<{
  isDoneForRange: boolean
  progressPercent: number
  ringPulse: boolean
}>) {
  const progressStrokeClass = isDoneForRange || progressPercent === 100
    ? 'text-primary'
    : 'text-primary/60'

  return (
    <svg
      className={`absolute inset-0 -rotate-90 ${
        isDoneForRange || progressPercent > 0 ? 'progress-ring-glow' : ''
      } ${ringPulse ? 'animate-ring-pulse' : ''}`}
      viewBox="0 0 36 36"
    >
      <circle
        cx="18" cy="18" r="15"
        fill="none" stroke="currentColor" strokeWidth="2"
        className="text-border-muted"
      />
      <circle
        cx="18" cy="18" r="15"
        fill="none" stroke="currentColor" strokeWidth="2.5"
        className={`transition-all duration-500 ${progressStrokeClass}`}
        strokeLinecap="round"
        strokeDasharray={`${isDoneForRange ? 94.25 : progressPercent * 0.9425} 94.25`}
      />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Parent log button (progress ring)
// ---------------------------------------------------------------------------

function ParentLogButton({ isChild, isDoneForRange, isNotDueToday, childrenDone, childrenTotal, progressPercent, ringPulse, justCompleted, habitTitle, onLog, onUnlog, onForceLogParent }: Readonly<{
  isChild: boolean
  isDoneForRange: boolean
  isNotDueToday: boolean
  childrenDone: number
  childrenTotal: number
  progressPercent: number
  ringPulse: boolean
  justCompleted: boolean
  habitTitle: string
  onLog: (() => void) | undefined
  onUnlog: (() => void) | undefined
  onForceLogParent: (() => void) | undefined
}>) {
  const t = useTranslations()

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (isNotDueToday) return
    if (isDoneForRange) {
      onUnlog?.()
    } else if (childrenDone >= childrenTotal) {
      onLog?.()
    } else {
      onForceLogParent?.()
    }
  }, [isNotDueToday, isDoneForRange, childrenDone, childrenTotal, onUnlog, onLog, onForceLogParent])

  return (
    <button
      data-no-drag
      aria-label={
        isDoneForRange
          ? t('habits.actions.unlog', { title: habitTitle })
          : t('habits.logHabit')
      }
      aria-pressed={isDoneForRange}
      onClick={handleClick}
      className={`log-btn shrink-0 relative flex items-center justify-center active:scale-95 ${
        isChild ? 'size-8' : 'size-10 sm:size-11'
      } ${justCompleted ? 'animate-complete-pop' : ''}`}
    >
      <ProgressRingSvg isDoneForRange={isDoneForRange} progressPercent={progressPercent} ringPulse={ringPulse} />
      {isDoneForRange ? (
        <Check className="size-4 text-primary" />
      ) : (
        <span className="text-[9px] font-bold text-text-secondary tabular-nums">
          {childrenDone}/{childrenTotal}
        </span>
      )}
      <CompletionSparks show={justCompleted} />
    </button>
  )
}

// ---------------------------------------------------------------------------
// Simple log button (circle indicator)
// ---------------------------------------------------------------------------

function SimpleLogButton({ isChild, isDoneForRange, status, justCompleted, habitTitle, onLog, onUnlog }: Readonly<{
  isChild: boolean
  isDoneForRange: boolean
  status: HabitCardStatus
  justCompleted: boolean
  habitTitle: string
  onLog: (() => void) | undefined
  onUnlog: (() => void) | undefined
}>) {
  const t = useTranslations()

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (isDoneForRange) {
      onUnlog?.()
    } else {
      onLog?.()
    }
  }, [isDoneForRange, onUnlog, onLog])

  let borderClass = 'border-2 border-border-emphasis hover:border-primary/35'
  if (isDoneForRange) {
    borderClass = 'log-btn-done text-white'
  } else if (status === 'overdue') {
    borderClass = 'border-2 border-red-500/20 hover:border-red-500/40'
  }

  return (
    <button
      data-no-drag
      aria-label={
        isDoneForRange
          ? t('habits.actions.unlog', { title: habitTitle })
          : t('habits.logHabit')
      }
      aria-pressed={isDoneForRange}
      onClick={handleClick}
      className={`log-btn shrink-0 rounded-full relative flex items-center justify-center active:scale-95 ${
        isChild ? 'size-8' : 'size-10 sm:size-11'
      } ${borderClass} ${justCompleted ? 'animate-complete-pop' : ''}`}
    >
      {isDoneForRange && (
        <Check className={isChild ? 'size-3.5' : 'size-4'} />
      )}
      <CompletionSparks show={justCompleted} />
    </button>
  )
}

// ---------------------------------------------------------------------------
// Log indicator selector (replaces nested ternary - S3358)
// ---------------------------------------------------------------------------

function LogIndicator({ isSelectMode, isSelected, isParentWithChildren, isChild, isDoneForRange, isNotDueToday, status, childrenDone, childrenTotal, progressPercent, ringPulse, justCompleted, habitTitle, onLog, onUnlog, onForceLogParent, onToggleSelection }: Readonly<{
  isSelectMode: boolean
  isSelected: boolean
  isParentWithChildren: boolean
  isChild: boolean
  isDoneForRange: boolean
  isNotDueToday: boolean
  status: HabitCardStatus
  childrenDone: number
  childrenTotal: number
  progressPercent: number
  ringPulse: boolean
  justCompleted: boolean
  habitTitle: string
  onLog: (() => void) | undefined
  onUnlog: (() => void) | undefined
  onForceLogParent: (() => void) | undefined
  onToggleSelection: (() => void) | undefined
}>) {
  if (isSelectMode) {
    return (
      <SelectionCheckbox
        isChild={isChild}
        isSelected={isSelected}
        habitTitle={habitTitle}
        onToggle={onToggleSelection}
      />
    )
  }
  if (isParentWithChildren) {
    return (
      <ParentLogButton
        isChild={isChild}
        isDoneForRange={isDoneForRange}
        isNotDueToday={isNotDueToday}
        childrenDone={childrenDone}
        childrenTotal={childrenTotal}
        progressPercent={progressPercent}
        ringPulse={ringPulse}
        justCompleted={justCompleted}
        habitTitle={habitTitle}
        onLog={onLog}
        onUnlog={onUnlog}
        onForceLogParent={onForceLogParent}
      />
    )
  }
  return (
    <SimpleLogButton
      isChild={isChild}
      isDoneForRange={isDoneForRange}
      status={status}
      justCompleted={justCompleted}
      habitTitle={habitTitle}
      onLog={onLog}
      onUnlog={onUnlog}
    />
  )
}

// ---------------------------------------------------------------------------
// Expand/collapse toggle
// ---------------------------------------------------------------------------

function ExpandToggle({ hasChildren, isExpanded, isChild, onToggleExpand }: Readonly<{
  hasChildren: boolean
  isExpanded: boolean
  isChild: boolean
  onToggleExpand: (() => void) | undefined
}>) {
  const t = useTranslations()
  if (!hasChildren) return null
  return (
    <button
      data-no-drag
      aria-label={isExpanded ? t('habits.collapseAll') : t('habits.expandAll')}
      aria-expanded={isExpanded}
      onClick={(e) => {
        e.stopPropagation()
        onToggleExpand?.()
      }}
      className={`shrink-0 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-elevated/60 transition-all duration-200 ${
        isChild ? 'size-6' : 'size-7'
      } ${isExpanded ? 'rotate-90' : ''}`}
    >
      <ChevronRight className={isChild ? 'size-3.5' : 'size-4'} />
    </button>
  )
}

// ---------------------------------------------------------------------------
// Card content (title, description, badges)
// ---------------------------------------------------------------------------

function CardContent({ habit, isChild, isDoneForRange, searchQuery, frequencyLabel, flexibleProgressLabel, statusBadge, checkedCount, matchBadges, displayTime }: Readonly<{
  habit: NormalizedHabit
  isChild: boolean
  isDoneForRange: boolean
  searchQuery: string
  frequencyLabel: string
  flexibleProgressLabel: string | null
  statusBadge: { text: string; color: string; bg: string } | null
  checkedCount: number
  matchBadges: Array<{ label: string }>
  displayTime: (time: string) => string
}>) {
  return (
    <div className="flex-1 min-w-0">
      <h3
        className={`font-bold text-text-primary truncate ${
          isChild ? 'text-sm' : 'text-sm sm:text-base'
        } ${
          isDoneForRange
            ? 'line-through decoration-text-muted/40 decoration-1'
            : ''
        }`}
      >
        <HighlightText text={habit.title} query={searchQuery} />
      </h3>
      {habit.description && (
        <p
          className={`text-text-muted truncate mt-0.5 ${
            isChild ? 'text-[10px]' : 'text-[11px] sm:text-xs'
          }`}
        >
          <HighlightText text={habit.description} query={searchQuery} />
        </p>
      )}
      <BadgesRow
        isChild={isChild}
        habit={habit}
        frequencyLabel={frequencyLabel}
        flexibleProgressLabel={flexibleProgressLabel}
        statusBadge={statusBadge}
        checkedCount={checkedCount}
        searchQuery={searchQuery}
        matchBadges={matchBadges}
        displayTime={displayTime}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Actions menu trigger
// ---------------------------------------------------------------------------

function ActionsMenuTrigger({ isChild, menuRef, onToggle }: Readonly<{
  isChild: boolean
  menuRef: React.RefObject<HTMLDivElement | null>
  onToggle: () => void
}>) {
  const t = useTranslations()
  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        data-no-drag
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
        className={`text-text-muted/40 hover:text-text-primary transition-all duration-200 rounded-full hover:bg-surface-elevated/60 ${
          isChild ? 'p-1.5' : 'p-2'
        }`}
        title={t('habits.actions.more')}
        aria-label={t('habits.actions.more')}
      >
        <MoreVertical className={isChild ? 'size-3.5' : 'size-4'} />
      </button>
    </div>
  )
}

function MenuActionButton({
  label,
  icon,
  onClick,
  className,
}: Readonly<{
  label: string
  icon: React.ReactNode
  onClick: (e: React.MouseEvent) => void
  className: string
}>) {
  return (
    <button
      role="menuitem"
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-colors duration-150 ${className}`}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Actions menu panel (portal) - S6852: tabIndex for focusability
// ---------------------------------------------------------------------------

function ActionsMenuPanel({ panelRef, menuPosition, menuOpensUp, menuItems, closeMenu }: Readonly<{
  panelRef: MutableDivRef
  menuPosition: { top: number; left: number }
  menuOpensUp: boolean
  menuItems: MenuAction[]
  closeMenu: () => void
}>) {
  const dangerIndex = menuItems.findIndex((item) => item.variant === 'danger')

  // Focus first menu item on mount
  const setRef = useCallback((el: HTMLDivElement | null) => {
    panelRef.current = el
    if (el) {
      requestAnimationFrame(() => {
        const first = el.querySelector<HTMLElement>('[role="menuitem"]')
        first?.focus()
      })
    }
  }, [panelRef])

  return createPortal(
    <div
      ref={setRef}
      role="menu"
      tabIndex={-1}
      className="habit-actions-menu fixed z-[70] min-w-[12rem] rounded-2xl p-1.5"
      style={{
        left: `${menuPosition.left}px`,
        top: `${menuPosition.top}px`,
        transform: menuOpensUp ? 'translateY(-100%)' : 'none',
      }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { closeMenu(); return }
        const items = panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]')
        if (!items?.length) return
        const current = Array.from(items).indexOf(document.activeElement as HTMLElement)
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          const next = current < items.length - 1 ? current + 1 : 0
          items[next]?.focus()
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          const prev = current > 0 ? current - 1 : items.length - 1
          items[prev]?.focus()
        } else if (e.key === 'Home') {
          e.preventDefault()
          items[0]?.focus()
        } else if (e.key === 'End') {
          e.preventDefault()
          items[items.length - 1]?.focus()
        }
      }}
    >
      {menuItems.map((item, idx) => {
        const isDanger = item.variant === 'danger'
        const showDivider = isDanger && dangerIndex > 0 && idx === dangerIndex
        const Icon = item.icon
        let itemClassName: string
        if (isDanger) {
          itemClassName = 'text-red-400 hover:bg-red-500/10'
        } else if (item.key === 'skip') {
          itemClassName = 'text-amber-400 hover:bg-amber-500/10'
        } else {
          itemClassName = 'text-text-primary hover:bg-surface-elevated/60'
        }
        return (
          <div key={item.key}>
            {showDivider && <div className="my-1 mx-2 h-px bg-surface-elevated/60" />}
            <MenuActionButton
              label={item.label}
              icon={<Icon className={`size-4 ${isDanger ? '' : 'text-text-muted'}`} />}
              onClick={(e) => {
                e.stopPropagation()
                item.onClick()
                closeMenu()
              }}
              className={itemClassName}
            />
          </div>
        )
      })}
    </div>,
    document.body,
  )
}

// ---------------------------------------------------------------------------
// Custom hook: actions menu state + positioning
// ---------------------------------------------------------------------------

function useActionsMenu(
  actionsMenuRef: React.RefObject<HTMLDivElement | null>,
  actionsMenuPanelRef: MutableDivRef,
  isSelectMode: boolean,
) {
  const [showActionsMenu, setShowActionsMenu] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 })
  const [menuOpensUp, setMenuOpensUp] = useState(false)

  const closeActionsMenu = useCallback(() => setShowActionsMenu(false), [])

  const toggleActionsMenu = useCallback(() => {
    if (!showActionsMenu) {
      const rect = actionsMenuRef.current?.getBoundingClientRect()
      if (rect) {
        // The fixed bottom nav occludes the lower part of the viewport, so
        // treat its top edge as the effective viewport bottom for flip checks.
        const bottomNav = document.querySelector<HTMLElement>('[data-bottom-nav]')
        const effectiveBottom = bottomNav?.getBoundingClientRect().top ?? globalThis.innerHeight
        const opensUp =
          rect.bottom + MENU_ESTIMATED_HEIGHT_PX + MENU_MARGIN_PX > effectiveBottom
        setMenuOpensUp(opensUp)
        const preferredLeft = rect.right - MENU_WIDTH_PX
        const maxLeft =
          globalThis.innerWidth - MENU_WIDTH_PX - MENU_MARGIN_PX
        const left = Math.min(
          Math.max(preferredLeft, MENU_MARGIN_PX),
          Math.max(MENU_MARGIN_PX, maxLeft),
        )
        const top = opensUp
          ? rect.top - MENU_MARGIN_PX
          : rect.bottom + MENU_MARGIN_PX
        setMenuPosition({ top, left })
      }
    }
    setShowActionsMenu((prev) => !prev)
  }, [showActionsMenu, actionsMenuRef])

  // Global listeners while menu is open
  useEffect(() => {
    if (!showActionsMenu) return

    function handlePointerDown(event: PointerEvent) {
      const target = event.target
      if (!(target instanceof Node)) return
      if (actionsMenuRef.current?.contains(target)) return
      if (actionsMenuPanelRef.current?.contains(target)) return
      setShowActionsMenu(false)
    }
    function handleKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') setShowActionsMenu(false)
    }
    function handleScroll() {
      setShowActionsMenu(false)
    }
    function handleViewportChange() {
      setShowActionsMenu(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeydown)
    document.addEventListener('scroll', handleScroll, true)
    globalThis.addEventListener('resize', handleViewportChange)
    globalThis.addEventListener('orientationchange', handleViewportChange)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeydown)
      document.removeEventListener('scroll', handleScroll, true)
      globalThis.removeEventListener('resize', handleViewportChange)
      globalThis.removeEventListener('orientationchange', handleViewportChange)
    }
  }, [showActionsMenu, actionsMenuRef, actionsMenuPanelRef])

  // Close menu on select mode
  useEffect(() => {
    if (isSelectMode) setShowActionsMenu(false)
  }, [isSelectMode])

  return { showActionsMenu, menuPosition, menuOpensUp, closeActionsMenu, toggleActionsMenu }
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
  isLastChild = false,
  isDraggingList = false,
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
  const checkedCount =
    habit.checklistItems?.filter((i) => i.isChecked).length ?? 0

  // Completion animation
  const [justCompleted, setJustCompleted] = useState(false)
  const completionTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Creation glow
  const [justCreated, setJustCreated] = useState(false)
  const creationTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (isJustCreated) {
      setJustCreated(true)
      if (creationTimer.current) clearTimeout(creationTimer.current)
      creationTimer.current = setTimeout(() => setJustCreated(false), 1200)
    }
    return () => {
      if (creationTimer.current) clearTimeout(creationTimer.current)
    }
  }, [isJustCreated])

  // Computed values
  const isDoneForRange = habit.isCompleted || habit.isLoggedInRange
  const status = useMemo(
    () => computeHabitCardStatus(habit, selectedDate),
    [habit, selectedDate],
  )
  const canSkip = !habit.isGeneral && !habit.isCompleted && (status === 'due-today' || status === 'overdue')
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
  const progressPercent =
    childrenTotal === 0 ? 0 : Math.round((childrenDone / childrenTotal) * 100)

  // Trigger completion animation
  const prevDoneRef = useRef(isDoneForRange)
  useEffect(() => {
    if (isDoneForRange && !prevDoneRef.current) {
      setJustCompleted(true)
      if (completionTimer.current) clearTimeout(completionTimer.current)
      completionTimer.current = setTimeout(() => setJustCompleted(false), 1200)
    }
    prevDoneRef.current = isDoneForRange
    return () => {
      if (completionTimer.current) clearTimeout(completionTimer.current)
    }
  }, [isDoneForRange])

  // Ring pulse
  const [ringPulse, setRingPulse] = useState(false)
  const prevProgress = useRef(progressPercent)
  useEffect(() => {
    if (progressPercent === 100 && prevProgress.current < 100) {
      setRingPulse(true)
      const timer = setTimeout(() => setRingPulse(false), 800)
      return () => clearTimeout(timer)
    }
    prevProgress.current = progressPercent
  }, [progressPercent])

  // Memoized labels
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

  // Actions menu
  const actionsMenuRef = useRef<HTMLDivElement>(null)
  const actionsMenuPanelRef = useRef<HTMLDivElement>(null)
  const { showActionsMenu, menuPosition, menuOpensUp, closeActionsMenu, toggleActionsMenu } =
    useActionsMenu(actionsMenuRef, actionsMenuPanelRef, isSelectMode)

  const menuItems = useMemo<MenuAction[]>(() => {
    const items: MenuAction[] = [
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
        key: 'delete',
        icon: Trash2,
        label: t('common.delete'),
        onClick: () => onDelete?.(),
        variant: 'danger',
      },
      {
        key: 'drill-into',
        icon: ChevronRight,
        label: t('habits.actions.openSubHabits'),
        onClick: () => onDrillInto?.(),
        hidden: !hasSubHabits,
      },
    ]
    return items.filter((item) => !item.hidden)
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
    onDelete,
    onDrillInto,
  ])

  const handleCardClick = useCallback(() => {
    if (isSelectMode) {
      onToggleSelection?.()
    } else {
      onDetail?.()
    }
  }, [isSelectMode, onToggleSelection, onDetail])

  const indentStyle = depth > 0 ? { marginLeft: `${depth * 1.5}rem` } : undefined

  const articleClassName = buildArticleClassName({
    isChild, status, isDoneForRange, isNotDueToday,
    isSelected, justCompleted, justCreated,
  })

  return (
    <>
      <div style={isChild ? indentStyle : undefined}>
        <div
          data-tour="tour-habit-card"
          className={`${articleClassName} relative text-left w-full`}
        >
          <button
            type="button"
            className={`${articleClassName} absolute inset-0 z-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background`}
            onClick={handleCardClick}
            aria-label={habit.title}
          />
          <div
            className={`pointer-events-none relative z-10 flex items-center ${
              isChild ? 'gap-3' : 'gap-3.5 sm:gap-4'
            }`}
          >
            <div className="pointer-events-auto">
              <ExpandToggle
                hasChildren={hasChildren}
                isExpanded={isExpanded}
                isChild={isChild}
                onToggleExpand={onToggleExpand}
              />
            </div>

            <div className="pointer-events-auto">
              <LogIndicator
                isSelectMode={isSelectMode}
                isSelected={isSelected}
                isParentWithChildren={isParentWithChildren}
                isChild={isChild}
                isDoneForRange={isDoneForRange}
                isNotDueToday={isNotDueToday}
                status={status}
                childrenDone={childrenDone}
                childrenTotal={childrenTotal}
                progressPercent={progressPercent}
                ringPulse={ringPulse}
                justCompleted={justCompleted}
                habitTitle={habit.title}
                onLog={onLog}
                onUnlog={onUnlog}
                onForceLogParent={onForceLogParent}
                onToggleSelection={onToggleSelection}
              />
            </div>

            <CardContent
              habit={habit}
              isChild={isChild}
              isDoneForRange={isDoneForRange}
              searchQuery={searchQuery}
              frequencyLabel={frequencyLabel}
              flexibleProgressLabel={flexibleProgressLabel}
              statusBadge={statusBadge}
              checkedCount={checkedCount}
              matchBadges={matchBadges}
              displayTime={displayTime}
            />

            {!isSelectMode && (
              <div className="pointer-events-auto">
                <ActionsMenuTrigger
                  isChild={isChild}
                  menuRef={actionsMenuRef}
                  onToggle={toggleActionsMenu}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {showActionsMenu && (
        <ActionsMenuPanel
          panelRef={actionsMenuPanelRef}
          menuPosition={menuPosition}
          menuOpensUp={menuOpensUp}
          menuItems={menuItems}
          closeMenu={closeActionsMenu}
        />
      )}
    </>
  )
})

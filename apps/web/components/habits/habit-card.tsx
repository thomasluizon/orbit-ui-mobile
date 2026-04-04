'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
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
  Trash2,
  ClipboardCheck,
  Flame,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { HighlightText } from '@/components/ui/highlight-text'
import { formatAPIDate } from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

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
  onLog?: () => void
  onUnlog?: () => void
  onSkip?: () => void
  onDelete?: () => void
  onDuplicate?: () => void
  onMoveParent?: () => void
  onDetail?: () => void
  onDrillInto?: () => void
  onToggleSelection?: () => void
  onAddSubHabit?: () => void
  onToggleExpand?: () => void
  onForceLogParent?: () => void
  onEnterSelectMode?: () => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncate(text: string, max = 20): string {
  return text.length > max ? text.slice(0, max) + '...' : text
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HabitCard({
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
  onLog,
  onUnlog,
  onSkip,
  onDelete,
  onDuplicate,
  onMoveParent,
  onDetail,
  onDrillInto,
  onToggleSelection,
  onAddSubHabit,
  onToggleExpand,
  onForceLogParent,
  onEnterSelectMode,
}: HabitCardProps) {
  const t = useTranslations()

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
  }, [isJustCreated])

  // Computed values
  const isDoneForRange = habit.isCompleted || habit.isLoggedInRange

  const status = useMemo(() => {
    if (isDoneForRange) return 'completed' as const
    if (habit.isGeneral) return 'pending' as const
    if (habit.isOverdue && !habit.frequencyUnit) return 'overdue' as const
    const selectedDateStr = formatAPIDate(selectedDate ?? new Date())
    const hasTodaySchedule =
      habit.instances?.some((i) => i.date === selectedDateStr) ?? false
    if (hasTodaySchedule) return 'due-today' as const
    return 'pending' as const
  }, [isDoneForRange, habit, selectedDate])

  const canSkip =
    !habit.isGeneral &&
    !habit.isCompleted &&
    (status === 'due-today' || status === 'overdue')

  const isPostpone = !habit.frequencyUnit

  const statusBadge = useMemo(() => {
    if (status === 'overdue') {
      return {
        text: t('habits.overdue'),
        color: 'text-red-500',
        bg: 'bg-red-500/10',
      }
    }
    return null
  }, [status, t])

  const isNotDueToday = useMemo(() => {
    if (!selectedDate) return false
    if (status !== 'pending') return false
    return true
  }, [selectedDate, status])

  const isParentWithChildren = hasChildren && childrenTotal > 0
  const progressPercent =
    childrenTotal === 0
      ? 0
      : Math.round((childrenDone / childrenTotal) * 100)

  // Trigger completion animation
  const prevDoneRef = useRef(isDoneForRange)
  useEffect(() => {
    if (isDoneForRange && !prevDoneRef.current) {
      setJustCompleted(true)
      if (completionTimer.current) clearTimeout(completionTimer.current)
      completionTimer.current = setTimeout(() => setJustCompleted(false), 1200)
    }
    prevDoneRef.current = isDoneForRange
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

  // Frequency label
  const frequencyLabel = useMemo(() => {
    if (habit.isGeneral) return t('habits.generalHabit')
    const { frequencyUnit, frequencyQuantity, days, isFlexible } = habit
    if (!frequencyUnit) return t('habits.oneTimeTask')
    if (isFlexible) {
      return t('habits.frequency.flexibleLabel', {
        n: frequencyQuantity ?? 1,
        unit: t(`habits.form.unit${frequencyUnit}` as any),
      })
    }
    if (frequencyQuantity === 1 && days.length > 0) {
      return days
        .map((day) => t(`dates.daysShort.${day.toLowerCase()}` as any))
        .join(', ')
    }
    if (frequencyQuantity === 1)
      return t(`habits.frequency.every${frequencyUnit}` as any)
    return t(`habits.frequency.everyN${frequencyUnit}s` as any, {
      n: frequencyQuantity ?? 1,
    })
  }, [habit, t])

  // Flexible progress label
  const flexibleProgressLabel = useMemo(() => {
    if (!habit.isFlexible) return null
    const target = habit.flexibleTarget ?? habit.frequencyQuantity ?? 1
    const done = habit.flexibleCompleted ?? 0
    const unit = habit.frequencyUnit
      ? t(`habits.form.unit${habit.frequencyUnit}` as any)
      : ''
    return t('habits.frequency.flexibleProgress', { done, target, unit })
  }, [habit, t])

  // Match badges for search
  const matchBadges = useMemo(() => {
    if (!searchQuery || !habit.searchMatches) return []
    return habit.searchMatches
      .filter((m) => m.field !== 'title')
      .map((m) => {
        if (m.field === 'tag') return { label: t('habits.search.matchTag', { value: truncate(m.value ?? '') }) }
        if (m.field === 'child') return { label: t('habits.search.matchChild', { value: truncate(m.value ?? '') }) }
        return { label: t('habits.search.matchDescription') }
      })
  }, [searchQuery, habit.searchMatches, t])

  // Actions menu
  const [showActionsMenu, setShowActionsMenu] = useState(false)
  const actionsMenuRef = useRef<HTMLDivElement>(null)
  const actionsMenuPanelRef = useRef<HTMLDivElement>(null)
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 })
  const [menuOpensUp, setMenuOpensUp] = useState(false)

  const MENU_WIDTH_PX = 192
  const MENU_MARGIN_PX = 8
  const MENU_ESTIMATED_HEIGHT_PX = 220

  const closeActionsMenu = useCallback(() => setShowActionsMenu(false), [])

  const toggleActionsMenu = useCallback(() => {
    if (!showActionsMenu) {
      const rect = actionsMenuRef.current?.getBoundingClientRect()
      if (rect) {
        const opensUp =
          rect.bottom + MENU_ESTIMATED_HEIGHT_PX + MENU_MARGIN_PX >
          globalThis.innerHeight
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
  }, [showActionsMenu])

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

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeydown)
    document.addEventListener('scroll', handleScroll, true)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeydown)
      document.removeEventListener('scroll', handleScroll, true)
    }
  }, [showActionsMenu])

  // Close menu on select mode
  useEffect(() => {
    if (isSelectMode) setShowActionsMenu(false)
  }, [isSelectMode])

  const handleCardClick = useCallback(() => {
    if (isSelectMode) {
      onToggleSelection?.()
    } else {
      onDetail?.()
    }
  }, [isSelectMode, onToggleSelection, onDetail])

  const indentStyle = depth > 0 ? { marginLeft: `${depth * 1.5}rem` } : undefined

  // Spark animation positions
  const sparkPositions = [
    { x: '12px', y: '-12px' },
    { x: '-12px', y: '8px' },
    { x: '8px', y: '12px' },
    { x: '-8px', y: '-8px' },
  ]

  return (
    <>
      <div style={isChild ? indentStyle : undefined}>
        <article
          aria-label={habit.title}
          className={`cursor-pointer ${
            !isChild
              ? 'habit-card-parent rounded-2xl p-4 sm:p-5'
              : 'habit-card-child rounded-xl py-3 px-3.5'
          } ${
            !isChild && status === 'due-today'
              ? 'habit-status-due pl-4 sm:pl-5'
              : ''
          } ${
            !isChild && status === 'overdue'
              ? 'habit-status-overdue pl-4 sm:pl-5'
              : ''
          } ${isDoneForRange || isNotDueToday ? 'opacity-40' : ''} ${
            showActionsMenu ? 'relative z-20' : ''
          } ${
            isSelected
              ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
              : ''
          } ${justCompleted ? 'animate-complete-glow' : ''} ${
            justCreated ? 'animate-creation-glow' : ''
          }`}
          onClick={handleCardClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              handleCardClick()
            }
          }}
        >
          <div
            className={`flex items-center ${
              isChild ? 'gap-3' : 'gap-3.5 sm:gap-4'
            }`}
          >
            {/* Expand/collapse toggle */}
            {hasChildren && (
              <button
                data-no-drag
                aria-label={
                  isExpanded
                    ? t('habits.collapseAll')
                    : t('habits.expandAll')
                }
                aria-expanded={isExpanded}
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleExpand?.()
                }}
                className={`shrink-0 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-elevated/60 transition-all duration-200 ${
                  isChild ? 'size-6' : 'size-7'
                } ${isExpanded ? 'rotate-90' : ''}`}
              >
                <ChevronRight
                  className={isChild ? 'size-3.5' : 'size-4'}
                />
              </button>
            )}

            {/* Selection checkbox */}
            {isSelectMode ? (
              <button
                data-no-drag
                aria-checked={isSelected}
                aria-label={`${t('common.select')}: ${habit.title}`}
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleSelection?.()
                }}
                className={`shrink-0 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
                  isChild ? 'size-8' : 'size-10 sm:size-11'
                } ${
                  isSelected
                    ? 'log-btn-done border-transparent text-white'
                    : 'border-border-emphasis hover:border-primary/40 hover:bg-primary/5'
                }`}
              >
                {isSelected && (
                  <Check className={isChild ? 'size-4' : 'size-5'} />
                )}
              </button>
            ) : isParentWithChildren ? (
              /* Progress ring for parent habits */
              <button
                data-no-drag
                aria-label={
                  isDoneForRange
                    ? t('habits.actions.unlog', { title: habit.title })
                    : t('habits.logHabit')
                }
                aria-pressed={isDoneForRange}
                onClick={(e) => {
                  e.stopPropagation()
                  if (isNotDueToday) return
                  if (isDoneForRange) {
                    onUnlog?.()
                  } else if (childrenDone >= childrenTotal) {
                    onLog?.()
                  } else {
                    onForceLogParent?.()
                  }
                }}
                className={`log-btn shrink-0 relative flex items-center justify-center active:scale-95 ${
                  isChild ? 'size-8' : 'size-10 sm:size-11'
                } ${justCompleted ? 'animate-complete-pop' : ''}`}
              >
                <svg
                  className={`absolute inset-0 -rotate-90 ${
                    isDoneForRange || progressPercent > 0
                      ? 'progress-ring-glow'
                      : ''
                  } ${ringPulse ? 'animate-ring-pulse' : ''}`}
                  viewBox="0 0 36 36"
                >
                  <circle
                    cx="18"
                    cy="18"
                    r="15"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-border-muted"
                  />
                  <circle
                    cx="18"
                    cy="18"
                    r="15"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    className={`transition-all duration-500 ${
                      isDoneForRange
                        ? 'text-primary'
                        : progressPercent === 100
                          ? 'text-primary'
                          : 'text-primary/60'
                    }`}
                    strokeLinecap="round"
                    strokeDasharray={`${isDoneForRange ? 94.25 : progressPercent * 0.9425} 94.25`}
                  />
                </svg>
                {isDoneForRange ? (
                  <Check className="size-4 text-primary" />
                ) : (
                  <span className="text-[9px] font-bold text-text-secondary tabular-nums">
                    {childrenDone}/{childrenTotal}
                  </span>
                )}
                {justCompleted &&
                  sparkPositions.map((pos, i) => (
                    <span
                      key={i}
                      className="absolute size-1.5 rounded-full bg-primary animate-complete-spark pointer-events-none"
                      style={
                        {
                          '--spark-x': pos.x,
                          '--spark-y': pos.y,
                          animationDelay: `${i * 50}ms`,
                        } as React.CSSProperties
                      }
                    />
                  ))}
              </button>
            ) : (
              /* Log button (circle indicator) */
              <button
                data-no-drag
                aria-label={
                  isDoneForRange
                    ? t('habits.actions.unlog', { title: habit.title })
                    : t('habits.logHabit')
                }
                aria-pressed={isDoneForRange}
                onClick={(e) => {
                  e.stopPropagation()
                  if (isDoneForRange) {
                    onUnlog?.()
                  } else {
                    onLog?.()
                  }
                }}
                className={`log-btn shrink-0 rounded-full relative flex items-center justify-center active:scale-95 ${
                  isChild ? 'size-8' : 'size-10 sm:size-11'
                } ${
                  isDoneForRange
                    ? 'log-btn-done text-white'
                    : status === 'overdue'
                      ? 'border-2 border-red-500/20 hover:border-red-500/40'
                      : 'border-2 border-border-emphasis hover:border-primary/35'
                } ${justCompleted ? 'animate-complete-pop' : ''}`}
              >
                {isDoneForRange && (
                  <Check className={isChild ? 'size-3.5' : 'size-4'} />
                )}
                {justCompleted &&
                  sparkPositions.map((pos, i) => (
                    <span
                      key={i}
                      className="absolute size-1.5 rounded-full bg-primary animate-complete-spark pointer-events-none"
                      style={
                        {
                          '--spark-x': pos.x,
                          '--spark-y': pos.y,
                          animationDelay: `${i * 50}ms`,
                        } as React.CSSProperties
                      }
                    />
                  ))}
              </button>
            )}

            {/* Content */}
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
                  <HighlightText
                    text={habit.description}
                    query={searchQuery}
                  />
                </p>
              )}

              {/* Badges row -- 3 branches matching Vue exactly */}
              {!isChild ? (
                /* Top-level habit badges */
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
                      {habit.dueTime}
                      {habit.dueEndTime ? ` - ${habit.dueEndTime}` : ''}
                    </span>
                  )}
                  {statusBadge && (
                    <span
                      className={`shrink-0 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${statusBadge.color} ${statusBadge.bg}`}
                    >
                      {statusBadge.text}
                    </span>
                  )}
                  {habit.isBadHabit && (
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase text-red-400 bg-red-500/10 border border-red-500/10">
                      {t('habits.badHabit')}
                    </span>
                  )}
                  {habit.tags?.map((tag) => (
                    <span
                      key={tag.id}
                      className="px-2 py-0.5 rounded-full text-[9px] font-bold text-white/95"
                      style={{ backgroundColor: tag.color }}
                    >
                      <HighlightText text={tag.name} query={searchQuery} />
                    </span>
                  ))}
                  {(habit.linkedGoals ?? []).map((goal) => (
                    <span
                      key={goal.id}
                      className="px-2 py-0.5 rounded-full text-[9px] font-bold text-primary bg-primary/10 border border-primary/10"
                    >
                      {goal.title}
                    </span>
                  ))}
                  {habit.currentStreak != null && habit.currentStreak >= 2 && (
                    <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] font-bold text-amber-400 bg-amber-400/10 border border-amber-400/10">
                      <Flame className="size-3" />
                      {habit.currentStreak}
                    </span>
                  )}
                  {habit.checklistItems &&
                    habit.checklistItems.length > 0 && (
                      <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] font-bold text-text-secondary bg-surface-elevated/60 border border-border-muted">
                        <ClipboardCheck className="size-3" />
                        {checkedCount}/{habit.checklistItems.length}
                      </span>
                    )}
                  {matchBadges.map((badge, i) => (
                    <span
                      key={`match-${i}`}
                      className="px-2 py-0.5 rounded-full text-[9px] font-bold text-primary bg-primary/10 border border-primary/10"
                    >
                      {badge.label}
                    </span>
                  ))}
                </div>
              ) : isChild && habit.isBadHabit ? (
                /* Child habit with bad habit badge */
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase text-red-400 bg-red-500/10">
                    {t('habits.badHabit')}
                  </span>
                  {habit.tags?.map((tag) => (
                    <span
                      key={tag.id}
                      className="px-2 py-0.5 rounded-full text-[9px] font-bold text-white/95"
                      style={{ backgroundColor: tag.color }}
                    >
                      <HighlightText text={tag.name} query={searchQuery} />
                    </span>
                  ))}
                  {habit.currentStreak != null && habit.currentStreak >= 2 && (
                    <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] font-bold text-amber-400 bg-amber-400/10">
                      <Flame className="size-3" />
                      {habit.currentStreak}
                    </span>
                  )}
                  {habit.checklistItems &&
                    habit.checklistItems.length > 0 && (
                      <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] font-bold text-text-secondary bg-surface-elevated/60">
                        <ClipboardCheck className="size-3" />
                        {checkedCount}/{habit.checklistItems.length}
                      </span>
                    )}
                </div>
              ) : (
                /* Child habit default badges */
                <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                  <span className="text-[9px] font-semibold uppercase tracking-widest text-text-muted/60">
                    {frequencyLabel}
                  </span>
                  {statusBadge && (
                    <span
                      className={`shrink-0 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${statusBadge.color} ${statusBadge.bg}`}
                    >
                      {statusBadge.text}
                    </span>
                  )}
                  {habit.tags?.map((tag) => (
                    <span
                      key={tag.id}
                      className="px-2 py-0.5 rounded-full text-[9px] font-bold text-white/95"
                      style={{ backgroundColor: tag.color }}
                    >
                      <HighlightText text={tag.name} query={searchQuery} />
                    </span>
                  ))}
                  {habit.currentStreak != null && habit.currentStreak >= 2 && (
                    <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] font-bold text-amber-400 bg-amber-400/10">
                      <Flame className="size-3" />
                      {habit.currentStreak}
                    </span>
                  )}
                  {habit.checklistItems &&
                    habit.checklistItems.length > 0 && (
                      <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] font-bold text-text-secondary bg-surface-elevated/60">
                        <ClipboardCheck className="size-3" />
                        {checkedCount}/{habit.checklistItems.length}
                      </span>
                    )}
                </div>
              )}
            </div>

            {/* Actions menu trigger */}
            {!isSelectMode && (
              <div ref={actionsMenuRef} className="relative shrink-0">
                <button
                  data-no-drag
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleActionsMenu()
                  }}
                  className={`text-text-muted/40 hover:text-text-primary transition-all duration-200 rounded-full hover:bg-surface-elevated/60 ${
                    isChild ? 'p-1.5' : 'p-2'
                  }`}
                  title={t('habits.actions.more')}
                  aria-label={t('habits.actions.more')}
                >
                  <MoreVertical
                    className={isChild ? 'size-3.5' : 'size-4'}
                  />
                </button>
              </div>
            )}
          </div>
        </article>
      </div>

      {/* Actions menu portal */}
      {showActionsMenu &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={actionsMenuPanelRef}
            className="habit-actions-menu fixed z-[70] min-w-[12rem] rounded-2xl p-1.5"
            style={{
              left: `${menuPosition.left}px`,
              top: `${menuPosition.top}px`,
              transform: menuOpensUp ? 'translateY(-100%)' : 'none',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {showAddSubHabit && (
              <button
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium text-text-primary hover:bg-surface-elevated/60 transition-colors duration-150"
                onClick={(e) => {
                  e.stopPropagation()
                  onAddSubHabit?.()
                  closeActionsMenu()
                }}
              >
                <Plus className="size-4 text-text-muted" />
                {t('habits.form.addSubHabit')}
              </button>
            )}

            <button
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium text-text-primary hover:bg-surface-elevated/60 transition-colors duration-150"
              onClick={(e) => {
                e.stopPropagation()
                onMoveParent?.()
                closeActionsMenu()
              }}
            >
              <ArrowRight className="size-4 text-text-muted" />
              {t('habits.moveParent.button')}
            </button>

            {canSkip && (
              <button
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium text-amber-400 hover:bg-amber-500/10 transition-colors duration-150"
                onClick={(e) => {
                  e.stopPropagation()
                  onSkip?.()
                  closeActionsMenu()
                }}
              >
                <FastForward className="size-4" />
                {isPostpone
                  ? t('habits.actions.postpone')
                  : t('habits.actions.skip')}
              </button>
            )}

            <button
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium text-text-primary hover:bg-surface-elevated/60 transition-colors duration-150"
              onClick={(e) => {
                e.stopPropagation()
                onDuplicate?.()
                closeActionsMenu()
              }}
            >
              <Copy className="size-4 text-text-muted" />
              {t('habits.actions.duplicate')}
            </button>

            <button
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium text-text-primary hover:bg-surface-elevated/60 transition-colors duration-150"
              onClick={(e) => {
                e.stopPropagation()
                onEnterSelectMode?.()
                closeActionsMenu()
              }}
            >
              <CheckCircle2 className="size-4 text-text-muted" />
              {t('common.select')}
            </button>

            <div className="my-1 mx-2 h-px bg-surface-elevated/60" />

            <button
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium text-red-400 hover:bg-red-500/10 transition-colors duration-150"
              onClick={(e) => {
                e.stopPropagation()
                onDelete?.()
                closeActionsMenu()
              }}
            >
              <Trash2 className="size-4" />
              {t('common.delete')}
            </button>

            {hasSubHabits && (
              <button
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium text-text-primary hover:bg-surface-elevated/60 transition-colors duration-150"
                onClick={(e) => {
                  e.stopPropagation()
                  onDrillInto?.()
                  closeActionsMenu()
                }}
              >
                <ChevronRight className="size-4 text-text-muted" />
                {t('habits.actions.openSubHabits')}
              </button>
            )}
          </div>,
          document.body,
        )}
    </>
  )
}

'use client'

import { useCallback, useMemo, useRef, useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  Bell,
  ChevronRight,
  ClipboardCheck,
  Copy,
  FastForward,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  computeHabitCardStatus,
  computeHabitChecklistCount,
  computeHabitFlexibleProgressLabel,
  computeHabitFrequencyLabel,
  computeHabitStatusBadge,
  computeNextReminderLabel,
  resolveHabitAccent,
} from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { HabitCardShell } from './primitives/habit-card-shell'
import { IconColorChip } from './primitives/icon-color-chip'
import { ProgressRing } from './primitives/progress-ring'
import { HabitLogButton } from './primitives/habit-log-button'
import { StreakFlameMini } from './primitives/streak-flame-mini'
import { SevenDayStrip } from './primitives/seven-day-strip'

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

function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return hex
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

export function HabitCard({
  habit,
  selectedDate,
  depth = 0,
  isSelectMode = false,
  isSelected = false,
  isJustCreated = false,
  hasChildren = false,
  isExpanded = false,
  childrenDone = 0,
  childrenTotal = 0,
  actions,
}: Readonly<HabitCardProps>) {
  const t = useTranslations()
  const [menuOpen, setMenuOpen] = useState(false)
  const [inlineExpanded, setInlineExpanded] = useState(false)
  const [justCompleted, setJustCompleted] = useState(false)
  const menuRef = useRef<HTMLButtonElement>(null)
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null)

  const isChild = depth > 0

  const translateAdapter = useCallback(
    (key: string, values?: Record<string, string | number | Date>) =>
      t(key as Parameters<typeof t>[0], values) as string,
    [t],
  )

  const status = useMemo(
    () => computeHabitCardStatus(habit, selectedDate),
    [habit, selectedDate],
  )

  const frequencyLabel = useMemo(
    () => computeHabitFrequencyLabel(habit, translateAdapter),
    [habit, translateAdapter],
  )

  const statusBadge = useMemo(
    () => computeHabitStatusBadge(status, translateAdapter),
    [status, translateAdapter],
  )

  const flexibleLabel = useMemo(
    () => computeHabitFlexibleProgressLabel(habit, translateAdapter),
    [habit, translateAdapter],
  )

  const checklistCount = useMemo(() => computeHabitChecklistCount(habit), [habit])
  const nextReminder = useMemo(
    () => computeNextReminderLabel(habit, new Date(), translateAdapter),
    [habit, translateAdapter],
  )

  const accent = useMemo(
    () =>
      resolveHabitAccent(habit, status, {
        primary: '#8b5cf6',
        amber: '#fbbf24',
        red: '#f87171',
        dim: (hex: string, alpha: number) => withAlpha(hex, alpha),
      }),
    [habit, status],
  )

  const isDone = habit.isCompleted || habit.isLoggedInRange
  const isParentWithChildren = hasChildren && childrenTotal > 0
  const parentProgress =
    isParentWithChildren && childrenTotal > 0 ? childrenDone / childrenTotal : 0
  const parentAllDone = isParentWithChildren && childrenDone >= childrenTotal
  const hasFlexibleProgress =
    habit.isFlexible && (habit.flexibleTarget ?? 0) > 0
  const flexibleProgress = hasFlexibleProgress
    ? (habit.flexibleCompleted ?? 0) / (habit.flexibleTarget ?? 1)
    : 0

  const handleCardPress = useCallback(() => {
    if (isSelectMode) {
      actions?.onToggleSelection?.()
      return
    }
    if (hasChildren && actions?.onToggleExpand) {
      actions.onToggleExpand()
      return
    }
    setInlineExpanded((prev) => !prev)
  }, [actions, hasChildren, isSelectMode])

  const handleLogClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      if (isDone) {
        actions?.onUnlog?.()
      } else {
        actions?.onLog?.()
        setJustCompleted(true)
        setTimeout(() => setJustCompleted(false), 600)
      }
    },
    [actions, isDone],
  )

  const openMenu = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    const rect = event.currentTarget.getBoundingClientRect()
    setMenuPosition({ top: rect.bottom + 4, left: rect.right - 160 })
    setMenuOpen(true)
  }, [])

  const closeMenu = useCallback(() => {
    setMenuOpen(false)
    setMenuPosition(null)
  }, [])

  const badges: Array<{ key: string; label: string; bg: string; color: string }> = []
  if (statusBadge) {
    badges.push({
      key: 'status',
      label: statusBadge.text,
      bg: statusBadge.bg,
      color: statusBadge.color,
    })
  }
  if (flexibleLabel) {
    badges.push({
      key: 'flexible',
      label: flexibleLabel,
      bg: withAlpha(accent.iconFg, 0.14),
      color: accent.iconFg,
    })
  }

  return (
    <HabitCardShell
      accentBar={accent.accentBar}
      status={status}
      isSelected={isSelected}
      isChild={isChild}
      depth={depth}
      dimmed={isDone && status === 'completed'}
      justCompleted={justCompleted}
      justCreated={isJustCreated}
      onPress={handleCardPress}
      ariaLabel={habit.title}
    >
      <div className="flex items-center gap-3">
        {/* Left: chevron + log/ring */}
        <div className="flex items-center gap-1.5">
          {hasChildren && !isSelectMode && actions?.onToggleExpand && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                actions.onToggleExpand?.()
              }}
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
              className="p-0.5 rounded hover:bg-surface-elevated transition-colors"
            >
              <ChevronRight
                className={`size-4 text-text-secondary transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              />
            </button>
          )}

          {isSelectMode ? (
            <span
              className="size-5 rounded-full border-2"
              style={{
                borderColor: isSelected ? accent.iconFg : 'rgba(255,255,255,0.2)',
                background: isSelected ? accent.iconFg : 'transparent',
              }}
            />
          ) : isParentWithChildren ? (
            <ProgressRing
              progress={parentProgress}
              color={accent.ringStroke}
              done={parentAllDone}
              size={36}
            >
              {!parentAllDone && (
                <span className="text-[10px] font-bold text-text-primary">
                  {childrenDone}/{childrenTotal}
                </span>
              )}
            </ProgressRing>
          ) : hasFlexibleProgress ? (
            <ProgressRing
              progress={flexibleProgress}
              color={accent.ringStroke}
              done={flexibleProgress >= 1}
              size={36}
            >
              <span className="text-[10px] font-bold text-text-primary">
                {habit.flexibleCompleted ?? 0}/{habit.flexibleTarget ?? 0}
              </span>
            </ProgressRing>
          ) : (
            <HabitLogButton
              color={accent.ringStroke}
              done={isDone}
              overdue={status === 'overdue'}
              size={36}
              onClick={handleLogClick}
              ariaLabel={t('habits.card.logAction')}
            />
          )}
        </div>

        {/* Middle: icon chip (parent only) + title + frequency */}
        {!isChild && (
          <IconColorChip
            icon={habit.icon ?? null}
            color={accent.iconFg}
            title={habit.title}
            size={40}
          />
        )}

        <div className="flex-1 min-w-0">
          <h3
            className={`truncate font-bold text-text-primary ${isChild ? 'text-sm' : 'text-sm sm:text-base'}`}
          >
            {habit.title}
          </h3>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-[11px] font-medium text-text-muted truncate">
              {frequencyLabel}
            </span>
            {badges.map((badge) => (
              <span
                key={badge.key}
                className="px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest"
                style={{ background: badge.bg, color: badge.color }}
              >
                {badge.label}
              </span>
            ))}
          </div>
        </div>

        {/* Right: streak + menu */}
        <div className="flex items-center gap-2 shrink-0">
          {!isChild && habit.currentStreak && habit.currentStreak >= 2 ? (
            <StreakFlameMini streak={habit.currentStreak} />
          ) : null}

          {!isSelectMode && (
            <button
              ref={menuRef}
              type="button"
              onClick={openMenu}
              aria-label={t('habits.card.menuAction')}
              className="p-1 rounded hover:bg-surface-elevated transition-colors"
            >
              <MoreVertical className="size-4 text-text-secondary" />
            </button>
          )}
        </div>
      </div>

      {/* Inline preview (only for parents, when expanded via tap) */}
      {inlineExpanded && !isChild && (
        <div className="mt-3 pt-3 border-t border-border-muted space-y-2.5">
          <SevenDayStrip habit={habit} accentColor={accent.ringStroke} />
          <div className="flex items-center gap-4">
            {checklistCount && (
              <span className="inline-flex items-center gap-1 text-[11px] text-text-muted">
                <ClipboardCheck className="size-3" />
                {checklistCount.checked}/{checklistCount.total}
              </span>
            )}
            {nextReminder && (
              <span className="inline-flex items-center gap-1 text-[11px] text-text-muted">
                <Bell className="size-3" />
                {nextReminder}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              actions?.onDetail?.()
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-semibold transition-colors hover:bg-surface-elevated"
            style={{ borderColor: accent.ringStroke, color: accent.ringStroke }}
          >
            {t('habits.card.seeMore')}
            <ChevronRight className="size-3" />
          </button>
        </div>
      )}

      {/* Menu (portal) */}
      {menuOpen && menuPosition && typeof window !== 'undefined' &&
        createPortal(
          <>
            <div className="fixed inset-0 z-50" onClick={closeMenu} />
            <div
              className="fixed z-50 w-44 rounded-lg border border-border-muted bg-surface-elevated shadow-xl overflow-hidden"
              style={{ top: menuPosition.top, left: menuPosition.left }}
            >
              {actions?.onAddSubHabit && (
                <MenuItem icon={Plus} label={t('habits.card.menuAction')} onClick={() => { closeMenu(); actions.onAddSubHabit?.() }} />
              )}
              {actions?.onSkip && (
                <MenuItem icon={FastForward} label={t('habits.skip')} onClick={() => { closeMenu(); actions.onSkip?.() }} />
              )}
              <MenuItem icon={Pencil} label={t('common.edit')} onClick={() => { closeMenu(); actions?.onEdit?.() }} />
              <MenuItem icon={Copy} label={t('common.duplicate')} onClick={() => { closeMenu(); actions?.onDuplicate?.() }} />
              <MenuItem
                icon={Trash2}
                label={t('common.delete')}
                variant="danger"
                onClick={() => { closeMenu(); actions?.onDelete?.() }}
              />
            </div>
          </>,
          document.body,
        )}
    </HabitCardShell>
  )
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  variant,
}: Readonly<{
  icon: typeof Plus
  label: string
  onClick: () => void
  variant?: 'danger'
}>) {
  const isDanger = variant === 'danger'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2.5 w-full px-3 py-2 text-left text-sm transition-colors ${
        isDanger
          ? 'text-red-400 hover:bg-red-500/10'
          : 'text-text-primary hover:bg-surface-overlay'
      }`}
    >
      <Icon className="size-4" />
      {label}
    </button>
  )
}

export default HabitCard

'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'next/navigation'
import {
  addDays,
  subDays,
  isToday,
  isYesterday,
  isTomorrow,
  format,
} from 'date-fns'
import { enUS, ptBR } from 'date-fns/locale'
import {
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  MoreVertical,
  CheckCircle,
  Eye,
  Check,
  RefreshCw,
  ChevronsDownUp,
  ChevronsUpDown,
  PlusCircle,
  MinusCircle,
  Forward,
  Trash2,
} from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import { useQueryClient } from '@tanstack/react-query'
import { habitKeys } from '@orbit/shared/query'
import { plural } from '@/lib/plural'
import { HabitList, type HabitListHandle } from '@/components/habits/habit-list'
import { HabitSummaryCard } from '@/components/habits/habit-summary-card'
import { CreateHabitModal } from '@/components/habits/create-habit-modal'
import { GoalsView } from '@/components/goals/goals-view'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { StreakBadge } from '@/components/gamification/streak-badge'
import { NotificationBell } from '@/components/navigation/notification-bell'
import { useUIStore } from '@/stores/ui-store'
import { useProfile } from '@/hooks/use-profile'
import { useStreakInfo } from '@/hooks/use-gamification'
import { useHabits, useBulkDeleteHabits, useBulkLogHabits, useBulkSkipHabits } from '@/hooks/use-habits'
import { useTags } from '@/hooks/use-tags'
import { formatAPIDate } from '@orbit/shared/utils'
import type { HabitsFilter } from '@orbit/shared/types/habit'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TAB_VIEWS = ['today', 'all', 'general', 'goals'] as const
const SKELETON_KEYS = ['sk-1', 'sk-2', 'sk-3', 'sk-4', 'sk-5'] as const

type TabView = (typeof TAB_VIEWS)[number]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTabLabel(
  view: TabView,
  t: ReturnType<typeof useTranslations>,
): string {
  switch (view) {
    case 'today':
      return t('habits.viewToday')
    case 'all':
      return t('habits.viewAll')
    case 'general':
      return t('habits.viewGeneral')
    case 'goals':
      return t('goals.tab')
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ControlsMenu({
  menuPanelRef,
  position,
  isSelectMode,
  showCompleted,
  isFetching,
  allCollapsed,
  onToggleSelect,
  onToggleCollapse,
  onRefresh,
  onToggleCompleted,
  onClose,
}: {
  menuPanelRef: React.RefObject<HTMLDivElement | null>
  position: { top: number; left: number }
  isSelectMode: boolean
  showCompleted: boolean
  isFetching: boolean
  allCollapsed: boolean
  onToggleSelect: () => void
  onToggleCollapse: () => void
  onRefresh: () => void
  onToggleCompleted: () => void
  onClose: () => void
}) {
  const t = useTranslations()

  return createPortal(
    <div
      ref={menuPanelRef}
      role="menu"
      tabIndex={0}
      className="fixed z-[70] min-w-[12.5rem] rounded-[var(--radius-lg)] border border-border-muted bg-surface-overlay shadow-[var(--shadow-lg)] p-1"
      style={{
        left: `${position.left}px`,
        top: `${position.top}px`,
      }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
    >
      <button
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-text-primary hover:bg-surface transition-colors"
        onClick={() => {
          onToggleSelect()
          onClose()
        }}
      >
        {isSelectMode ? (
          <X className="size-4 text-text-muted" />
        ) : (
          <CheckCircle className="size-4 text-text-muted" />
        )}
        {isSelectMode ? t('common.cancel') : t('common.select')}
      </button>
      <button
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-text-primary hover:bg-surface transition-colors"
        onClick={() => {
          onToggleCollapse()
          onClose()
        }}
      >
        {allCollapsed ? (
          <ChevronsUpDown className="size-4 text-text-muted" />
        ) : (
          <ChevronsDownUp className="size-4 text-text-muted" />
        )}
        {allCollapsed
          ? t('habits.expandAll')
          : t('habits.collapseAll')}
      </button>
      <button
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-text-primary hover:bg-surface transition-colors"
        disabled={isFetching}
        onClick={() => {
          onRefresh()
          onClose()
        }}
      >
        <RefreshCw className={`size-4 text-text-muted${isFetching ? ' animate-spin' : ''}`} />
        {t('habits.refresh')}
      </button>
      <button
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-text-primary hover:bg-surface transition-colors"
        onClick={() => {
          onToggleCompleted()
          onClose()
        }}
      >
        {showCompleted ? (
          <Check className="size-4 text-text-muted" />
        ) : (
          <Eye className="size-4 text-text-muted" />
        )}
        {t('habits.showCompleted')}
      </button>
    </div>,
    document.body,
  )
}

function BulkActionBar({
  selectedCount,
  allSelected,
  onSelectAll,
  onDeselectAll,
  onBulkLog,
  onBulkSkip,
  onBulkDelete,
  onCancel,
}: {
  selectedCount: number
  allSelected: boolean
  onSelectAll: () => void
  onDeselectAll: () => void
  onBulkLog: () => void
  onBulkSkip: () => void
  onBulkDelete: () => void
  onCancel: () => void
}) {
  const t = useTranslations()

  return createPortal(
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-var(--app-px)*2)] max-w-[calc(var(--app-max-w)-var(--app-px)*2)] bg-surface-overlay border border-border-muted rounded-[var(--radius-xl)] shadow-[var(--shadow-lg)] backdrop-blur-xl px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium shrink-0">
          {plural(t('common.selected', { n: selectedCount }), selectedCount)}
        </span>
        <div className="flex items-center gap-1">
          <button
            className="p-2 text-text-secondary hover:text-text-primary transition-colors rounded-xl hover:bg-surface-elevated"
            aria-label={
              allSelected
                ? t('common.deselectAll')
                : t('common.selectAll')
            }
            onClick={() =>
              allSelected ? onDeselectAll() : onSelectAll()
            }
          >
            {allSelected ? (
              <MinusCircle className="size-5" />
            ) : (
              <PlusCircle className="size-5" />
            )}
          </button>
          <button
            className="p-2 text-primary hover:text-primary/80 transition-colors rounded-xl hover:bg-primary/10"
            aria-label={t('habits.logHabit')}
            onClick={onBulkLog}
          >
            <CheckCircle className="size-5" />
          </button>
          <button
            className="p-2 text-amber-400 hover:text-amber-300 transition-colors rounded-xl hover:bg-amber-500/10"
            aria-label={t('habits.skipHabit')}
            onClick={onBulkSkip}
          >
            <Forward className="size-5" />
          </button>
          <button
            className="p-2 text-red-400 hover:text-red-300 transition-colors rounded-xl hover:bg-red-500/10"
            aria-label={t('common.delete')}
            onClick={onBulkDelete}
          >
            <Trash2 className="size-5" />
          </button>
          <div className="w-px h-5 bg-border mx-0.5" />
          <button
            className="p-2 text-text-secondary hover:text-text-primary transition-colors rounded-xl hover:bg-surface-elevated"
            aria-label={t('common.cancel')}
            onClick={onCancel}
          >
            <X className="size-5" />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function TodayPage() {
  const t = useTranslations()
  const locale = useLocale()
  const dateFnsLocale = locale === 'pt-BR' ? ptBR : enUS
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const { profile } = useProfile()
  const { data: streakInfo } = useStreakInfo()
  const { tags } = useTags()

  // Show general on today preference (local storage)
  const [showGeneralOnToday] = useState(() => {
    if (typeof globalThis === 'undefined' || typeof globalThis.localStorage === 'undefined') return true // NOSONAR - SSR guard
    return localStorage.getItem('orbit_show_general_on_today') !== 'false'
  })

  // Bulk mutation hooks
  const bulkDelete = useBulkDeleteHabits()
  const bulkLog = useBulkLogHabits()
  const bulkSkip = useBulkSkipHabits()

  // UI Store
  const selectedDateStr = useUIStore((s) => s.selectedDate)
  const setSelectedDate = useUIStore((s) => s.setSelectedDate)
  const activeView = useUIStore((s) => s.activeView)
  const setActiveView = useUIStore((s) => s.setActiveView)
  const searchQueryStore = useUIStore((s) => s.searchQuery)
  const setSearchQuery = useUIStore((s) => s.setSearchQuery)
  const isSelectMode = useUIStore((s) => s.isSelectMode)
  const selectedHabitIds = useUIStore((s) => s.selectedHabitIds)
  const toggleSelectMode = useUIStore((s) => s.toggleSelectMode)
  const toggleSelectionCascade = useUIStore((s) => s.toggleSelectionCascade)
  const selectAllHabits = useUIStore((s) => s.selectAllHabits)
  const clearSelection = useUIStore((s) => s.clearSelection)

  // Create modal (shared with layout's BottomNav via store)
  const showCreateModal = useUIStore((s) => s.showCreateModal)
  const setShowCreateModal = useUIStore((s) => s.setShowCreateModal)

  // Local state
  const [showCompleted, setShowCompleted] = useState(false)
  const [searchQuery, setLocalSearchQuery] = useState(searchQueryStore)
  const [selectedFrequency, setSelectedFrequency] = useState<'Day' | 'Week' | 'Month' | 'Year' | 'none' | null>(null)
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [showControlsMenu, setShowControlsMenu] = useState(false)
  const [controlsMenuPosition, setControlsMenuPosition] = useState({ top: 0, left: 0 })
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)
  const [showBulkLogConfirm, setShowBulkLogConfirm] = useState(false)
  const [showBulkSkipConfirm, setShowBulkSkipConfirm] = useState(false)
  const [slideDirection, setSlideDirection] = useState<'left' | 'right'>('right')
  const searchDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const controlsMenuRef = useRef<HTMLDivElement>(null)
  const controlsMenuPanelRef = useRef<HTMLDivElement>(null)
  const habitListRef = useRef<HabitListHandle>(null)

  const CONTROLS_MENU_WIDTH_PX = 200
  const CONTROLS_MENU_MARGIN_PX = 8

  // ?date= query parameter handling
  const dateParam = searchParams.get('date')
  const initialDateStr = useMemo(() => {
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) return dateParam
    return null
  }, [dateParam])

  // Initialize selectedDate from URL ?date= param on mount
  useEffect(() => {
    if (initialDateStr) {
      setSelectedDate(initialDateStr)
      setActiveView('today')
    }
  // Only run on mount / when dateParam changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDateStr])

  const selectedDate = useMemo(
    () => new Date(selectedDateStr + 'T00:00:00'),
    [selectedDateStr],
  )

  type FreqKey = 'Day' | 'Week' | 'Month' | 'Year' | 'none'
  const frequencyOptions = useMemo<Array<{ key: FreqKey; label: string }>>(
    () => [
      { key: 'Day', label: t('habits.filter.daily') },
      { key: 'Week', label: t('habits.filter.weekly') },
      { key: 'Month', label: t('habits.filter.monthly') },
      { key: 'Year', label: t('habits.filter.yearly') },
      { key: 'none', label: t('habits.filter.oneTime') },
    ],
    [t],
  )

  // Date navigation
  const goToPreviousDay = useCallback(() => {
    setSlideDirection('left')
    setSelectedDate(formatAPIDate(subDays(selectedDate, 1)))
  }, [selectedDate, setSelectedDate])

  const goToNextDay = useCallback(() => {
    setSlideDirection('right')
    setSelectedDate(formatAPIDate(addDays(selectedDate, 1)))
  }, [selectedDate, setSelectedDate])

  const goToToday = useCallback(() => {
    if (isToday(selectedDate)) {
      setSlideDirection('right')
    } else if (selectedDate > new Date()) {
      setSlideDirection('left')
    } else {
      setSlideDirection('right')
    }
    setSelectedDate(formatAPIDate(new Date()))
    setActiveView('today')
  }, [selectedDate, setSelectedDate, setActiveView])

  // Controls menu
  const toggleControlsMenu = useCallback(() => {
    if (!showControlsMenu) {
      const rect = controlsMenuRef.current?.getBoundingClientRect()
      if (rect) {
        const preferredLeft = rect.right - CONTROLS_MENU_WIDTH_PX
        const maxLeft = globalThis.innerWidth - CONTROLS_MENU_WIDTH_PX - CONTROLS_MENU_MARGIN_PX
        setControlsMenuPosition({
          top: rect.bottom + CONTROLS_MENU_MARGIN_PX,
          left: Math.min(Math.max(preferredLeft, CONTROLS_MENU_MARGIN_PX), Math.max(CONTROLS_MENU_MARGIN_PX, maxLeft)),
        })
      }
    }
    setShowControlsMenu((prev) => !prev)
  }, [showControlsMenu])

  const closeControlsMenu = useCallback(() => {
    setShowControlsMenu(false)
  }, [])

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!showControlsMenu) return
      const target = event.target
      if (!(target instanceof Node)) return
      if (controlsMenuRef.current?.contains(target)) return
      if (controlsMenuPanelRef.current?.contains(target)) return
      setShowControlsMenu(false)
    }
    function handleKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') setShowControlsMenu(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeydown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeydown)
    }
  }, [showControlsMenu])

  const dateLabel = useMemo(() => {
    if (isToday(selectedDate)) return t('dates.today')
    if (isYesterday(selectedDate)) return t('dates.yesterday')
    if (isTomorrow(selectedDate)) return t('dates.tomorrow')
    return format(
      selectedDate,
      locale === 'pt-BR' ? 'dd MMM yyyy' : 'MMM dd, yyyy',
      { locale: dateFnsLocale },
    )
  }, [selectedDate, t, locale, dateFnsLocale])

  // Search debounce
  useEffect(() => {
    if (searchDebounceTimer.current)
      clearTimeout(searchDebounceTimer.current)
    searchDebounceTimer.current = setTimeout(() => {
      setSearchQuery(searchQuery)
    }, 300)
    return () => {
      if (searchDebounceTimer.current)
        clearTimeout(searchDebounceTimer.current)
    }
  }, [searchQuery, setSearchQuery])

  // Build filters
  const filters = useMemo<HabitsFilter>(() => {
    if (activeView === 'general') {
      const f: HabitsFilter = { isGeneral: true }
      if (searchQueryStore.trim()) f.search = searchQueryStore.trim()
      if (selectedTagIds.length > 0) f.tagIds = selectedTagIds
      return f
    }

    const dateStr = formatAPIDate(selectedDate)

    if (activeView === 'today') {
      const f: HabitsFilter = {
        dateFrom: dateStr,
        dateTo: dateStr,
        includeOverdue: isToday(selectedDate),
        includeGeneral: showGeneralOnToday || undefined,
      }
      if (searchQueryStore.trim()) f.search = searchQueryStore.trim()
      if (selectedFrequency) f.frequencyUnit = selectedFrequency
      if (selectedTagIds.length > 0) f.tagIds = selectedTagIds
      return f
    }

    // 'all' view
    const f: HabitsFilter = {}
    if (searchQueryStore.trim()) f.search = searchQueryStore.trim()
    if (selectedFrequency) f.frequencyUnit = selectedFrequency
    if (selectedTagIds.length > 0) f.tagIds = selectedTagIds
    return f
  }, [activeView, selectedDate, searchQueryStore, selectedFrequency, selectedTagIds, showGeneralOnToday])

  // Query habits for selection cascade helpers and count
  const habitsQuery = useHabits(filters)
  const habitsById = habitsQuery.data?.habitsById ?? new Map()
  const childrenByParent = habitsQuery.data?.childrenByParent ?? new Map()
  const topLevelHabits = habitsQuery.data?.topLevelHabits ?? []
  const habitsCount = habitsById.size
  const hasFetched = habitsQuery.dataUpdatedAt > 0
  const isRefetching = habitsQuery.isFetching && hasFetched

  // General habits (shown in dedicated section on Today view)
  const generalHabits = useMemo(
    () => topLevelHabits.filter((h) => h.isGeneral),
    [topLevelHabits],
  )

  // Selection cascade helpers (matches Nuxt getDescendantIds / isAncestorSelected)
  const getDescendantIds = useCallback(
    (parentId: string): string[] => {
      const childIds = childrenByParent.get(parentId) ?? []
      const loaded = habitListRef.current?.allLoadedIds
      const ids: string[] = []
      for (const cid of childIds) {
        if (loaded && !loaded.has(cid)) continue
        ids.push(cid, ...getDescendantIds(cid))
      }
      return ids
    },
    [childrenByParent],
  )

  const isAncestorSelected = useCallback(
    (habitId: string): boolean => {
      const habit = habitsById.get(habitId)
      if (!habit?.parentId) return false
      if (selectedHabitIds.has(habit.parentId)) return true
      return isAncestorSelected(habit.parentId)
    },
    [habitsById, selectedHabitIds],
  )

  const handleToggleSelection = useCallback(
    (habitId: string) => {
      toggleSelectionCascade(habitId, getDescendantIds, isAncestorSelected)
    },
    [toggleSelectionCascade, getDescendantIds, isAncestorSelected],
  )

  // Tab keyboard navigation
  const handleTabKeydown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      const idx = TAB_VIEWS.indexOf(activeView)
      if (idx === -1) return
      e.preventDefault()
      const nextIdx =
        e.key === 'ArrowRight'
          ? (idx + 1) % TAB_VIEWS.length
          : (idx - 1 + TAB_VIEWS.length) % TAB_VIEWS.length
      const nextView = TAB_VIEWS[nextIdx]
      if (nextView) {
        setActiveView(nextView)
        // Focus the newly selected tab button (a11y: focus follows selection)
        requestAnimationFrame(() => {
          document.getElementById(`tab-${nextView}`)?.focus()
        })
      }
    },
    [activeView, setActiveView],
  )

  // Clear select mode when view changes
  useEffect(() => {
    if (isSelectMode) clearSelection()
    setSelectedFrequency(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView])

  // Tag filter toggle
  const toggleTagFilter = useCallback((tagId: string) => {
    setSelectedTagIds((prev) => {
      const idx = prev.indexOf(tagId)
      if (idx >= 0) return prev.filter((id) => id !== tagId)
      return [...prev, tagId]
    })
  }, [])

  // Select all / deselect all
  const allSelected = habitsCount > 0 && selectedHabitIds.size === habitsCount
  const selectAll = useCallback(() => {
    const loaded = habitListRef.current?.allLoadedIds
    const allIds = loaded ? Array.from(loaded) : Array.from(habitsById.keys())
    selectAllHabits(allIds)
  }, [habitsById, selectAllHabits])
  const deselectAll = useCallback(() => {
    clearSelection()
  }, [clearSelection])

  // Bulk actions
  const confirmBulkDelete = useCallback(async () => {
    const ids = Array.from(selectedHabitIds)
    if (ids.length === 0) return
    try {
      await bulkDelete.mutateAsync(ids)
    } catch {
      // Error handled in hook
    } finally {
      clearSelection()
      setShowBulkDeleteConfirm(false)
    }
  }, [selectedHabitIds, bulkDelete, clearSelection])

  const confirmBulkLog = useCallback(async () => {
    const ids = Array.from(selectedHabitIds)
    if (ids.length === 0) return
    try {
      const result = await bulkLog.mutateAsync(ids.map((id) => ({ habitId: id })))
      const successIds = result.results
        .filter((r) => r.status === 'Success')
        .map((r) => r.habitId)
      for (const id of successIds) {
        habitListRef.current?.markRecentlyCompleted(id)
      }
      for (const id of successIds) {
        habitListRef.current?.checkAndPromptParentLog(id)
      }
    } catch {
      // Error handled in hook
    } finally {
      clearSelection()
      setShowBulkLogConfirm(false)
    }
  }, [selectedHabitIds, bulkLog, clearSelection])

  const confirmBulkSkip = useCallback(async () => {
    const ids = Array.from(selectedHabitIds)
    if (ids.length === 0) return
    try {
      const result = await bulkSkip.mutateAsync(ids.map((id) => ({ habitId: id })))
      const successIds = result.results
        .filter((r) => r.status === 'Success')
        .map((r) => r.habitId)
      for (const id of successIds) {
        habitListRef.current?.markRecentlyCompleted(id)
      }
      for (const id of successIds) {
        habitListRef.current?.checkAndPromptParentLog(id)
      }
    } catch {
      // Error handled in hook
    } finally {
      clearSelection()
      setShowBulkSkipConfirm(false)
    }
  }, [selectedHabitIds, bulkSkip, clearSelection])

  return (
    <div className="relative">
      {/* Header: Orbit logo + streak badge + bell */}
      <header className="flex items-center justify-between pt-8 pb-2">
        <button
          className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={goToToday}
        >
          <img
            src="/logo-no-bg.png"
            alt="Orbit"
            className="size-10"
            width={40}
            height={40}
          />
          <span className="text-[length:var(--text-fluid-xl)] font-extrabold text-text-primary tracking-tight">
            Orbit
          </span>
        </button>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <StreakBadge streak={streakInfo?.currentStreak ?? 0} />
          <NotificationBell />
        </div>
      </header>

      {/* Tabs: Today / All / General / Goals */}
      <div className="pt-4">
        <div
          role="tablist"
          tabIndex={0}
          aria-label={t('habits.viewsLabel')}
          className="flex bg-surface-ground rounded-[var(--radius-lg)] p-1 gap-1"
          onKeyDown={handleTabKeydown}
        >
          {TAB_VIEWS.map((view) => (
            <button
              key={view}
              id={`tab-${view}`}
              role="tab"
              aria-selected={activeView === view}
              aria-controls={
                view === 'goals' ? 'tabpanel-goals' : 'tabpanel-habits'
              }
              className={`flex-1 text-center py-2 text-sm font-bold transition-all duration-200 rounded-[var(--radius-md)] ${
                activeView === view
                  ? 'text-primary bg-surface shadow-[var(--shadow-sm)]'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
              onClick={() => setActiveView(view)}
            >
              {getTabLabel(view, t)}
            </button>
          ))}
        </div>
      </div>

      {/* Goals view */}
      <div
        id="tabpanel-goals"
        role="tabpanel"
        aria-labelledby="tab-goals"
      >
        {activeView === 'goals' && <GoalsView />}
      </div>

      {/* Date navigation (today view only) */}
      {activeView === 'today' && (
        <div className="pt-4 pb-4">
          <div className="flex items-center justify-center gap-4">
            <button
              aria-label={t('dates.previousDay')}
              className="size-9 rounded-full bg-surface flex items-center justify-center hover:bg-surface-elevated transition-all duration-150 active:scale-95"
              onClick={goToPreviousDay}
            >
              <ChevronLeft className="size-5 text-text-secondary" />
            </button>
            <button
              key={selectedDateStr}
              aria-label={isToday(selectedDate) ? dateLabel : t('dates.goToToday')}
              className={`min-w-40 text-center text-[length:var(--text-fluid-base)] font-semibold text-text-primary hover:text-primary transition-colors animate-slide-date-${slideDirection} ${
                isToday(selectedDate) ? 'text-primary' : ''
              }`}
              onClick={goToToday}
            >
              {dateLabel}
            </button>
            <button
              aria-label={t('dates.nextDay')}
              className="size-9 rounded-full bg-surface flex items-center justify-center hover:bg-surface-elevated transition-all duration-150 active:scale-95"
              onClick={goToNextDay}
            >
              <ChevronRight className="size-5 text-text-secondary" />
            </button>
          </div>
        </div>
      )}

      {/* AI Summary card (Today view only, when summary is enabled) */}
      {activeView === 'today' &&
        isToday(selectedDate) &&
        profile?.hasProAccess &&
        profile?.aiSummaryEnabled && (
          <div className="pb-2">
            <HabitSummaryCard date={formatAPIDate(selectedDate)} />
          </div>
        )}

      {/* Habits content (hidden on goals tab) */}
      {activeView !== 'goals' && (
        <div
          id="tabpanel-habits"
          role="tabpanel"
          aria-labelledby={`tab-${activeView}`}
        >
          {/* Search bar */}
          <div className="pt-3 pb-2">
            <div className="relative">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 size-5 text-text-muted pointer-events-none" />
              <input
                value={searchQuery}
                type="text"
                aria-label={t('habits.searchPlaceholder')}
                placeholder={t('habits.searchPlaceholder')}
                className="w-full bg-surface text-text-primary placeholder-text-muted rounded-full py-3 pl-12 pr-12 text-sm border border-border focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                onChange={(e) => setLocalSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  aria-label={t('common.clear')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-text-secondary hover:text-text-primary transition-colors"
                  onClick={() => setLocalSearchQuery('')}
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          {/* Filter chips + controls row */}
          <div className="pb-2 flex items-center gap-2">
            {activeView !== 'general' || tags.length > 0 ? (
            <div className="flex-1 overflow-x-auto thin-scrollbar [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)]">
              <div className="flex gap-2 min-w-max">
                {/* Frequency chips (hidden in general view) */}
                {activeView !== 'general' && (
                  <>
                    <button
                      aria-pressed={!selectedFrequency}
                      className={`px-4 py-2 rounded-full text-xs font-semibold transition-all flex items-center gap-2 ${
                        selectedFrequency
                          ? 'bg-surface border border-border text-text-faded hover:text-text-primary'
                          : 'bg-primary text-white'
                      }`}
                      onClick={() => setSelectedFrequency(null)}
                    >
                      {t('common.all')}
                    </button>
                    {frequencyOptions.map((opt) => (
                      <button
                        key={opt.key}
                        aria-pressed={selectedFrequency === opt.key}
                        className={`px-4 py-2 rounded-full text-xs font-semibold transition-all flex items-center gap-2 ${
                          selectedFrequency === opt.key
                            ? 'bg-primary text-white'
                            : 'bg-surface border border-border text-text-faded hover:text-text-primary'
                        }`}
                        onClick={() =>
                          setSelectedFrequency(
                            selectedFrequency === opt.key ? null : opt.key,
                          )
                        }
                      >
                        {opt.label}
                      </button>
                    ))}
                  </>
                )}
                {/* Tag chips */}
                {tags.length > 0 && (
                  <>
                    {activeView !== 'general' && (
                      <span className="w-px h-6 bg-border self-center" />
                    )}
                    {tags.map((tag) => (
                      <button
                        key={tag.id}
                        className={`px-4 py-2 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 ${
                          selectedTagIds.includes(tag.id)
                            ? 'text-white'
                            : 'bg-surface border border-border text-text-faded hover:text-text-primary'
                        }`}
                        style={selectedTagIds.includes(tag.id) ? { backgroundColor: tag.color } : undefined}
                        onClick={() => toggleTagFilter(tag.id)}
                      >
                        {!selectedTagIds.includes(tag.id) && (
                          <span
                            className="size-2 rounded-full"
                            style={{ backgroundColor: tag.color }}
                          />
                        )}
                        {tag.name}
                      </button>
                    ))}
                  </>
                )}
              </div>
            </div>
            ) : (
              <div className="flex-1" />
            )}
            <div ref={controlsMenuRef} className="shrink-0">
              <button
                className="p-2 text-text-secondary hover:text-text-primary transition-colors rounded-xl hover:bg-surface"
                title={t('habits.actions.more')}
                aria-label={t('habits.actions.more')}
                onClick={(e) => {
                  e.stopPropagation()
                  toggleControlsMenu()
                }}
              >
                <MoreVertical className="size-5" />
              </button>
            </div>
          </div>

          {/* Controls dropdown menu (portal) */}
          {showControlsMenu && typeof document !== 'undefined' && (
            <ControlsMenu
              menuPanelRef={controlsMenuPanelRef}
              position={controlsMenuPosition}
              isSelectMode={isSelectMode}
              showCompleted={showCompleted}
              isFetching={habitsQuery.isFetching}
              allCollapsed={!!habitListRef.current?.allCollapsed}
              onToggleSelect={toggleSelectMode}
              onToggleCollapse={() => {
                if (habitListRef.current?.allCollapsed) {
                  habitListRef.current.expandAll()
                } else {
                  habitListRef.current?.collapseAll()
                }
              }}
              onRefresh={() => queryClient.invalidateQueries({ queryKey: habitKeys.lists() })}
              onToggleCompleted={() => setShowCompleted(!showCompleted)}
              onClose={closeControlsMenu}
            />
          )}

          {/* Loading skeleton (before first fetch) */}
          {!hasFetched && (
            <div className="space-y-3 pt-2">
              {SKELETON_KEYS.map((key) => (
                <div
                  key={key}
                  className="bg-surface rounded-[var(--radius-xl)] p-4 flex items-center gap-4"
                >
                  <div className="size-10 rounded-full bg-surface-elevated animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-5 w-3/4 bg-surface-elevated rounded animate-pulse" />
                    <div className="h-3 w-1/2 bg-surface-elevated rounded animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Refetch loading bar */}
          {isRefetching && (
            <div className="loading-bar w-full" />
          )}

          {/* Habit list */}
          {hasFetched && (
          <div
            className={`overflow-x-hidden overflow-y-visible pt-2 transition-opacity duration-200 ${
              isSelectMode ? 'pb-20' : ''
            } ${isRefetching ? 'opacity-40 pointer-events-none' : ''}`}
          >
            <HabitList
              ref={habitListRef}
              view={
                activeView === 'today' ||
                activeView === 'all' ||
                activeView === 'general'
                  ? activeView
                  : 'today'
              }
              selectedDate={selectedDate}
              showCompleted={showCompleted}
              isSelectMode={isSelectMode}
              selectedHabitIds={selectedHabitIds}
              searchQuery={searchQueryStore}
              filters={filters}
              generalHabits={generalHabits}
              onToggleSelection={handleToggleSelection}
              onEnterSelectMode={(habitId) => {
                if (!isSelectMode) toggleSelectMode()
                handleToggleSelection(habitId)
              }}
              onCreate={() => setShowCreateModal(true)}
              onSeeUpcoming={goToNextDay}
            />
          </div>
          )}
        </div>
      )}

      {/* Floating bulk action bar */}
      {isSelectMode && typeof document !== 'undefined' && (
        <BulkActionBar
          selectedCount={selectedHabitIds.size}
          allSelected={allSelected}
          onSelectAll={selectAll}
          onDeselectAll={deselectAll}
          onBulkLog={() => setShowBulkLogConfirm(true)}
          onBulkSkip={() => setShowBulkSkipConfirm(true)}
          onBulkDelete={() => setShowBulkDeleteConfirm(true)}
          onCancel={toggleSelectMode}
        />
      )}

      {/* Bulk delete confirmation */}
      <ConfirmDialog
        open={showBulkDeleteConfirm}
        onOpenChange={setShowBulkDeleteConfirm}
        title={t('habits.bulkDeleteTitle')}
        description={plural(t('habits.bulkDeleteMessage', { count: selectedHabitIds.size }), selectedHabitIds.size)}
        confirmLabel={t('habits.bulkDeleteConfirm')}
        cancelLabel={t('common.cancel')}
        variant="danger"
        onConfirm={confirmBulkDelete}
        onCancel={() => setShowBulkDeleteConfirm(false)}
      />

      {/* Bulk log confirmation */}
      <ConfirmDialog
        open={showBulkLogConfirm}
        onOpenChange={setShowBulkLogConfirm}
        title={t('habits.bulkLogTitle')}
        description={plural(t('habits.bulkLogMessage', { count: selectedHabitIds.size }), selectedHabitIds.size)}
        confirmLabel={t('habits.bulkLogConfirm')}
        cancelLabel={t('common.cancel')}
        variant="warning"
        onConfirm={confirmBulkLog}
        onCancel={() => setShowBulkLogConfirm(false)}
      />

      {/* Bulk skip confirmation */}
      <ConfirmDialog
        open={showBulkSkipConfirm}
        onOpenChange={setShowBulkSkipConfirm}
        title={t('habits.bulkSkipTitle')}
        description={plural(t('habits.bulkSkipMessage', { count: selectedHabitIds.size }), selectedHabitIds.size)}
        confirmLabel={t('habits.bulkSkipConfirm')}
        cancelLabel={t('common.cancel')}
        variant="warning"
        onConfirm={confirmBulkSkip}
        onCancel={() => setShowBulkSkipConfirm(false)}
      />

      {/* Create habit modal (triggered from HabitList empty state) */}
      {showCreateModal && (
        <CreateHabitModal
          open={showCreateModal}
          onOpenChange={setShowCreateModal}
          initialDate={
            activeView === 'today' ? formatAPIDate(selectedDate) : null
          }
        />
      )}
    </div>
  )
}

'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import {
  addDays,
  subDays,
  isToday,
  isYesterday,
  isTomorrow,
} from 'date-fns'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'
import { resolveMotionPreset } from '@orbit/shared/theme'
import { useDeviceLocale } from '@/hooks/use-device-locale'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter, useSearchParams } from 'next/navigation'
import { habitKeys } from '@orbit/shared/query'
import {
  collectSelectableDescendantIds,
  formatAPIDate,
  formatLocaleDate,
  parseShowGeneralOnTodayPreference,
} from '@orbit/shared/utils'
import { plural } from '@/lib/plural'
import { HabitList, type HabitListHandle } from '@/components/habits/habit-list'
import { HabitSummaryCard } from '@/components/habits/habit-summary-card'
import { CreateHabitModal } from '@/components/habits/create-habit-modal'
import { CreateGoalModal } from '@/components/goals/create-goal-modal'
import { GoalsView } from '@/components/goals/goals-view'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ControlsMenu } from '@/components/habits/controls-menu'
import { BulkActionBar } from '@/components/habits/bulk-action-bar'
import { TodayFilters } from '@/components/habits/today-filters'
import { useUIStore } from '@/stores/ui-store'
import { useProfile } from '@/hooks/use-profile'
import { useStreakInfo } from '@/hooks/use-gamification'
import {
  EMPTY_CHILDREN_BY_PARENT,
  EMPTY_HABITS_BY_ID,
  useHabits,
} from '@/hooks/use-habits'
import { useTags } from '@/hooks/use-tags'
import { useBulkActions } from '@/hooks/use-bulk-actions'
import {
  TodayHeader,
  TodayTabs,
  TodayDateNavigation,
  type TodayTabItem,
} from './today-shell'
import type { HabitsFilter } from '@orbit/shared/types/habit'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TAB_VIEWS = ['today', 'all', 'general', 'goals'] as const
const SKELETON_KEYS = ['sk-1', 'sk-2', 'sk-3', 'sk-4', 'sk-5'] as const

function getMillisecondsUntilNextLocalMidnight(): number {
  const now = new Date()
  const nextMidnight = new Date(now)
  nextMidnight.setHours(24, 0, 0, 0)
  return Math.max(nextMidnight.getTime() - now.getTime(), 1_000)
}

function getTodayTabLabel(
  view: typeof TAB_VIEWS[number],
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
// Page Component
// ---------------------------------------------------------------------------

export default function TodayPage() {
  const t = useTranslations()
  const locale = useDeviceLocale()
  const prefersReducedMotion = useReducedMotion()
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const { profile } = useProfile()
  const { data: streakInfo } = useStreakInfo()
  const { tags } = useTags()
  const listMotionPreset = resolveMotionPreset('list-enter', Boolean(prefersReducedMotion))
  const listTransition = {
    duration: listMotionPreset.enterDuration / 1000,
    ease: listMotionPreset.enterEasing,
  } as const

  // Show general on today preference (local storage, read-only)
  const showGeneralOnToday = useMemo(() => {
    if (typeof globalThis === 'undefined' || typeof globalThis.localStorage === 'undefined') return false // NOSONAR - SSR guard
    return parseShowGeneralOnTodayPreference(localStorage.getItem('orbit_show_general_on_today'))
  }, [])

  // UI Store
  const selectedDateStr = useUIStore((s) => s.selectedDate)
  const setSelectedDate = useUIStore((s) => s.setSelectedDate)
  const goToTodayDate = useUIStore((s) => s.goToToday)
  const syncSelectedDateWithToday = useUIStore((s) => s.syncSelectedDateWithToday)
  const activeView = useUIStore((s) => s.activeView)
  const setActiveView = useUIStore((s) => s.setActiveView)
  const searchQueryStore = useUIStore((s) => s.searchQuery)
  const setSearchQuery = useUIStore((s) => s.setSearchQuery)
  const selectedFrequency = useUIStore((s) => s.selectedFrequency)
  const setSelectedFrequency = useUIStore((s) => s.setSelectedFrequency)
  const selectedTagIds = useUIStore((s) => s.selectedTagIds)
  const setSelectedTagIds = useUIStore((s) => s.setSelectedTagIds)
  const showCompleted = useUIStore((s) => s.showCompleted)
  const setShowCompleted = useUIStore((s) => s.setShowCompleted)
  const isSelectMode = useUIStore((s) => s.isSelectMode)
  const selectedHabitIds = useUIStore((s) => s.selectedHabitIds)
  const toggleSelectMode = useUIStore((s) => s.toggleSelectMode)
  const toggleSelectionCascade = useUIStore((s) => s.toggleSelectionCascade)
  const selectAllHabits = useUIStore((s) => s.selectAllHabits)
  const clearSelection = useUIStore((s) => s.clearSelection)
  const hasProAccess = profile?.hasProAccess ?? false
  const currentActiveView = !hasProAccess && activeView === 'goals' ? 'today' : activeView

  // Create modals (shared with layout's BottomNav via store)
  const showCreateModal = useUIStore((s) => s.showCreateModal)
  const setShowCreateModal = useUIStore((s) => s.setShowCreateModal)
  const showCreateGoalModal = useUIStore((s) => s.showCreateGoalModal)
  const setShowCreateGoalModal = useUIStore((s) => s.setShowCreateGoalModal)

  // Local state
  const [localSearchQuery, setLocalSearchQuery] = useState(searchQueryStore)
  const [showControlsMenu, setShowControlsMenu] = useState(false)
  const [controlsMenuPosition, setControlsMenuPosition] = useState({ top: 0, left: 0 })
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
    goToTodayDate()
    setActiveView('today')
  }, [goToTodayDate, selectedDate, setActiveView])

  useEffect(() => {
    let rolloverTimer: ReturnType<typeof globalThis.setTimeout> | null = null

    const resetRolloverTimer = () => {
      if (rolloverTimer) {
        globalThis.clearTimeout(rolloverTimer)
      }

      rolloverTimer = globalThis.setTimeout(() => {
        syncSelectedDateWithToday()
        resetRolloverTimer()
      }, getMillisecondsUntilNextLocalMidnight())
    }

    const handleVisible = () => {
      if (document.visibilityState !== 'visible') return
      syncSelectedDateWithToday()
      resetRolloverTimer()
    }

    const handleFocus = () => {
      syncSelectedDateWithToday()
      resetRolloverTimer()
    }

    syncSelectedDateWithToday()
    resetRolloverTimer()
    document.addEventListener('visibilitychange', handleVisible)
    globalThis.addEventListener('focus', handleFocus)

    return () => {
      if (rolloverTimer) {
        globalThis.clearTimeout(rolloverTimer)
      }
      document.removeEventListener('visibilitychange', handleVisible)
      globalThis.removeEventListener('focus', handleFocus)
    }
  }, [syncSelectedDateWithToday])

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
    return formatLocaleDate(selectedDate, locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }, [selectedDate, t, locale])

  const tabItems = useMemo<TodayTabItem[]>(
    () =>
      TAB_VIEWS.map((view) => ({
        view,
        label: getTodayTabLabel(view, t),
      })),
    [t],
  )

  const attemptViewChange = useCallback(
    (nextView: typeof TAB_VIEWS[number]) => {
      if (nextView === 'goals' && !hasProAccess) {
        router.push('/upgrade')
        return false
      }

      setActiveView(nextView)
      return true
    },
    [hasProAccess, router, setActiveView],
  )

  // Search debounce
  useEffect(() => {
    if (searchDebounceTimer.current)
      clearTimeout(searchDebounceTimer.current)
    searchDebounceTimer.current = setTimeout(() => {
      setSearchQuery(localSearchQuery)
    }, 300)
    return () => {
      if (searchDebounceTimer.current)
        clearTimeout(searchDebounceTimer.current)
    }
  }, [localSearchQuery, setSearchQuery])

  useEffect(() => {
    setLocalSearchQuery(searchQueryStore)
  }, [searchQueryStore])

  // Build filters
  const filters = useMemo<HabitsFilter>(() => {
    if (currentActiveView === 'general') {
      const f: HabitsFilter = { isGeneral: true }
      if (searchQueryStore.trim()) f.search = searchQueryStore.trim()
      if (selectedTagIds.length > 0) f.tagIds = selectedTagIds
      return f
    }

    const dateStr = formatAPIDate(selectedDate)

    if (currentActiveView === 'today') {
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
  }, [currentActiveView, selectedDate, searchQueryStore, selectedFrequency, selectedTagIds, showGeneralOnToday])

  // Query habits for selection cascade helpers and count
  const habitsQuery = useHabits(filters)
  const habitsById = habitsQuery.data?.habitsById ?? EMPTY_HABITS_BY_ID
  const childrenByParent = habitsQuery.data?.childrenByParent ?? EMPTY_CHILDREN_BY_PARENT
  const habitsCount = habitsById.size
  const hasFetched = habitsQuery.dataUpdatedAt > 0
  const isRefetching = habitsQuery.isFetching && hasFetched

  // Selection cascade helpers (matches Nuxt getDescendantIds / isAncestorSelected)
  const getDescendantIds = useCallback(
    (parentId: string): string[] => {
      return collectSelectableDescendantIds(
        parentId,
        (habitId) => childrenByParent.get(habitId) ?? [],
        habitListRef.current?.allLoadedIds,
      )
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
      const idx = TAB_VIEWS.indexOf(currentActiveView)
      if (idx === -1) return
      e.preventDefault()
      const nextIdx =
        e.key === 'ArrowRight'
          ? (idx + 1) % TAB_VIEWS.length
          : (idx - 1 + TAB_VIEWS.length) % TAB_VIEWS.length
      const nextView = TAB_VIEWS[nextIdx]
      if (nextView && attemptViewChange(nextView)) {
        // Focus the newly selected tab button (a11y: focus follows selection)
        requestAnimationFrame(() => {
          document.getElementById(`tab-${nextView}`)?.focus()
        })
      }
    },
    [attemptViewChange, currentActiveView],
  )

  useEffect(() => {
    if (!hasProAccess && activeView === 'goals') {
      setActiveView('today')
    }
  }, [activeView, hasProAccess, setActiveView])

  // Clear select mode when view changes
  useEffect(() => {
    if (isSelectMode) clearSelection()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView])

  // Tag filter toggle
  const toggleTagFilter = useCallback((tagId: string) => {
    const idx = selectedTagIds.indexOf(tagId)
    if (idx >= 0) {
      setSelectedTagIds(selectedTagIds.filter((id) => id !== tagId))
      return
    }

    setSelectedTagIds([...selectedTagIds, tagId])
  }, [selectedTagIds, setSelectedTagIds])

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
  const {
    showBulkDeleteConfirm,
    showBulkLogConfirm,
    showBulkSkipConfirm,
    setShowBulkDeleteConfirm,
    setShowBulkLogConfirm,
    setShowBulkSkipConfirm,
    confirmBulkDelete,
    confirmBulkLog,
    confirmBulkSkip,
  } = useBulkActions({
    selectedHabitIds,
    habitsById,
    habitListRef,
    onSuccess: clearSelection,
  })

  return (
    <div className="relative">
      <TodayHeader
        onGoToToday={goToToday}
        streak={streakInfo?.currentStreak ?? 0}
        goToTodayLabel={t('dates.goToToday')}
      />

      <TodayTabs
        tabs={tabItems}
        activeView={currentActiveView}
        onChangeView={attemptViewChange}
        viewsLabel={t('habits.viewsLabel')}
        onKeyDown={handleTabKeydown}
      />

      {/* Goals view */}
      <div
        id="tabpanel-goals"
        role="tabpanel"
        aria-labelledby="tab-goals"
      >
        {currentActiveView === 'goals' && <GoalsView />}
      </div>

      <TodayDateNavigation
        visible={currentActiveView === 'today'}
        dateLabel={dateLabel}
        isTodaySelected={isToday(selectedDate)}
        slideDirection={slideDirection}
        onGoToPreviousDay={goToPreviousDay}
        onGoToToday={goToToday}
        onGoToNextDay={goToNextDay}
        previousLabel={t('dates.previousDay')}
        todayLabel={t('dates.goToToday')}
        nextLabel={t('dates.nextDay')}
      />

      {/* AI Summary card (Today view only, when summary is enabled) */}
      {currentActiveView === 'today' &&
        isToday(selectedDate) &&
        profile?.hasProAccess &&
        profile?.aiSummaryEnabled && (
          <div className="pb-2">
            <HabitSummaryCard date={formatAPIDate(selectedDate)} />
          </div>
        )}

      {/* Habits content (hidden on goals tab) */}
      {currentActiveView !== 'goals' && (
        <div
          id="tabpanel-habits"
          role="tabpanel"
          aria-labelledby={`tab-${currentActiveView}`}
        >
          <motion.div layout transition={listTransition}>
            <TodayFilters
              activeView={currentActiveView}
              localSearchQuery={localSearchQuery}
              selectedFrequency={selectedFrequency}
              selectedTagIds={selectedTagIds}
              tags={tags}
              frequencyOptions={frequencyOptions}
              controlsMenuRef={controlsMenuRef}
              onSearchChange={setLocalSearchQuery}
              onSearchClear={() => setLocalSearchQuery('')}
              onFrequencyChange={setSelectedFrequency}
              onTagToggle={toggleTagFilter}
              onOpenControlsMenu={toggleControlsMenu}
            />
          </motion.div>

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
          <AnimatePresence initial={false}>
            {isRefetching ? (
              <motion.div
                key="today-refetch-indicator"
                className="overflow-hidden pt-1"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 8 }}
                exit={{ opacity: 0, height: 0 }}
                transition={listTransition}
              >
                <motion.div
                  data-testid="today-refetch-indicator"
                  className="loading-bar h-1 w-full rounded-full origin-center"
                  initial={{ opacity: 0.7, scaleX: 0.92 }}
                  animate={{ opacity: 1, scaleX: 1 }}
                  exit={{ opacity: 0, scaleX: 0.96 }}
                  transition={listTransition}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* Habit list */}
          {hasFetched && (
            <motion.div
              layout
              data-testid="today-list-shell"
              className={`overflow-x-hidden overflow-y-visible pt-2 ${
                isSelectMode ? 'pb-20' : ''
              }`}
              animate={{
                opacity: isRefetching ? 0.78 : 1,
                y: isRefetching ? Math.round(listMotionPreset.shift / 2) : 0,
                scale: isRefetching ? 0.995 : 1,
              }}
              transition={listTransition}
            >
              <HabitList
                ref={habitListRef}
                view={
                  currentActiveView === 'today' ||
                  currentActiveView === 'all' ||
                  currentActiveView === 'general'
                    ? currentActiveView
                    : 'today'
                }
                selectedDate={selectedDate}
                showCompleted={showCompleted}
                isSelectMode={isSelectMode}
                selectedHabitIds={selectedHabitIds}
                searchQuery={searchQueryStore}
                filters={filters}
                onToggleSelection={handleToggleSelection}
                onEnterSelectMode={(habitId) => {
                  if (!isSelectMode) toggleSelectMode()
                  handleToggleSelection(habitId)
                }}
                onCreate={() => setShowCreateModal(true)}
                onSeeUpcoming={goToNextDay}
              />
            </motion.div>
          )}
        </div>
      )}

      {/* Floating bulk action bar */}
      <AnimatePresence initial={false}>
        {isSelectMode && typeof document !== 'undefined' ? (
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
        ) : null}
      </AnimatePresence>

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
            currentActiveView === 'today' ? formatAPIDate(selectedDate) : null
          }
        />
      )}

      {/* Create goal modal (triggered from FAB on goals tab) */}
      {showCreateGoalModal && (
        <CreateGoalModal
          open={showCreateGoalModal}
          onOpenChange={setShowCreateGoalModal}
        />
      )}
    </div>
  )
}

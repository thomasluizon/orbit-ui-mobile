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
import { useTranslations, useLocale } from 'next-intl'
import { resolveMotionPreset } from '@orbit/shared/theme'
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
import { TodayAISummary } from '@/components/habits/today-ai-summary'
import { GoalsView } from '@/components/goals/goals-view'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ControlsMenu } from '@/components/habits/controls-menu'
import { BulkActionBarV2 } from '@/components/habits/bulk-action-bar-v2'
import { SectionLabel } from '@/components/ui/section-label'
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
  TodayUtilityRow,
  type TodayTabItem,
} from './today-shell'
import type { HabitsFilter } from '@orbit/shared/types/habit'

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

export default function TodayPage() {
  const t = useTranslations()
  const locale = useLocale()
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

  const showGeneralOnToday = useMemo(() => {
    if (typeof globalThis === 'undefined' || typeof globalThis.localStorage === 'undefined') return false // NOSONAR - SSR guard
    return parseShowGeneralOnTodayPreference(localStorage.getItem('orbit_show_general_on_today'))
  }, [])

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

  const setShowCreateModal = useUIStore((s) => s.setShowCreateModal)

  const [localSearchQuery, setLocalSearchQuery] = useState(searchQueryStore)
  const [searchOpen, setSearchOpen] = useState(false)
  const [showControlsMenu, setShowControlsMenu] = useState(false)
  const [controlsMenuPosition, setControlsMenuPosition] = useState({ top: 0, left: 0 })
  const [slideDirection, setSlideDirection] = useState<'left' | 'right'>('right')
  const searchDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const controlsMenuRef = useRef<HTMLDivElement>(null)
  const controlsMenuPanelRef = useRef<HTMLDivElement>(null)
  const habitListRef = useRef<HabitListHandle>(null)
  // Mirrored from HabitList via onAllCollapsedChange so we can read it during
  // render (refs cannot be read during render under react-hooks/refs).
  const [habitListAllCollapsed, setHabitListAllCollapsed] = useState(false)

  const CONTROLS_MENU_WIDTH_PX = 220
  const CONTROLS_MENU_MARGIN_PX = 8

  const dateParam = searchParams.get('date')
  const initialDateStr = useMemo(() => {
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) return dateParam
    return null
  }, [dateParam])

  const [previousInitialDateStr, setPreviousInitialDateStr] = useState<string | null>(null)
  if (initialDateStr !== previousInitialDateStr) {
    setPreviousInitialDateStr(initialDateStr)
    if (initialDateStr) {
      setSelectedDate(initialDateStr)
      setActiveView('today')
    }
  }

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

  const headerSubtitle = useMemo(() => {
    if (currentActiveView === 'all') return t('habits.viewAll')
    if (currentActiveView === 'general') return t('habits.viewGeneral')
    if (currentActiveView === 'goals') return t('goals.tab')
    return formatLocaleDate(selectedDate, locale, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
  }, [currentActiveView, selectedDate, locale, t])

  const headerTitle = useMemo(() => {
    if (currentActiveView === 'all') return t('habits.viewAll')
    if (currentActiveView === 'general') return t('habits.viewGeneral')
    if (currentActiveView === 'goals') return t('goals.tab')
    return t('habits.today')
  }, [currentActiveView, t])

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

  // Mirror the store search query into local input state when it changes
  // externally (e.g., cleared from another component). "Adjusting state when
  // a prop changes" pattern.
  const [previousStoreSearch, setPreviousStoreSearch] = useState(searchQueryStore)
  if (searchQueryStore !== previousStoreSearch) {
    setPreviousStoreSearch(searchQueryStore)
    setLocalSearchQuery(searchQueryStore)
  }

  const toggleSearch = useCallback(() => {
    setSearchOpen((open) => {
      if (open && localSearchQuery) {
        setLocalSearchQuery('')
      }
      return !open
    })
  }, [localSearchQuery])

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

    const f: HabitsFilter = {}
    if (searchQueryStore.trim()) f.search = searchQueryStore.trim()
    if (selectedFrequency) f.frequencyUnit = selectedFrequency
    if (selectedTagIds.length > 0) f.tagIds = selectedTagIds
    return f
  }, [currentActiveView, selectedDate, searchQueryStore, selectedFrequency, selectedTagIds, showGeneralOnToday])

  const habitsQuery = useHabits(filters)
  const habitsById = habitsQuery.data?.habitsById ?? EMPTY_HABITS_BY_ID
  const childrenByParent = habitsQuery.data?.childrenByParent ?? EMPTY_CHILDREN_BY_PARENT
  const habitsCount = habitsById.size
  const hasFetched = habitsQuery.dataUpdatedAt > 0
  const isRefetching = habitsQuery.isFetching && hasFetched

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
      function walk(currentId: string): boolean {
        const habit = habitsById.get(currentId)
        if (!habit?.parentId) return false
        if (selectedHabitIds.has(habit.parentId)) return true
        return walk(habit.parentId)
      }
      return walk(habitId)
    },
    [habitsById, selectedHabitIds],
  )

  const handleToggleSelection = useCallback(
    (habitId: string) => {
      toggleSelectionCascade(habitId, getDescendantIds, isAncestorSelected)
    },
    [toggleSelectionCascade, getDescendantIds, isAncestorSelected],
  )

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

  const [previousActiveView, setPreviousActiveView] = useState(activeView)
  if (activeView !== previousActiveView) {
    setPreviousActiveView(activeView)
    if (isSelectMode) clearSelection()
  }

  const toggleTagFilter = useCallback((tagId: string) => {
    const idx = selectedTagIds.indexOf(tagId)
    if (idx >= 0) {
      setSelectedTagIds(selectedTagIds.filter((id) => id !== tagId))
      return
    }

    setSelectedTagIds([...selectedTagIds, tagId])
  }, [selectedTagIds, setSelectedTagIds])

  const allSelected = habitsCount > 0 && selectedHabitIds.size === habitsCount
  const selectAll = useCallback(() => {
    const loaded = habitListRef.current?.allLoadedIds
    const allIds = loaded ? Array.from(loaded) : Array.from(habitsById.keys())
    selectAllHabits(allIds)
  }, [habitsById, selectAllHabits])
  const deselectAll = useCallback(() => {
    clearSelection()
  }, [clearSelection])

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
        title={headerTitle}
        subtitle={headerSubtitle}
        streak={streakInfo?.currentStreak ?? 0}
      />

      <TodayTabs
        tabs={tabItems}
        activeView={currentActiveView}
        hasProAccess={hasProAccess}
        onChangeView={attemptViewChange}
        viewsLabel={t('habits.viewsLabel')}
        onKeyDown={handleTabKeydown}
      />

      {currentActiveView === 'today' && isToday(selectedDate) && (
        <TodayAISummary date={formatAPIDate(selectedDate)} />
      )}

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

      <div
        id="tabpanel-goals"
        role="tabpanel"
        aria-labelledby="tab-goals"
      >
        {currentActiveView === 'goals' && <GoalsView />}
      </div>

      {currentActiveView !== 'goals' && (
        <div
          id="tabpanel-habits"
          role="tabpanel"
          aria-labelledby={`tab-${currentActiveView}`}
        >
          <SectionLabel top={20} bottom={0}>{t('habits.sectionLabel')}</SectionLabel>

          <motion.div layout transition={listTransition}>
            <TodayUtilityRow
              activeView={currentActiveView}
              searchOpen={searchOpen}
              searchValue={localSearchQuery}
              selectedFrequency={selectedFrequency}
              selectedTagIds={selectedTagIds}
              tags={tags}
              frequencyOptions={frequencyOptions}
              controlsMenuRef={controlsMenuRef}
              onSearchToggle={toggleSearch}
              onSearchChange={setLocalSearchQuery}
              onSearchClear={() => setLocalSearchQuery('')}
              onFrequencyChange={setSelectedFrequency}
              onTagToggle={toggleTagFilter}
              onOpenControlsMenu={toggleControlsMenu}
            />
          </motion.div>

          {showControlsMenu && typeof document !== 'undefined' && (
            <ControlsMenu
              menuPanelRef={controlsMenuPanelRef}
              position={controlsMenuPosition}
              isSelectMode={isSelectMode}
              showCompleted={showCompleted}
              isFetching={habitsQuery.isFetching}
              allCollapsed={habitListAllCollapsed}
              onToggleSelect={toggleSelectMode}
              onToggleCollapse={() => {
                if (habitListAllCollapsed) {
                  habitListRef.current?.expandAll()
                } else {
                  habitListRef.current?.collapseAll()
                }
              }}
              onRefresh={() => queryClient.invalidateQueries({ queryKey: habitKeys.lists() })}
              onToggleCompleted={() => setShowCompleted(!showCompleted)}
              onClose={closeControlsMenu}
            />
          )}

          {!hasFetched && (
            <div className="stagger-enter">
              {SKELETON_KEYS.map((key) => (
                <div
                  key={key}
                  className="flex items-center"
                  style={{
                    padding: '16px 20px',
                    gap: 14,
                    borderBottom: '1px solid var(--hairline)',
                  }}
                >
                  <div className="flex-1 flex flex-col" style={{ gap: 8 }}>
                    <div
                      className="rounded-sm animate-pulse"
                      style={{ width: '55%', height: 10, background: 'var(--bg-sunk)' }}
                    />
                    <div
                      className="rounded-sm animate-pulse"
                      style={{ width: '30%', height: 7, background: 'var(--bg-sunk)' }}
                    />
                  </div>
                  <div
                    className="rounded-full shrink-0"
                    style={{
                      width: 9,
                      height: 9,
                      boxShadow: 'inset 0 0 0 1.5px var(--hairline-strong)',
                    }}
                  />
                </div>
              ))}
            </div>
          )}

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

          {hasFetched && (
            <motion.div
              layout
              data-testid="today-list-shell"
              className={`overflow-x-hidden overflow-y-visible ${
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
                onAllCollapsedChange={setHabitListAllCollapsed}
              />
            </motion.div>
          )}
        </div>
      )}

      <AnimatePresence initial={false}>
        {isSelectMode && typeof document !== 'undefined' ? (
          <BulkActionBarV2
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

    </div>
  )
}

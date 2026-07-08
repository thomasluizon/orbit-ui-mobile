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
  computeDayProgress,
  formatAPIDate,
  formatLocaleDate,
  parseShowGeneralOnTodayPreference,
} from '@orbit/shared/utils'
import { plural } from '@/lib/plural'
import { type HabitListHandle } from '@/components/habits/habit-list'
import { TodayAISummary } from '@/components/habits/today-ai-summary'
import { GoalsView } from '@/components/goals/goals-view'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { BulkActionBarV2 } from '@/components/habits/bulk-action-bar-v2'
import { GradientTop } from '@/components/ui/gradient-top'
import { ReferralDrawer } from '@/components/referral/referral-drawer'
import { useTopbarSlot } from '@/components/shell/topbar-slot'
import { useUIStore } from '@/stores/ui-store'
import { useReferralPromptStore } from '@/stores/referral-prompt-store'
import { useProfile } from '@/hooks/use-profile'
import { useEngagementSlot } from '@/hooks/use-engagement-slot'
import { useOverlayEscape } from '@/hooks/use-overlay-escape'
import {
  EMPTY_CHILDREN_BY_PARENT,
  EMPTY_HABITS_BY_ID,
  useHabits,
} from '@/hooks/use-habits'
import { useTags } from '@/hooks/use-tags'
import { useCoachTour } from '@/hooks/use-coach-tour'
import { useBulkActions } from '@/hooks/use-bulk-actions'
import {
  TodayHeader,
  TodayTabs,
  TodayDateNavigation,
  TodayUtilityRow,
  getTodayTabLabel,
  type TodayTabItem,
} from './today-shell'
import { useToday } from './today-provider'
import { buildTodayFilters } from './today-model'
import { useTodayViewSync } from './use-today-view-sync'
import {
  TodayEngagementCards,
  TodayHabitsProgressHeader,
  TodayHabitsStates,
  TodayHabitsListShell,
} from './today-sections'
import type { HabitsFilter } from '@orbit/shared/types/habit'

const TAB_VIEWS = ['today', 'all', 'general', 'goals'] as const

export default function TodayPage() {
  const t = useTranslations()
  const locale = useLocale()
  const prefersReducedMotion = useReducedMotion()
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const { profile } = useProfile()
  const { tags } = useTags()
  useCoachTour()
  const listMotionPreset = resolveMotionPreset('list-enter', Boolean(prefersReducedMotion))
  const listTransition = {
    duration: listMotionPreset.enterDuration / 1000,
    ease: listMotionPreset.enterEasing,
  } as const
  const engagementExitTransition = {
    duration: prefersReducedMotion ? 0 : 0.16,
    ease: [0.2, 0, 0, 1],
  } as const

  const showGeneralOnToday = useMemo(() => {
    if (typeof globalThis === 'undefined' || typeof globalThis.localStorage === 'undefined') return false
    return parseShowGeneralOnTodayPreference(localStorage.getItem('orbit_show_general_on_today'))
  }, [])

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

  useOverlayEscape({ open: isSelectMode, onDismiss: toggleSelectMode })

  const setShowCreateModal = useUIStore((s) => s.setShowCreateModal)
  const dismissHomeEntry = useReferralPromptStore((s) => s.dismissHomeEntry)

  const [showReferral, setShowReferral] = useState(false)
  const [localSearchQuery, setLocalSearchQuery] = useState(searchQueryStore)
  const [searchOpen, setSearchOpen] = useState(false)
  const [slideDirection, setSlideDirection] = useState<'left' | 'right'>('right')
  const [hasNavigatedDate, setHasNavigatedDate] = useState(false)
  const searchDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const habitListRef = useRef<HabitListHandle>(null)
  const [habitListAllCollapsed, setHabitListAllCollapsed] = useState(false)

  const dateParam = searchParams.get('date')
  const pinnedDateStr = useMemo(() => {
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) return dateParam
    return null
  }, [dateParam])

  const today = useToday()
  const selectedDateStr = pinnedDateStr ?? today
  const selectedDate = useMemo(
    () => new Date(selectedDateStr + 'T00:00:00'),
    [selectedDateStr],
  )

  const { slot: engagementSlot } = useEngagementSlot({
    isTodayView: currentActiveView === 'today',
    isTodayDate: isToday(selectedDate),
  })

  useTodayViewSync({
    pinnedDateStr,
    searchQueryStore,
    activeView,
    isSelectMode,
    setActiveView,
    setLocalSearchQuery,
    clearSelection,
  })

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
    setHasNavigatedDate(true)
    router.push(`/?date=${formatAPIDate(subDays(selectedDate, 1))}`)
  }, [router, selectedDate])

  const goToNextDay = useCallback(() => {
    setSlideDirection('right')
    setHasNavigatedDate(true)
    router.push(`/?date=${formatAPIDate(addDays(selectedDate, 1))}`)
  }, [router, selectedDate])

  const goToToday = useCallback(() => {
    setSlideDirection(selectedDate > new Date() ? 'left' : 'right')
    setHasNavigatedDate(true)
    setActiveView('today')
    router.push('/')
  }, [router, selectedDate, setActiveView])

  const handleToggleCollapse = useCallback(() => {
    if (habitListAllCollapsed) {
      habitListRef.current?.expandAll()
    } else {
      habitListRef.current?.collapseAll()
    }
  }, [habitListAllCollapsed])

  const handleRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
  }, [queryClient])

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

  const toggleSearch = useCallback(() => {
    setSearchOpen((open) => {
      if (open && localSearchQuery) {
        setLocalSearchQuery('')
      }
      return !open
    })
  }, [localSearchQuery])

  const dateStr = formatAPIDate(selectedDate)

  const filters = useMemo<HabitsFilter>(
    () =>
      buildTodayFilters({
        view: currentActiveView,
        dateStr,
        isTodayDate: isToday(selectedDate),
        searchQuery: searchQueryStore,
        selectedFrequency,
        selectedTagIds,
        showGeneralOnToday,
      }),
    [currentActiveView, dateStr, selectedDate, searchQueryStore, selectedFrequency, selectedTagIds, showGeneralOnToday],
  )

  const habitsQuery = useHabits(filters)
  const habitsById = habitsQuery.data?.habitsById ?? EMPTY_HABITS_BY_ID
  const childrenByParent = habitsQuery.data?.childrenByParent ?? EMPTY_CHILDREN_BY_PARENT
  const habitsCount = habitsById.size
  const hasFetched = habitsQuery.dataUpdatedAt > 0
  const isRefetching = habitsQuery.isFetching && hasFetched
  const showLoadError = habitsQuery.isError && !hasFetched

  const dayProgress = useMemo(
    () => computeDayProgress(habitsById, dateStr),
    [habitsById, dateStr],
  )
  const showDayProgress = currentActiveView === 'today' && dayProgress.total > 0

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

  useEffect(() => {
    if (!hasProAccess && activeView === 'goals') {
      setActiveView('today')
    }
  }, [activeView, hasProAccess, setActiveView])

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

  const desktopDateNav = useMemo(
    () =>
      currentActiveView === 'today' ? (
        <TodayDateNavigation
          compact
          visible
          dateLabel={dateLabel}
          isTodaySelected={isToday(selectedDate)}
          slideDirection={slideDirection}
          animateDateChange={hasNavigatedDate}
          onGoToPreviousDay={goToPreviousDay}
          onGoToToday={goToToday}
          onGoToNextDay={goToNextDay}
          previousLabel={t('dates.previousDay')}
          todayLabel={t('dates.goToToday')}
          nextLabel={t('dates.nextDay')}
        />
      ) : null,
    [
      currentActiveView,
      dateLabel,
      hasNavigatedDate,
      selectedDate,
      slideDirection,
      goToPreviousDay,
      goToToday,
      goToNextDay,
      t,
    ],
  )
  useTopbarSlot(desktopDateNav)

  return (
    <div className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 -z-10 md:hidden"
        style={{
          left: 'calc(var(--app-px) * -1)',
          right: 'calc(var(--app-px) * -1)',
        }}
      >
        <GradientTop height={260} />
      </div>

      <div className="md:hidden">
        <TodayHeader streak={profile?.currentStreak ?? 0} />

        <TodayTabs
          tabs={tabItems}
          activeView={currentActiveView}
          hasProAccess={hasProAccess}
          onChangeView={attemptViewChange}
          viewsLabel={t('habits.viewsLabel')}
        />
      </div>

      <div className="pt-1.5 md:pt-2.5">
        {currentActiveView === 'today' && isToday(selectedDate) && (
          <TodayAISummary date={formatAPIDate(selectedDate)} />
        )}

        <TodayEngagementCards
          engagementSlot={engagementSlot}
          exitTransition={engagementExitTransition}
          onOpenReferral={() => setShowReferral(true)}
          onDismissReferral={dismissHomeEntry}
        />
      </div>

      <div className="md:hidden">
        <TodayDateNavigation
          visible={currentActiveView === 'today'}
          dateLabel={dateLabel}
          isTodaySelected={isToday(selectedDate)}
          slideDirection={slideDirection}
          animateDateChange={hasNavigatedDate}
          onGoToPreviousDay={goToPreviousDay}
          onGoToToday={goToToday}
          onGoToNextDay={goToNextDay}
          previousLabel={t('dates.previousDay')}
          todayLabel={t('dates.goToToday')}
          nextLabel={t('dates.nextDay')}
        />
      </div>

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
          <TodayHabitsProgressHeader
            showDayProgress={showDayProgress}
            dayProgress={dayProgress}
            engagementSlot={engagementSlot}
            exitTransition={engagementExitTransition}
          />

          <motion.div layout transition={listTransition} data-testid="today-utility-row">
            <TodayUtilityRow
              activeView={currentActiveView}
              searchOpen={searchOpen}
              searchValue={localSearchQuery}
              selectedFrequency={selectedFrequency}
              selectedTagIds={selectedTagIds}
              tags={tags}
              frequencyOptions={frequencyOptions}
              isSelectMode={isSelectMode}
              showCompleted={showCompleted}
              isFetching={habitsQuery.isFetching}
              allCollapsed={habitListAllCollapsed}
              onSearchToggle={toggleSearch}
              onSearchChange={setLocalSearchQuery}
              onSearchClear={() => setLocalSearchQuery('')}
              onFrequencyChange={setSelectedFrequency}
              onTagToggle={toggleTagFilter}
              onToggleSelect={toggleSelectMode}
              onToggleCollapse={handleToggleCollapse}
              onRefresh={handleRefresh}
              onToggleCompleted={() => setShowCompleted(!showCompleted)}
            />
          </motion.div>

          <TodayHabitsStates
            showLoadError={showLoadError}
            onRetry={() => {
              void habitsQuery.refetch()
            }}
            hasFetched={hasFetched}
            isRefetching={isRefetching}
            listTransition={listTransition}
          />

          <TodayHabitsListShell
            hasFetched={hasFetched}
            isRefetching={isRefetching}
            refetchShift={Math.round(listMotionPreset.shift / 2)}
            listTransition={listTransition}
            isSelectMode={isSelectMode}
            habitListRef={habitListRef}
            view={currentActiveView}
            selectedDate={selectedDate}
            showCompleted={showCompleted}
            selectedHabitIds={selectedHabitIds}
            searchQuery={searchQueryStore}
            filters={filters}
            onToggleSelection={handleToggleSelection}
            onToggleSelectMode={toggleSelectMode}
            onCreate={() => setShowCreateModal(true)}
            onSeeUpcoming={goToNextDay}
            onAllCollapsedChange={setHabitListAllCollapsed}
          />
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
        onConfirm={() => void confirmBulkDelete()}
        onCancel={() => setShowBulkDeleteConfirm(false)}
      />

      <ConfirmDialog
        open={showBulkLogConfirm}
        onOpenChange={setShowBulkLogConfirm}
        title={t('habits.bulkLogTitle')}
        description={plural(t('habits.bulkLogMessage', { count: selectedHabitIds.size }), selectedHabitIds.size)}
        confirmLabel={t('habits.bulkLogConfirm')}
        cancelLabel={t('common.cancel')}
        variant="success"
        onConfirm={() => void confirmBulkLog()}
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
        onConfirm={() => void confirmBulkSkip()}
        onCancel={() => setShowBulkSkipConfirm(false)}
      />

      <ReferralDrawer open={showReferral} onOpenChange={setShowReferral} />
    </div>
  )
}

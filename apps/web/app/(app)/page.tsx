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
import { HabitList, type HabitListHandle } from '@/components/habits/habit-list'
import { TodayAISummary } from '@/components/habits/today-ai-summary'
import { GoalsView } from '@/components/goals/goals-view'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { BulkActionBarV2 } from '@/components/habits/bulk-action-bar-v2'
import { GradientTop } from '@/components/ui/gradient-top'
import { PillButton } from '@/components/ui/pill-button'
import { ProgressBar } from '@/components/ui/progress-bar'
import { SatelliteGlyph } from '@/components/ui/satellite-glyph'
import { SectionLabel } from '@/components/ui/section-label'
import { SetupChecklistCard } from '@/components/today/setup-checklist-card'
import { ReferralCard } from '@/components/referral/referral-card'
import { ReferralDrawer } from '@/components/referral/referral-drawer'
import { SocialEntryCard } from '@/components/social/social-entry-card'
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
import type { HabitsFilter } from '@orbit/shared/types/habit'

const TAB_VIEWS = ['today', 'all', 'general', 'goals'] as const
const SKELETON_KEYS = ['sk-1', 'sk-2', 'sk-3', 'sk-4', 'sk-5'] as const

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

  const [previousPinnedDateStr, setPreviousPinnedDateStr] = useState<string | null>(null)
  if (pinnedDateStr !== previousPinnedDateStr) {
    setPreviousPinnedDateStr(pinnedDateStr)
    if (pinnedDateStr) setActiveView('today')
  }

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
    queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
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

  const dateStr = formatAPIDate(selectedDate)

  const filters = useMemo<HabitsFilter>(() => {
    if (currentActiveView === 'general') {
      const f: HabitsFilter = { isGeneral: true }
      if (searchQueryStore.trim()) f.search = searchQueryStore.trim()
      if (selectedTagIds.length > 0) f.tagIds = selectedTagIds
      return f
    }

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
  }, [currentActiveView, dateStr, selectedDate, searchQueryStore, selectedFrequency, selectedTagIds, showGeneralOnToday])

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

        <div>
          <AnimatePresence initial={false}>
            {engagementSlot === 'referral' && (
              <motion.div
                key="engagement-referral"
                exit={{ opacity: 0, y: -4 }}
                transition={engagementExitTransition}
              >
                <ReferralCard
                  onOpen={() => setShowReferral(true)}
                  onDismiss={dismissHomeEntry}
                />
              </motion.div>
            )}

            {engagementSlot === 'socialEntry' && (
              <motion.div
                key="engagement-social-entry"
                exit={{ opacity: 0, y: -4 }}
                transition={engagementExitTransition}
              >
                <SocialEntryCard />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
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
          <div className="md:hidden">
            <SectionLabel
              top={20}
              bottom={showDayProgress ? 6 : 0}
              trailing={
                showDayProgress ? (
                  <span className="t-meta">
                    {dayProgress.done}/{dayProgress.total}
                  </span>
                ) : undefined
              }
            >
              {t('habits.sectionLabel')}
            </SectionLabel>
          </div>

          {showDayProgress && (
            <div className="md:hidden" style={{ padding: '0 20px 6px' }}>
              <ProgressBar
                progress={dayProgress.done / dayProgress.total}
                label={`${dayProgress.done}/${dayProgress.total} ${t('habits.completed')}`}
              />
            </div>
          )}

          <div>
            <AnimatePresence initial={false}>
              {engagementSlot === 'setupChecklist' && (
                <motion.div
                  key="engagement-setup-checklist"
                  exit={{ opacity: 0, y: -4 }}
                  transition={engagementExitTransition}
                >
                  <SetupChecklistCard />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

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

          {showLoadError && (
            <div className="flex flex-col items-center px-6 py-12 text-center">
              <SatelliteGlyph />
              <p
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 14,
                  color: 'var(--fg-3)',
                  lineHeight: 1.5,
                  maxWidth: 280,
                  marginTop: 14,
                }}
              >
                {t('habits.loadError')}
              </p>
              <PillButton
                variant="ghost"
                className="mt-[22px]"
                onClick={() => {
                  void habitsQuery.refetch()
                }}
              >
                {t('common.retry')}
              </PillButton>
            </div>
          )}

          {!hasFetched && !showLoadError && (
            <div className="stagger-enter" style={{ padding: '12px 20px 8px' }}>
              {SKELETON_KEYS.map((key) => (
                <div
                  key={key}
                  className="flex items-center skeleton-pulse"
                  style={{
                    padding: '14px 16px',
                    gap: 14,
                    borderRadius: 18,
                    background: 'var(--bg-card)',
                    boxShadow: 'inset 0 0 0 1px var(--hairline)',
                    marginBottom: 10,
                  }}
                >
                  <div
                    className="shrink-0"
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: 14,
                      background: 'color-mix(in srgb, var(--fg-1) 8%, transparent)',
                    }}
                  />
                  <div className="flex-1 flex flex-col" style={{ gap: 8 }}>
                    <div
                      style={{
                        width: '55%',
                        height: 12,
                        borderRadius: 6,
                        background: 'color-mix(in srgb, var(--fg-1) 8%, transparent)',
                      }}
                    />
                    <div
                      style={{
                        width: '32%',
                        height: 12,
                        borderRadius: 6,
                        background: 'color-mix(in srgb, var(--fg-1) 8%, transparent)',
                      }}
                    />
                  </div>
                  <div
                    className="rounded-full shrink-0"
                    style={{
                      width: 30,
                      height: 30,
                      background: 'color-mix(in srgb, var(--fg-1) 8%, transparent)',
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
                className="overflow-hidden px-5 pt-1 origin-top"
                style={{ height: 8 }}
                initial={{ opacity: 0, scaleY: 0 }}
                animate={{ opacity: 1, scaleY: 1 }}
                exit={{ opacity: 0, scaleY: 0 }}
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
                isSelectMode ? 'pb-48 md:pb-32' : ''
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
        variant="success"
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

      <ReferralDrawer open={showReferral} onOpenChange={setShowReferral} />
    </div>
  )
}

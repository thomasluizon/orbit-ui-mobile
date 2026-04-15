import { memo, useState, useMemo, useCallback, useRef, useEffect, type ReactElement } from 'react'
import {
  Animated,
  Easing,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { parseShowGeneralOnTodayPreference } from '@orbit/shared/utils'
import {
  Search,
  X,
  MoreVertical,
  CheckCircle2,
  RefreshCw,
  ChevronsDownUp,
  ChevronsUpDown,
  PlusCircle,
  MinusCircle,
  FastForward,
  Trash2,
  Check,
  Eye,
} from 'lucide-react-native'
import {
  addDays,
  subDays,
  isToday,
  isYesterday,
  isTomorrow,
} from 'date-fns'
import { useTranslation } from 'react-i18next'
import { formatAPIDate, formatLocaleDate } from '@orbit/shared/utils'
import { useHabitVisibility } from '@/hooks/use-habit-visibility'
import type { HabitsFilter, NormalizedHabit } from '@orbit/shared/types/habit'
import { plural } from '@/lib/plural'
import { useAdMob } from '@/hooks/use-ad-mob'
import { useProfile } from '@/hooks/use-profile'
import {
  useHabits,
  useDeleteHabit,
} from '@/hooks/use-habits'
import { useTags } from '@/hooks/use-tags'
import { useStreakInfo } from '@/hooks/use-gamification'
import { useUIStore } from '@/stores/ui-store'
import { HabitList, type HabitListHandle } from '@/components/habit-list'
import { CreateHabitModal } from '@/components/habits/create-habit-modal'
import { LogHabitModal } from '@/components/habits/log-habit-modal'
import { HabitDetailDrawer } from '@/components/habits/habit-detail-drawer'
import { EditHabitModal } from '@/components/habits/edit-habit-modal'
import { HabitSummaryCard } from '@/components/habits/habit-summary-card'
import { GoalsView } from '@/components/goals/goals-view'
import { CreateGoalModal } from '@/components/goals/create-goal-modal'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { AppTextInput } from '@/components/ui/app-text-input'
import { TrialBanner } from '@/components/ui/trial-banner'
import { AnchoredMenu } from '@/components/ui/anchored-menu'
import { ReviewReminderCard } from '@/components/review-reminder-card'
import { useHorizontalSwipe } from '@/hooks/use-horizontal-swipe'
import type { MenuAnchorRect } from '@/lib/anchored-menu'
import { useBulkActions } from '@/hooks/use-bulk-actions'
import { shouldResetSelectionForViewChange } from '@/lib/habit-selection-state'
import { createColors, radius, shadows } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useDeviceLocale } from '@/hooks/use-device-locale'
import { useReviewReminder } from '@/hooks/use-review-reminder'
import { useTourScrollContainer } from '@/hooks/use-tour-scroll-container'
import {
  TodayHeader,
  TodayTabs,
  TodayDateNavigation,
  type TodayTabItem,
} from './today-shell'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TAB_VIEWS = ['today', 'all', 'general', 'goals'] as const
type TodayView = typeof TAB_VIEWS[number]

export function resolveTodayView(activeView: TodayView, hasProAccess: boolean): TodayView {
  return !hasProAccess && activeView === 'goals' ? 'today' : activeView
}

export function shouldRedirectGoalsTab(nextView: TodayView, hasProAccess: boolean): boolean {
  return nextView === 'goals' && !hasProAccess
}

type FreqKey = 'Day' | 'Week' | 'Month' | 'Year' | 'none'

interface TodaySearchBarProps {
  initialValue: string
  onChange: (value: string) => void
  onFocusChange: (focused: boolean) => void
  placeholder: string
  colors: ReturnType<typeof useAppTheme>['colors']
  styles: ReturnType<typeof createStyles>
}

const TodaySearchBar = memo(function TodaySearchBar({
  initialValue,
  onChange,
  onFocusChange,
  placeholder,
  colors,
  styles,
}: Readonly<TodaySearchBarProps>) {
  const [draft, setDraft] = useState(initialValue)

  useEffect(() => {
    setDraft(initialValue)
  }, [initialValue])

  useEffect(() => {
    const timer = setTimeout(() => {
      onChange(draft)
    }, 300)

    return () => clearTimeout(timer)
  }, [draft, onChange])

  return (
    <View style={styles.searchWrapper}>
      <View style={styles.searchContainer}>
        <Search size={18} color={colors.textMuted} style={styles.searchIcon} />
        <AppTextInput
          style={styles.searchInput}
          value={draft}
          onChangeText={setDraft}
          onFocus={() => onFocusChange(true)}
          onBlur={() => onFocusChange(false)}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          returnKeyType="search"
          selectionColor={colors.primary}
        />
        {draft.length > 0 ? (
          <TouchableOpacity
            onPress={() => setDraft('')}
            style={styles.searchClear}
          >
            <X size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  )
})

// ---------------------------------------------------------------------------
// Today Screen
// ---------------------------------------------------------------------------

export default function TodayScreen() {
  const { t } = useTranslation()
  const { colors } = useAppTheme()
  const router = useRouter()
  const locale = useDeviceLocale()
  const insets = useSafeAreaInsets()
  const { date } = useLocalSearchParams<{ date?: string | string[] }>()
  const styles = useMemo(() => createStyles(colors), [colors])

  const { showInterstitialIfDue } = useAdMob()
  const { profile } = useProfile()
  const reviewReminder = useReviewReminder(profile)
  const { data: streakInfo } = useStreakInfo()
  const { tags } = useTags()
  const deleteHabit = useDeleteHabit()

  // UI Store
  const selectedDateStr = useUIStore((s) => s.selectedDate)
  const setSelectedDate = useUIStore((s) => s.setSelectedDate)
  const activeView = useUIStore((s) => s.activeView)
  const setActiveView = useUIStore((s) => s.setActiveView)
  const searchQueryStore = useUIStore((s) => s.searchQuery)
  const setSearchQueryStore = useUIStore((s) => s.setSearchQuery)
  const selectedFrequency = useUIStore((s) => s.selectedFrequency)
  const setSelectedFrequency = useUIStore((s) => s.setSelectedFrequency)
  const selectedTagIds = useUIStore((s) => s.selectedTagIds)
  const setSelectedTagIds = useUIStore((s) => s.setSelectedTagIds)
  const showCompleted = useUIStore((s) => s.showCompleted)
  const setShowCompleted = useUIStore((s) => s.setShowCompleted)
  const isSelectMode = useUIStore((s) => s.isSelectMode)
  const selectedHabitIds = useUIStore((s) => s.selectedHabitIds)
  const toggleSelectMode = useUIStore((s) => s.toggleSelectMode)
  const selectAllHabits = useUIStore((s) => s.selectAllHabits)
  const clearSelection = useUIStore((s) => s.clearSelection)
  const hasProAccess = profile?.hasProAccess ?? false
  const currentActiveView = resolveTodayView(activeView, hasProAccess)

  // Local state
  const [showGeneralOnToday, setShowGeneralOnToday] = useState(false)
  const [showControlsMenu, setShowControlsMenu] = useState(false)
  const [controlsMenuAnchorRect, setControlsMenuAnchorRect] =
    useState<MenuAnchorRect | null>(null)
  const [showHabitDeleteConfirm, setShowHabitDeleteConfirm] = useState(false)
  const [slideDirection, setSlideDirection] = useState<'left' | 'right'>('right')
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const habitListRef = useRef<HabitListHandle>(null)
  const goalsScrollRef = useRef<ScrollView>(null)
  const goalsScrollTo = useCallback((y: number) => {
    goalsScrollRef.current?.scrollTo({ y, animated: true })
  }, [])
  const { onTourScroll: onGoalsTourScroll } = useTourScrollContainer('/', goalsScrollTo)
  const controlsButtonRef = useRef<View>(null)
  const previousActiveViewRef = useRef(activeView)
  const dateLabelAnim = useRef(new Animated.Value(0)).current

  // Modal state
  const [logHabit, setLogHabit] = useState<NormalizedHabit | null>(null)
  const [detailHabit, setDetailHabit] = useState<NormalizedHabit | null>(null)
  const [editHabit, setEditHabit] = useState<NormalizedHabit | null>(null)
  const [habitPendingDelete, setHabitPendingDelete] =
    useState<NormalizedHabit | null>(null)

  const selectedDate = useMemo(
    () => new Date(selectedDateStr + 'T00:00:00'),
    [selectedDateStr],
  )

  useEffect(() => {
    AsyncStorage.getItem('orbit_show_general_on_today')
      .then((storedValue) => {
        setShowGeneralOnToday(parseShowGeneralOnTodayPreference(storedValue))
      })
      .catch(() => {
        setShowGeneralOnToday(false)
      })
  }, [])

  useEffect(() => {
    const dateParam = Array.isArray(date) ? date[0] : date
    if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) return
    setSelectedDate(dateParam)
    setActiveView('today')
  }, [date, setActiveView, setSelectedDate])

  const frequencyOptions = useMemo<{ key: FreqKey; label: string }[]>(
    () => [
      { key: 'Day', label: t('habits.filter.daily') },
      { key: 'Week', label: t('habits.filter.weekly') },
      { key: 'Month', label: t('habits.filter.monthly') },
      { key: 'Year', label: t('habits.filter.yearly') },
      { key: 'none', label: t('habits.filter.oneTime') },
    ],
    [t],
  )

  const handleChangeView = useCallback(
    (nextView: TodayView) => {
      if (shouldRedirectGoalsTab(nextView, hasProAccess)) {
        router.push('/upgrade')
        return
      }

      setActiveView(nextView)
    },
    [hasProAccess, router, setActiveView],
  )

  const tabItems = useMemo<TodayTabItem[]>(
    () =>
      TAB_VIEWS.map((view) => ({
        view,
        label:
          view === 'today'
            ? t('habits.viewToday')
            : view === 'all'
              ? t('habits.viewAll')
              : view === 'general'
                ? t('habits.viewGeneral')
                : t('goals.tab'),
      })),
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
    setSlideDirection(isToday(selectedDate) ? 'right' : selectedDate > new Date() ? 'left' : 'right')
    setSelectedDate(formatAPIDate(new Date()))
    setActiveView('today')
  }, [setSelectedDate, setActiveView])

  const swipePanResponder = useHorizontalSwipe({
    onSwipeLeft: goToNextDay,
    onSwipeRight: goToPreviousDay,
  })

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

  useEffect(() => {
    dateLabelAnim.setValue(0)
    Animated.timing(dateLabelAnim, {
      toValue: 1,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start()
  }, [dateLabelAnim, selectedDateStr, slideDirection])

  // Tag filter toggle
  const toggleTagFilter = useCallback((tagId: string) => {
    const idx = selectedTagIds.indexOf(tagId)
    if (idx >= 0) {
      setSelectedTagIds(selectedTagIds.filter((id) => id !== tagId))
      return
    }

    setSelectedTagIds([...selectedTagIds, tagId])
  }, [selectedTagIds, setSelectedTagIds])

  // Build filters (matching web exactly)
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
    // 'all' view
    const f: HabitsFilter = {}
    if (searchQueryStore.trim()) f.search = searchQueryStore.trim()
    if (selectedFrequency) f.frequencyUnit = selectedFrequency
    if (selectedTagIds.length > 0) f.tagIds = selectedTagIds
    return f
  }, [currentActiveView, dateStr, selectedDate, searchQueryStore, selectedFrequency, selectedTagIds, showGeneralOnToday])

  const habitsQuery = useHabits(filters)
  const habitsById = habitsQuery.data?.habitsById ?? new Map()
  const childrenByParent = habitsQuery.data?.childrenByParent ?? new Map()

  // Sync detailHabit from live query data so checklist changes are reflected in the drawer
  useEffect(() => {
    if (!detailHabit) return
    const fresh = habitsQuery.data?.habitsById.get(detailHabit.id)
    if (fresh && fresh !== detailHabit) {
      setDetailHabit(fresh)
    }
  }, [habitsQuery.data, detailHabit])

  const bulkActions = useBulkActions({
    selectedHabitIds,
    habitsById,
    habitListRef,
    onSuccess: clearSelection,
  })
  const {
    showBulkDeleteConfirm, showBulkLogConfirm, showBulkSkipConfirm,
    setShowBulkDeleteConfirm, setShowBulkLogConfirm, setShowBulkSkipConfirm,
    confirmBulkDelete, confirmBulkLog, confirmBulkSkip,
  } = bulkActions

  // Use the shared visibility helpers so bulk-selection scope matches what
  // HabitList actually renders (Today view surfaces today's items + overdue).
  const visibility = useHabitVisibility({
    habitsById,
    childrenByParent,
    selectedDate: dateStr,
    searchQuery: searchQueryStore,
    showCompleted,
    recentlyCompletedIds: useMemo(() => new Set<string>(), []),
  })

  const visibleTopLevelHabits = useMemo(() => {
    const habits = habitsQuery.data?.topLevelHabits ?? []
    if (currentActiveView === 'today') {
      if (showCompleted) return habits
      return habits.filter((habit) => visibility.hasVisibleContent(habit))
    }
    if (showCompleted) return habits
    return habits.filter((habit) => !habit.isCompleted)
  }, [currentActiveView, habitsQuery.data?.topLevelHabits, showCompleted, visibility])

  const visibleHabitIds = useMemo(() => {
    const ids = new Set<string>()

    const visit = (habit: NormalizedHabit) => {
      ids.add(habit.id)
      for (const child of habitsQuery.getChildren(habit.id)) {
        visit(child)
      }
    }

    for (const habit of visibleTopLevelHabits) {
      visit(habit)
    }

    return ids
  }, [habitsQuery, visibleTopLevelHabits])

  const allLoadedIds = habitListRef.current?.allLoadedIds ?? visibleHabitIds

  const allSelected =
    allLoadedIds.size > 0 &&
    Array.from(allLoadedIds).every((id) => selectedHabitIds.has(id))

  const selectedCount = selectedHabitIds.size

  // Sync filters to UI store
  const setFilters = useUIStore((s) => s.setFilters)
  const showCreateModal = useUIStore((s) => s.showCreateModal)
  const setShowCreateModal = useUIStore((s) => s.setShowCreateModal)
  const showCreateGoalModal = useUIStore((s) => s.showCreateGoalModal)
  const setShowCreateGoalModal = useUIStore((s) => s.setShowCreateGoalModal)
  useEffect(() => {
    setFilters(filters)
  }, [filters, setFilters])

  const showSummary =
    currentActiveView === 'today' &&
    isToday(selectedDate) &&
    profile?.hasProAccess &&
    profile?.aiSummaryEnabled

  useEffect(() => {
    if (!hasProAccess && activeView === 'goals') {
      setActiveView('today')
    }
  }, [activeView, hasProAccess, setActiveView])

  // Clear filters on view change
  useEffect(() => {
    if (
      !shouldResetSelectionForViewChange(
        previousActiveViewRef.current,
        activeView,
      )
    ) {
      return
    }

    previousActiveViewRef.current = activeView
    setShowControlsMenu(false)
    if (isSelectMode) clearSelection()
  }, [activeView, clearSelection, isSelectMode])

  const handleToggleSelectMode = useCallback(() => {
    if (isSelectMode) {
      clearSelection()
    } else {
      toggleSelectMode()
    }
    setShowControlsMenu(false)
  }, [clearSelection, isSelectMode, toggleSelectMode])

  const handleToggleCollapse = useCallback(() => {
    if (habitListRef.current?.allCollapsed) {
      habitListRef.current.expandAll()
    } else {
      habitListRef.current?.collapseAll()
    }
    setShowControlsMenu(false)
  }, [])

  const handleRefresh = useCallback(() => {
    habitListRef.current?.refetch()
    setShowControlsMenu(false)
  }, [])

  const handleToggleCompleted = useCallback(() => {
    setShowCompleted(!showCompleted)
    setShowControlsMenu(false)
  }, [setShowCompleted, showCompleted])

  const measureControlsButton = useCallback(() => {
    controlsButtonRef.current?.measureInWindow((x, y, width, height) => {
      setControlsMenuAnchorRect({ x, y, width, height })
      setShowControlsMenu(true)
    })
  }, [])

  const handleToggleControlsMenu = useCallback(() => {
    if (showControlsMenu) {
      setShowControlsMenu(false)
      return
    }

    measureControlsButton()
  }, [measureControlsButton, showControlsMenu])

  const handleSelectAll = useCallback(() => {
    selectAllHabits(Array.from(allLoadedIds))
  }, [allLoadedIds, selectAllHabits])

  const handleDeselectAll = useCallback(() => {
    clearSelection()
  }, [clearSelection])

  const handleOpenBulkDelete = useCallback(() => {
    if (selectedCount === 0) return
    setShowBulkDeleteConfirm(true)
  }, [selectedCount])

  const handleOpenBulkLog = useCallback(() => {
    if (selectedCount === 0) return
    setShowBulkLogConfirm(true)
  }, [selectedCount])

  const handleOpenBulkSkip = useCallback(() => {
    if (selectedCount === 0) return
    setShowBulkSkipConfirm(true)
  }, [selectedCount])

  const requestHabitDelete = useCallback(
    (habitId: string) => {
      const habit = detailHabit?.id === habitId ? detailHabit : null
      if (!habit) return

      setHabitPendingDelete(habit)
      setShowHabitDeleteConfirm(true)
    },
    [detailHabit],
  )

  const confirmHabitDelete = useCallback(async () => {
    if (!habitPendingDelete) return

    try {
      await deleteHabit.mutateAsync(habitPendingDelete.id)
    } finally {
      setShowHabitDeleteConfirm(false)
      setHabitPendingDelete(null)
      setDetailHabit(null)
    }
  }, [deleteHabit, habitPendingDelete])

  const currentStreak = streakInfo?.currentStreak ?? 0
  const handleHabitLogged = useCallback((habitId: string) => {
    habitListRef.current?.markRecentlyCompleted(habitId)
    habitListRef.current?.checkAndPromptParentLog(habitId)
    void showInterstitialIfDue()
  }, [showInterstitialIfDue])

  const handleListScrollBeginDrag = useCallback(() => {
    setShowControlsMenu(false)
  }, [])

  const sharedHeader = useMemo(
    () => (
      <>
        <TodayHeader
          currentStreak={currentStreak}
          onGoToToday={goToToday}
          goToTodayLabel={t('dates.goToToday')}
          styles={styles}
        />

        <TrialBanner />

        {reviewReminder.shouldShow ? (
          <ReviewReminderCard
            onDismiss={reviewReminder.dismiss}
            onRate={() => {
              void reviewReminder.requestReview()
            }}
          />
        ) : null}

        <TodayTabs
          tabs={tabItems}
          activeView={currentActiveView}
          onChangeView={handleChangeView}
          viewsLabel={t('habits.viewsLabel')}
          styles={styles}
        />
      </>
    ),
    [
      activeView,
      currentStreak,
      goToToday,
      reviewReminder.dismiss,
      reviewReminder.requestReview,
      reviewReminder.shouldShow,
      setActiveView,
      styles,
      tabItems,
      t,
    ],
  )

  const habitsHeader = useMemo<ReactElement>(
    () => (
      <>
        {sharedHeader}
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
          iconColor={colors.textSecondary}
          styles={styles}
          dateLabelAnim={dateLabelAnim}
          panHandlers={!isSearchFocused ? swipePanResponder.panHandlers : undefined}
        />

        {showSummary ? (
          <HabitSummaryCard date={dateStr} />
        ) : null}

        <View style={styles.habitsSection}>
          <TodaySearchBar
            initialValue={searchQueryStore}
            onChange={setSearchQueryStore}
            onFocusChange={setIsSearchFocused}
            placeholder={t('habits.searchPlaceholder')}
            colors={colors}
            styles={styles}
          />

          <View style={styles.filtersWrapper}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filtersContent}
            >
              {activeView !== 'general' ? (
                <>
                  <TouchableOpacity
                    style={[
                      styles.filterChip,
                      !selectedFrequency && styles.filterChipActive,
                    ]}
                    onPress={() => setSelectedFrequency(null)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        !selectedFrequency && styles.filterChipTextActive,
                      ]}
                    >
                      {t('common.all')}
                    </Text>
                  </TouchableOpacity>
                  {frequencyOptions.map((opt) => (
                    <TouchableOpacity
                      key={opt.key}
                      style={[
                        styles.filterChip,
                        selectedFrequency === opt.key && styles.filterChipActive,
                      ]}
                      onPress={() =>
                        setSelectedFrequency(
                          selectedFrequency === opt.key ? null : opt.key,
                        )
                      }
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          selectedFrequency === opt.key &&
                            styles.filterChipTextActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </>
              ) : null}

              {activeView !== 'general' && tags.length > 0 ? (
                <View style={styles.filterDivider} />
              ) : null}

              {tags.map((tag) => (
                <TouchableOpacity
                  key={tag.id}
                  style={[
                    styles.filterChip,
                    selectedTagIds.includes(tag.id)
                      ? { backgroundColor: tag.color, borderColor: tag.color }
                      : null,
                  ]}
                  onPress={() => toggleTagFilter(tag.id)}
                  activeOpacity={0.7}
                >
                  {!selectedTagIds.includes(tag.id) ? (
                    <View
                      style={[styles.tagDot, { backgroundColor: tag.color }]}
                    />
                  ) : null}
                  <Text
                    style={[
                      styles.filterChipText,
                      selectedTagIds.includes(tag.id) ? { color: '#fff' } : null,
                    ]}
                  >
                    {tag.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View ref={controlsButtonRef} collapsable={false}>
              <TouchableOpacity
                style={styles.controlsButton}
                activeOpacity={0.7}
                onPress={handleToggleControlsMenu}
              >
                <MoreVertical size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          <AnchoredMenu
            visible={showControlsMenu}
            anchorRect={controlsMenuAnchorRect}
            onClose={() => setShowControlsMenu(false)}
            width={220}
            estimatedHeight={220}
          >
            <TouchableOpacity
              style={styles.controlsMenuItem}
              onPress={handleToggleSelectMode}
              activeOpacity={0.75}
            >
              {isSelectMode ? (
                <X size={16} color={colors.textMuted} />
              ) : (
                <CheckCircle2 size={16} color={colors.textMuted} />
              )}
              <Text style={styles.controlsMenuLabel}>
                {isSelectMode ? t('common.cancel') : t('common.select')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.controlsMenuItem}
              onPress={handleToggleCollapse}
              activeOpacity={0.75}
            >
              {!!habitListRef.current?.allCollapsed ? (
                <ChevronsUpDown size={16} color={colors.textMuted} />
              ) : (
                <ChevronsDownUp size={16} color={colors.textMuted} />
              )}
              <Text style={styles.controlsMenuLabel}>
                {!!habitListRef.current?.allCollapsed
                  ? t('habits.expandAll')
                  : t('habits.collapseAll')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.controlsMenuItem}
              onPress={handleRefresh}
              activeOpacity={0.75}
            >
              <RefreshCw
                size={16}
                color={colors.textMuted}
                style={habitsQuery.isFetching ? styles.rotatingIcon : undefined}
              />
              <Text style={styles.controlsMenuLabel}>{t('habits.refresh')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.controlsMenuItem}
              onPress={handleToggleCompleted}
              activeOpacity={0.75}
            >
              {showCompleted ? (
                <Check size={16} color={colors.textMuted} />
              ) : (
                <Eye size={16} color={colors.textMuted} />
              )}
              <Text style={styles.controlsMenuLabel}>
                {t('habits.showCompleted')}
              </Text>
            </TouchableOpacity>
          </AnchoredMenu>
        </View>
      </>
    ),
    [
      activeView,
      colors.primary,
      colors.textMuted,
      colors.textSecondary,
      controlsMenuAnchorRect,
      dateLabel,
      dateLabelAnim,
      dateStr,
      frequencyOptions,
      goToNextDay,
      goToPreviousDay,
      goToToday,
      habitsQuery.isFetching,
      handleRefresh,
      handleToggleCollapse,
      handleToggleCompleted,
      handleToggleControlsMenu,
      handleToggleSelectMode,
      isSelectMode,
      selectedDate,
      selectedFrequency,
      selectedTagIds,
      sharedHeader,
      showCompleted,
      showControlsMenu,
      showSummary,
      slideDirection,
      styles,
      t,
      tags,
      toggleTagFilter,
    ],
  )

  return (
    <View style={[styles.safeArea, { paddingTop: insets.top }]}>
      {currentActiveView === 'goals' ? (
        <ScrollView
          ref={goalsScrollRef}
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            isSelectMode && styles.scrollContentWithBulkBar,
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
          onScroll={onGoalsTourScroll}
          scrollEventThrottle={16}
          onScrollBeginDrag={handleListScrollBeginDrag}
        >
          {sharedHeader}
          <GoalsView />
        </ScrollView>
      ) : (
        <HabitList
          ref={habitListRef}
          view={currentActiveView}
          filters={filters}
          selectedDate={currentActiveView === 'today' ? selectedDate : undefined}
          showCompleted={showCompleted}
          searchQuery={searchQueryStore}
          isSelectMode={isSelectMode}
          selectedHabitIds={selectedHabitIds}
          listHeader={habitsHeader}
          onCreatePress={() => setShowCreateModal(true)}
          onSeeUpcoming={goToNextDay}
          onLogHabit={setLogHabit}
          onDetailHabit={setDetailHabit}
          onEditHabit={setEditHabit}
          onScrollBeginDrag={handleListScrollBeginDrag}
        />
      )}

      {isSelectMode && (
        <View
          style={[
            styles.bulkActionBar,
            { bottom: 20 + insets.bottom },
          ]}
        >
          <Text style={styles.bulkSelectionText}>
            {plural(t('common.selected', { n: selectedCount }), selectedCount)}
          </Text>
          <View style={styles.bulkActionRow}>
            <TouchableOpacity
              style={styles.bulkActionButton}
              onPress={allSelected ? handleDeselectAll : handleSelectAll}
              activeOpacity={0.75}
            >
              {allSelected ? (
                <MinusCircle size={18} color={colors.textSecondary} />
              ) : (
                <PlusCircle size={18} color={colors.textSecondary} />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.bulkActionButton,
                selectedCount === 0 && styles.bulkActionButtonDisabled,
              ]}
              onPress={handleOpenBulkLog}
              activeOpacity={0.75}
              disabled={selectedCount === 0}
            >
              <CheckCircle2 size={18} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.bulkActionButton,
                selectedCount === 0 && styles.bulkActionButtonDisabled,
              ]}
              onPress={handleOpenBulkSkip}
              activeOpacity={0.75}
              disabled={selectedCount === 0}
            >
              <FastForward size={18} color={colors.amber400} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.bulkActionButton,
                selectedCount === 0 && styles.bulkActionButtonDisabled,
              ]}
              onPress={handleOpenBulkDelete}
              activeOpacity={0.75}
              disabled={selectedCount === 0}
            >
              <Trash2 size={18} color={colors.red400} />
            </TouchableOpacity>
            <View style={styles.bulkDivider} />
            <TouchableOpacity
              style={styles.bulkActionButton}
              onPress={clearSelection}
              activeOpacity={0.75}
            >
              <X size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ============================================================
          MODALS
          ============================================================ */}
      <CreateHabitModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        initialDate={currentActiveView === 'today' ? formatAPIDate(selectedDate) : null}
      />

      <LogHabitModal
        open={!!logHabit}
        onClose={() => setLogHabit(null)}
        habit={logHabit}
        onLogged={handleHabitLogged}
      />

      <HabitDetailDrawer
        open={!!detailHabit}
        onClose={() => setDetailHabit(null)}
        habit={detailHabit}
        onLogged={handleHabitLogged}
      />

      <EditHabitModal
        open={!!editHabit}
        onClose={() => setEditHabit(null)}
        habit={editHabit}
      />

      <ConfirmDialog
        open={showBulkDeleteConfirm}
        onOpenChange={setShowBulkDeleteConfirm}
        title={t('habits.bulkDeleteTitle')}
        description={plural(
          t('habits.bulkDeleteMessage', { count: selectedCount }),
          selectedCount,
        )}
        confirmLabel={t('habits.bulkDeleteConfirm')}
        onConfirm={confirmBulkDelete}
        variant="danger"
      />

      <ConfirmDialog
        open={showBulkLogConfirm}
        onOpenChange={setShowBulkLogConfirm}
        title={t('habits.bulkLogTitle')}
        description={plural(
          t('habits.bulkLogMessage', { count: selectedCount }),
          selectedCount,
        )}
        confirmLabel={t('habits.bulkLogConfirm')}
        onConfirm={confirmBulkLog}
        variant="success"
      />

      <ConfirmDialog
        open={showBulkSkipConfirm}
        onOpenChange={setShowBulkSkipConfirm}
        title={t('habits.bulkSkipTitle')}
        description={plural(
          t('habits.bulkSkipMessage', { count: selectedCount }),
          selectedCount,
        )}
        confirmLabel={t('habits.bulkSkipConfirm')}
        onConfirm={confirmBulkSkip}
        variant="warning"
      />

      <ConfirmDialog
        open={showHabitDeleteConfirm}
        onOpenChange={(open) => {
          setShowHabitDeleteConfirm(open)
          if (!open) setHabitPendingDelete(null)
        }}
        title={t('habits.deleteConfirmTitle')}
        description={t('habits.deleteConfirmMessage')}
        confirmLabel={t('common.delete')}
        onConfirm={confirmHabitDelete}
        variant="danger"
      />

      <CreateGoalModal
        open={showCreateGoalModal}
        onClose={() => setShowCreateGoalModal(false)}
      />
    </View>
  )
}

// ---------------------------------------------------------------------------
// Styles - pixel-accurate match with web CSS
// ---------------------------------------------------------------------------

function createStyles(colors: ReturnType<typeof createColors>) {
  return StyleSheet.create({
  // Layout
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20, // --app-px: 1.25rem = 20px
    paddingBottom: 120,
  },
  scrollContentWithBulkBar: {
    paddingBottom: 220,
  },

  // Header: pt-8 pb-2 = 32px/8px
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 32,
    paddingBottom: 8,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  // Logo: size-10 = 40px
  logoIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: {
    width: 34,
    height: 34,
  },
  // text-[length:var(--text-fluid-xl)] = 18-24px, font-extrabold
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(251,191,36,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  streakText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fbbf24',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
  },

  // Tabs: pt-4 = 16px
  tabsWrapper: {
    paddingTop: 16,
  },
  // bg-surface-ground rounded-[var(--radius-lg)] p-1 gap-1
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceGround,
    borderRadius: radius.lg,
    padding: 4,
    gap: 4,
  },
  // flex-1 text-center py-2 text-sm font-bold rounded-[var(--radius-md)]
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  // text-primary bg-surface shadow-[var(--shadow-sm)]
  tabActive: {
    backgroundColor: colors.surface,
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.4,
          shadowRadius: 3,
        }
      : { elevation: 2 }),
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.primary,
  },

  // Section container
  section: {
    paddingTop: 8,
  },

  // Date navigation: pt-4 pb-4 = 16px each
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingTop: 16,
    paddingBottom: 16,
  },
  // size-9 = 36px rounded-full bg-surface
  dateNavButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // min-w-40 = 160px, text-base font-semibold
  dateLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    minWidth: 160,
    textAlign: 'center',
  },
  dateLabelToday: {
    color: colors.primary,
  },

  // AI Summary card - matches web's summary card
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primary_30,
    padding: 16,
    marginBottom: 8,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  summaryText: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },

  // Habits section
  habitsSection: {
    paddingTop: 4,
  },

  // Search bar: pt-3 pb-2 = 12px/8px
  searchWrapper: {
    paddingTop: 12,
    paddingBottom: 8,
  },
  // rounded-full py-3 pl-12 pr-12 bg-surface border border-border
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    paddingLeft: 44,
    paddingRight: 44,
  },
  searchIcon: {
    position: 'absolute',
    left: 20,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
    padding: 0,
  },
  searchClear: {
    position: 'absolute',
    right: 12,
    padding: 8,
  },

  // Filter chips row: pb-2 = 8px
  filtersWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 8,
    gap: 8,
  },
  filtersContent: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 8,
  },
  // px-4 py-2 rounded-full text-xs font-semibold
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textFaded,
  },
  filterChipTextActive: {
    color: '#fff',
  },
  // Divider between frequency and tag chips
  filterDivider: {
    width: 1,
    height: 24,
    backgroundColor: colors.border,
    alignSelf: 'center',
  },
  tagDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  // Controls (3-dot) button
  controlsButton: {
    padding: 8,
    borderRadius: radius.xl,
  },
  controlsMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  controlsMenuLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  rotatingIcon: {
    transform: [{ rotate: '180deg' }],
  },
  bulkActionBar: {
    position: 'absolute',
    left: 20,
    right: 20,
    zIndex: 20,
    backgroundColor: colors.surfaceOverlay,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderRadius: radius.xl,
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...shadows.lg,
    elevation: 12,
  },
  bulkSelectionText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 10,
  },
  bulkActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bulkActionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bulkActionButtonDisabled: {
    opacity: 0.45,
  },
  bulkDivider: {
    width: 1,
    height: 20,
    backgroundColor: colors.border,
    marginHorizontal: 2,
  },

  // Habit card - matches web .habit-card-parent
  habitCard: {
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 10,
    // Glass surface with gradient effect
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    // Shadow matching .habit-card-parent box-shadow
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.4,
          shadowRadius: 8,
        }
      : { elevation: 4 }),
  },
  habitCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },

  // Log button - matches web .log-btn + size-10 sm:size-11
  logButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.borderEmphasis,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // .log-btn-done gradient
  logButtonDone: {
    backgroundColor: colors.primary,
    borderColor: 'transparent',
    // Glow shadow matching .log-btn-done
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: colors.primary,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.4,
          shadowRadius: 16,
        }
      : { elevation: 6 }),
  },
  logButtonOverdue: {
    borderColor: 'rgba(239,68,68,0.2)',
  },

  // Content area
  habitContent: {
    flex: 1,
    minWidth: 0,
  },
  // font-bold text-text-primary text-sm sm:text-base
  habitTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  habitTitleDone: {
    textDecorationLine: 'line-through',
    textDecorationColor: 'rgba(122,116,144,0.4)',
  },
  // text-text-muted text-[11px] sm:text-xs
  habitDescription: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },

  // Badges row: flex items-center gap-1.5 mt-1.5 flex-wrap
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  // text-[10px] font-semibold uppercase tracking-widest text-text-muted/70
  frequencyLabel: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    color: 'rgba(122,116,144,0.7)',
  },
  // Due time: text-[10px] font-medium text-text-secondary
  dueTimeText: {
    fontSize: 10,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  // Badge styles: px-2 py-0.5 rounded-full text-[9px] font-bold
  badgeOverdue: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: 'rgba(239,68,68,0.1)',
  },
  badgeOverdueText: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: '#ef4444',
  },
  badgeBadHabit: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.1)',
  },
  badgeBadHabitText: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: '#f87171',
  },
  badgeTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  badgeTagText: {
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.95)',
  },
  badgePrimary: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: colors.primary_10,
    borderWidth: 1,
    borderColor: colors.primary_20,
  },
  badgePrimaryText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.primary,
  },
  badgeStreak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: 'rgba(251,191,36,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.1)',
  },
  badgeStreakText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#fbbf24',
  },
  badgeChecklist: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  badgeChecklistText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textSecondary,
  },

  // Drill icon (3-dot) on card right
  drillIcon: {
    padding: 8,
  },

  // Habit list container: space-y-2.5 = 10px gap via marginBottom on cards
  habitListContainer: {
    paddingTop: 8,
  },

  // Loading / Skeleton
  loadingContainer: {
    paddingTop: 8,
    gap: 12,
  },
  skeletonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    padding: 16,
  },
  skeletonCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceElevated,
  },
  skeletonContent: {
    flex: 1,
    gap: 10,
  },
  skeletonLine1: {
    height: 16,
    width: '75%',
    borderRadius: 8,
    backgroundColor: colors.surfaceElevated,
  },
  skeletonLine2: {
    height: 12,
    width: '40%',
    borderRadius: 8,
    backgroundColor: colors.surfaceElevated,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  })
}

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ScrollView,
  Modal,
  Platform,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  Plus,
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
  format,
} from 'date-fns'
import { enUS, ptBR } from 'date-fns/locale'
import { useTranslation } from 'react-i18next'
import { formatAPIDate } from '@orbit/shared/utils'
import type { HabitsFilter, NormalizedHabit } from '@orbit/shared/types/habit'
import { useProfile } from '@/hooks/use-profile'
import {
  useHabits,
  useBulkDeleteHabits,
  useBulkLogHabits,
  useBulkSkipHabits,
  useTotalHabitCount,
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
import { StreakBadge } from '@/components/gamification/streak-badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { TrialBanner } from '@/components/ui/trial-banner'
import { NotificationBell } from '@/components/navigation/notification-bell'
import { colors, radius, shadows } from '@/lib/theme'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TAB_VIEWS = ['today', 'all', 'general', 'goals'] as const

type FreqKey = 'Day' | 'Week' | 'Month' | 'Year' | 'none'

function ControlsMenu({
  open,
  isSelectMode,
  showCompleted,
  isFetching,
  allCollapsed,
  onToggleSelectMode,
  onToggleCollapse,
  onRefresh,
  onToggleCompleted,
  onClose,
}: {
  open: boolean
  isSelectMode: boolean
  showCompleted: boolean
  isFetching: boolean
  allCollapsed: boolean
  onToggleSelectMode: () => void
  onToggleCollapse: () => void
  onRefresh: () => void
  onToggleCompleted: () => void
  onClose: () => void
}) {
  const { t } = useTranslation()

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.controlsMenuBackdrop}
        activeOpacity={1}
        onPress={onClose}
      >
        <View
          style={styles.controlsMenuPanel}
          onStartShouldSetResponder={() => true}
        >
          <TouchableOpacity
            style={styles.controlsMenuItem}
            onPress={onToggleSelectMode}
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
            onPress={onToggleCollapse}
            activeOpacity={0.75}
          >
            {allCollapsed ? (
              <ChevronsUpDown size={16} color={colors.textMuted} />
            ) : (
              <ChevronsDownUp size={16} color={colors.textMuted} />
            )}
            <Text style={styles.controlsMenuLabel}>
              {allCollapsed ? t('habits.expandAll') : t('habits.collapseAll')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.controlsMenuItem}
            onPress={onRefresh}
            activeOpacity={0.75}
          >
            <RefreshCw
              size={16}
              color={colors.textMuted}
              style={isFetching ? styles.rotatingIcon : undefined}
            />
            <Text style={styles.controlsMenuLabel}>
              {t('habits.refresh')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.controlsMenuItem}
            onPress={onToggleCompleted}
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
        </View>
      </TouchableOpacity>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Today Screen
// ---------------------------------------------------------------------------

export default function TodayScreen() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const dateFnsLocale = locale === 'pt-BR' ? ptBR : enUS
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { date } = useLocalSearchParams<{ date?: string | string[] }>()

  const { profile } = useProfile()
  const { data: streakInfo } = useStreakInfo()
  const { tags } = useTags()
  const totalHabitCount = useTotalHabitCount()
  const bulkDeleteHabits = useBulkDeleteHabits()
  const bulkLogHabits = useBulkLogHabits()
  const bulkSkipHabits = useBulkSkipHabits()

  // UI Store
  const selectedDateStr = useUIStore((s) => s.selectedDate)
  const setSelectedDate = useUIStore((s) => s.setSelectedDate)
  const activeView = useUIStore((s) => s.activeView)
  const setActiveView = useUIStore((s) => s.setActiveView)
  const searchQueryStore = useUIStore((s) => s.searchQuery)
  const setSearchQueryStore = useUIStore((s) => s.setSearchQuery)
  const isSelectMode = useUIStore((s) => s.isSelectMode)
  const selectedHabitIds = useUIStore((s) => s.selectedHabitIds)
  const toggleSelectMode = useUIStore((s) => s.toggleSelectMode)
  const selectAllHabits = useUIStore((s) => s.selectAllHabits)
  const clearSelection = useUIStore((s) => s.clearSelection)

  // Local state
  const [searchQuery, setLocalSearchQuery] = useState(searchQueryStore)
  const [showGeneralOnToday, setShowGeneralOnToday] = useState(true)
  const [showCompleted, setShowCompleted] = useState(false)
  const [selectedFrequency, setSelectedFrequency] = useState<FreqKey | null>(null)
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [showControlsMenu, setShowControlsMenu] = useState(false)
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)
  const [showBulkLogConfirm, setShowBulkLogConfirm] = useState(false)
  const [showBulkSkipConfirm, setShowBulkSkipConfirm] = useState(false)
  const searchDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const habitListRef = useRef<HabitListHandle>(null)

  // Modal state
  const [logHabit, setLogHabit] = useState<NormalizedHabit | null>(null)
  const [detailHabit, setDetailHabit] = useState<NormalizedHabit | null>(null)
  const [editHabit, setEditHabit] = useState<NormalizedHabit | null>(null)

  const selectedDate = useMemo(
    () => new Date(selectedDateStr + 'T00:00:00'),
    [selectedDateStr],
  )

  useEffect(() => {
    AsyncStorage.getItem('orbit_show_general_on_today')
      .then((storedValue) => {
        setShowGeneralOnToday(storedValue !== 'false')
      })
      .catch(() => {
        setShowGeneralOnToday(true)
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

  // Date navigation
  const goToPreviousDay = useCallback(() => {
    setSelectedDate(formatAPIDate(subDays(selectedDate, 1)))
  }, [selectedDate, setSelectedDate])

  const goToNextDay = useCallback(() => {
    setSelectedDate(formatAPIDate(addDays(selectedDate, 1)))
  }, [selectedDate, setSelectedDate])

  const goToToday = useCallback(() => {
    setSelectedDate(formatAPIDate(new Date()))
    setActiveView('today')
  }, [setSelectedDate, setActiveView])

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
    if (searchDebounceTimer.current) clearTimeout(searchDebounceTimer.current)
    searchDebounceTimer.current = setTimeout(() => {
      setSearchQueryStore(searchQuery)
    }, 300)
    return () => {
      if (searchDebounceTimer.current) clearTimeout(searchDebounceTimer.current)
    }
  }, [searchQuery, setSearchQueryStore])

  // Tag filter toggle
  const toggleTagFilter = useCallback((tagId: string) => {
    setSelectedTagIds((prev) => {
      const idx = prev.indexOf(tagId)
      if (idx >= 0) return prev.filter((id) => id !== tagId)
      return [...prev, tagId]
    })
  }, [])

  // Build filters (matching web exactly)
  const dateStr = formatAPIDate(selectedDate)
  const filters = useMemo<HabitsFilter>(() => {
    if (activeView === 'general') {
      const f: HabitsFilter = { isGeneral: true }
      if (searchQueryStore.trim()) f.search = searchQueryStore.trim()
      if (selectedTagIds.length > 0) f.tagIds = selectedTagIds
      return f
    }
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
  }, [activeView, dateStr, selectedDate, searchQueryStore, selectedFrequency, selectedTagIds, showGeneralOnToday])

  const habitsQuery = useHabits(filters)

  const visibleTopLevelHabits = useMemo(() => {
    const habits = habitsQuery.data?.topLevelHabits ?? []
    if (showCompleted) return habits
    return habits.filter((habit) => !habit.isCompleted)
  }, [habitsQuery.data?.topLevelHabits, showCompleted])

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

  const allSelected =
    visibleHabitIds.size > 0 &&
    Array.from(visibleHabitIds).every((id) => selectedHabitIds.has(id))

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
    activeView === 'today' &&
    isToday(selectedDate) &&
    profile?.hasProAccess &&
    profile?.aiSummaryEnabled

  // Clear filters on view change
  useEffect(() => {
    setSelectedFrequency(null)
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

  const handleSelectAll = useCallback(() => {
    selectAllHabits(Array.from(visibleHabitIds))
  }, [selectAllHabits, visibleHabitIds])

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

  const confirmBulkDelete = useCallback(async () => {
    const ids = Array.from(selectedHabitIds)
    if (ids.length === 0) return
    try {
      await bulkDeleteHabits.mutateAsync(ids)
    } finally {
      clearSelection()
      setShowBulkDeleteConfirm(false)
    }
  }, [bulkDeleteHabits, clearSelection, selectedHabitIds])

  const confirmBulkLog = useCallback(async () => {
    const ids = Array.from(selectedHabitIds)
    if (ids.length === 0) return
    try {
      await bulkLogHabits.mutateAsync(ids.map((habitId) => ({ habitId })))
    } finally {
      clearSelection()
      setShowBulkLogConfirm(false)
    }
  }, [bulkLogHabits, clearSelection, selectedHabitIds])

  const confirmBulkSkip = useCallback(async () => {
    const ids = Array.from(selectedHabitIds)
    if (ids.length === 0) return
    try {
      await bulkSkipHabits.mutateAsync(ids.map((habitId) => ({ habitId })))
    } finally {
      clearSelection()
      setShowBulkSkipConfirm(false)
    }
  }, [bulkSkipHabits, clearSelection, selectedHabitIds])

  const currentStreak = streakInfo?.currentStreak ?? 0
  const handleHabitLogged = useCallback((habitId: string) => {
    habitListRef.current?.markRecentlyCompleted(habitId)
    habitListRef.current?.checkAndPromptParentLog(habitId)
  }, [])

  return (
    <View style={[styles.safeArea, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Trial banner */}
        <TrialBanner />

        {/* ============================================================
            HEADER: Orbit logo + streak badge + avatar
            Matches: <header className="flex items-center justify-between pt-8 pb-2">
            ============================================================ */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.logoRow}
            onPress={goToToday}
            activeOpacity={0.8}
          >
            <View style={styles.logoIcon}>
              <Text style={styles.logoIconText}>O</Text>
            </View>
            <Text style={styles.headerTitle}>Orbit</Text>
          </TouchableOpacity>

          <View style={styles.headerRight}>
            <ThemeToggle />
            <StreakBadge streak={currentStreak} />
            <NotificationBell />
          </View>
        </View>

        {/* ============================================================
            TABS: Today / All / General / Goals
            Matches: flex bg-surface-ground rounded-[var(--radius-lg)] p-1 gap-1
            ============================================================ */}
        <View style={styles.tabsWrapper}>
          <View style={styles.tabsRow}>
            {TAB_VIEWS.map((view) => (
              <TouchableOpacity
                key={view}
                style={[styles.tab, activeView === view && styles.tabActive]}
                onPress={() => setActiveView(view)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.tabText,
                    activeView === view && styles.tabTextActive,
                  ]}
                >
                  {view === 'today'
                    ? t('habits.viewToday')
                    : view === 'all'
                      ? t('habits.viewAll')
                      : view === 'general'
                        ? t('habits.viewGeneral')
                        : t('goals.tab')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ============================================================
            GOALS VIEW
            ============================================================ */}
        {activeView === 'goals' && (
          <GoalsView />
        )}

        {/* ============================================================
            DATE NAVIGATION (today view only)
            Matches: flex items-center justify-center gap-4
            ============================================================ */}
        {activeView === 'today' && (
          <View style={styles.dateNav}>
            <TouchableOpacity
              style={styles.dateNavButton}
              onPress={goToPreviousDay}
              activeOpacity={0.7}
            >
              <ChevronLeft size={20} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={goToToday} activeOpacity={0.7}>
              <Text
                style={[
                  styles.dateLabel,
                  isToday(selectedDate) && styles.dateLabelToday,
                ]}
              >
                {dateLabel}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.dateNavButton}
              onPress={goToNextDay}
              activeOpacity={0.7}
            >
              <ChevronRight size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        )}

        {/* ============================================================
            AI SUMMARY CARD
            Matches web: bg-surface border border-primary/30 rounded-2xl p-4
            ============================================================ */}
        {showSummary ? (
          <HabitSummaryCard date={dateStr} />
        ) : null}

        {/* ============================================================
            HABITS CONTENT (hidden on goals tab)
            ============================================================ */}
        {activeView !== 'goals' && (
          <View style={styles.habitsSection}>
            {/* Search bar - matches web: rounded-full py-3 pl-12 pr-12 */}
            <View style={styles.searchWrapper}>
              <View style={styles.searchContainer}>
                <Search size={18} color={colors.textMuted} style={styles.searchIcon} />
                <TextInput
                  style={styles.searchInput}
                  value={searchQuery}
                  onChangeText={setLocalSearchQuery}
                  placeholder={t('habits.searchPlaceholder')}
                  placeholderTextColor={colors.textMuted}
                  returnKeyType="search"
                  selectionColor={colors.primary}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setLocalSearchQuery('')}
                    style={styles.searchClear}
                  >
                    <X size={16} color={colors.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Filter chips row - matches web filter chips */}
            <View style={styles.filtersWrapper}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filtersContent}
              >
                {/* Frequency chips (hidden in general view) */}
                {activeView !== 'general' && (
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
                )}

                {/* Tag divider */}
                {activeView !== 'general' && tags.length > 0 && (
                  <View style={styles.filterDivider} />
                )}

                {/* Tag chips */}
                {tags.map((tag) => (
                  <TouchableOpacity
                    key={tag.id}
                    style={[
                      styles.filterChip,
                      selectedTagIds.includes(tag.id)
                        ? { backgroundColor: tag.color, borderColor: tag.color }
                        : {},
                    ]}
                    onPress={() => toggleTagFilter(tag.id)}
                    activeOpacity={0.7}
                  >
                    {!selectedTagIds.includes(tag.id) && (
                      <View
                        style={[styles.tagDot, { backgroundColor: tag.color }]}
                      />
                    )}
                    <Text
                      style={[
                        styles.filterChipText,
                        selectedTagIds.includes(tag.id) && { color: '#fff' },
                      ]}
                    >
                      {tag.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Controls menu (three dots) */}
              <TouchableOpacity
                style={styles.controlsButton}
                activeOpacity={0.7}
                onPress={() => setShowControlsMenu((prev) => !prev)}
              >
                <MoreVertical size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ControlsMenu
              open={showControlsMenu}
              isSelectMode={isSelectMode}
              showCompleted={showCompleted}
              isFetching={habitsQuery.isFetching}
              allCollapsed={!!habitListRef.current?.allCollapsed}
              onToggleSelectMode={handleToggleSelectMode}
              onToggleCollapse={handleToggleCollapse}
              onRefresh={handleRefresh}
              onToggleCompleted={() => setShowCompleted((prev) => !prev)}
              onClose={() => setShowControlsMenu(false)}
            />

            {isSelectMode && (
              <View
                style={[
                  styles.bulkActionBar,
                  { bottom: 20 + insets.bottom },
                ]}
              >
                <Text style={styles.bulkSelectionText}>
                  {t('common.selected', { n: selectedCount })}
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

            {/* Habit list (using HabitList component with all handlers wired) */}
            <HabitList
              ref={habitListRef}
              view={activeView}
              filters={filters}
              selectedDate={activeView === 'today' ? selectedDate : undefined}
              showCompleted={showCompleted}
              searchQuery={searchQueryStore}
              isSelectMode={isSelectMode}
              selectedHabitIds={selectedHabitIds}
              scrollEnabled={false}
              onCreatePress={() => setShowCreateModal(true)}
              onSeeUpcoming={goToNextDay}
              onLogHabit={setLogHabit}
              onDetailHabit={setDetailHabit}
            />
          </View>
        )}
      </ScrollView>

      {/* ============================================================
          FAB - floating action button matching web create button
          ============================================================ */}
      {activeView === 'goals' ? (
        <TouchableOpacity
          style={[
            styles.fab,
            { bottom: 24 + insets.bottom },
          ]}
          activeOpacity={0.8}
          onPress={() => setShowCreateGoalModal(true)}
        >
          <Plus size={24} color="#fff" />
        </TouchableOpacity>
      ) : (
        !isSelectMode && (
          <TouchableOpacity
            style={[
              styles.fab,
              { bottom: 24 + insets.bottom },
            ]}
            activeOpacity={0.8}
            onPress={() => {
              if (!(profile?.hasProAccess ?? false) && totalHabitCount >= 10) {
                router.push('/upgrade')
                return
              }
              setShowCreateModal(true)
            }}
          >
            <Plus size={24} color="#fff" />
          </TouchableOpacity>
        )
      )}

      {/* ============================================================
          MODALS
          ============================================================ */}
      <CreateHabitModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        initialDate={activeView === 'today' ? formatAPIDate(selectedDate) : null}
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
        onEdit={(habitId) => {
          const habit = detailHabit?.id === habitId ? detailHabit : null
          setDetailHabit(null)
          if (habit) setEditHabit(habit)
        }}
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
        description={t('habits.bulkDeleteMessage', { count: selectedCount })}
        confirmLabel={t('habits.bulkDeleteConfirm')}
        onConfirm={confirmBulkDelete}
        variant="danger"
      />

      <ConfirmDialog
        open={showBulkLogConfirm}
        onOpenChange={setShowBulkLogConfirm}
        title={t('habits.bulkLogTitle')}
        description={t('habits.bulkLogMessage', { count: selectedCount })}
        confirmLabel={t('habits.bulkLogConfirm')}
        onConfirm={confirmBulkLog}
        variant="success"
      />

      <ConfirmDialog
        open={showBulkSkipConfirm}
        onOpenChange={setShowBulkSkipConfirm}
        title={t('habits.bulkSkipTitle')}
        description={t('habits.bulkSkipMessage', { count: selectedCount })}
        confirmLabel={t('habits.bulkSkipConfirm')}
        onConfirm={confirmBulkSkip}
        variant="warning"
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

const styles = StyleSheet.create({
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
    borderRadius: 20,
    backgroundColor: 'rgba(139,92,246,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoIconText: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.primary,
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
    borderColor: 'rgba(139,92,246,0.3)',
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
  controlsMenuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    paddingTop: 120,
    paddingRight: 16,
    alignItems: 'flex-end',
  },
  controlsMenuPanel: {
    minWidth: 210,
    backgroundColor: colors.surfaceOverlay,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    padding: 6,
    ...shadows.lg,
    elevation: 12,
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
    backgroundColor: 'rgba(139,92,246,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.1)',
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
    backgroundColor: 'rgba(26,24,41,0.6)',
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
    borderColor: 'rgba(255,255,255,0.06)',
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
    backgroundColor: 'rgba(26,24,41,0.6)',
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

  // FAB: matches web's primary button
  fab: {
    position: 'absolute',
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    // Glow shadow matching --shadow-glow
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: colors.primary,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 12,
        }
      : { elevation: 8 }),
  },
})

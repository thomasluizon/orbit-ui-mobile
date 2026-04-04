import { useState, useMemo, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Image,
} from 'react-native'
import {
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  Plus,
  Eye,
  EyeOff,
  Sparkles,
} from 'lucide-react-native'
import {
  addDays,
  subDays,
  isToday,
  isYesterday,
  isTomorrow,
  format,
} from 'date-fns'
import { formatAPIDate } from '@orbit/shared/utils'
import type { HabitsFilter } from '@orbit/shared/types/habit'
import { useProfile } from '@/hooks/use-profile'
import { useHabits, useLogHabit, useSkipHabit, useDailySummary } from '@/hooks/use-habits'
import { useGoals } from '@/hooks/use-goals'
import { HabitCard } from '@/components/habit-card'
import { GoalCard } from '@/components/goal-card'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TAB_VIEWS = ['today', 'all', 'general', 'goals'] as const
type ViewTab = (typeof TAB_VIEWS)[number]

const colors = {
  primary: '#8b5cf6',
  background: '#07060e',
  surfaceGround: '#0d0b16',
  surface: '#13111f',
  surfaceElevated: '#1a1829',
  border: 'rgba(255,255,255,0.07)',
  borderMuted: 'rgba(255,255,255,0.04)',
  textPrimary: '#f0eef6',
  textSecondary: '#9b95ad',
  textMuted: '#7a7490',
}

// ---------------------------------------------------------------------------
// Today Screen
// ---------------------------------------------------------------------------

export default function TodayScreen() {
  const { profile } = useProfile()

  // State
  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const [activeView, setActiveView] = useState<ViewTab>('today')
  const [searchQuery, setSearchQuery] = useState('')
  const [showCompleted, setShowCompleted] = useState(false)

  const dateStr = formatAPIDate(selectedDate)

  // Date navigation
  const goToPreviousDay = useCallback(() => {
    setSelectedDate((d) => subDays(d, 1))
  }, [])

  const goToNextDay = useCallback(() => {
    setSelectedDate((d) => addDays(d, 1))
  }, [])

  const goToToday = useCallback(() => {
    setSelectedDate(new Date())
    setActiveView('today')
  }, [])

  const dateLabel = useMemo(() => {
    if (isToday(selectedDate)) return 'Today'
    if (isYesterday(selectedDate)) return 'Yesterday'
    if (isTomorrow(selectedDate)) return 'Tomorrow'
    return format(selectedDate, 'MMM dd, yyyy')
  }, [selectedDate])

  // Build filters
  const filters = useMemo<HabitsFilter>(() => {
    const base: HabitsFilter = {}
    if (searchQuery.trim()) base.search = searchQuery.trim()

    if (activeView === 'general') {
      return { ...base, isGeneral: true }
    }
    if (activeView === 'today') {
      return {
        ...base,
        dateFrom: dateStr,
        dateTo: dateStr,
        includeOverdue: isToday(selectedDate),
        includeGeneral: true,
      }
    }
    // 'all' view
    return base
  }, [activeView, dateStr, selectedDate, searchQuery])

  // Data
  const { habits, isLoading, refetch } = useHabits(filters)
  const { goals, isLoading: goalsLoading } = useGoals('Active')
  const logMutation = useLogHabit()
  const skipMutation = useSkipHabit()

  // AI Summary
  const showSummary =
    activeView === 'today' &&
    isToday(selectedDate) &&
    profile?.hasProAccess &&
    profile?.aiSummaryEnabled
  const { data: summaryData } = useDailySummary(dateStr, !!showSummary)

  // Filter completed
  const visibleHabits = useMemo(() => {
    if (showCompleted) return habits
    return habits.filter((h) => {
      const instance = h.instances?.find((i) => i.date === dateStr)
      return instance?.status !== 'Completed'
    })
  }, [habits, showCompleted, dateStr])

  const handleLog = useCallback(
    (habitId: string) => {
      logMutation.mutate({ habitId, date: dateStr })
    },
    [logMutation, dateStr],
  )

  const handleSkip = useCallback(
    (habitId: string) => {
      skipMutation.mutate({ habitId, date: dateStr })
    },
    [skipMutation, dateStr],
  )

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.logoRow}
            onPress={goToToday}
            activeOpacity={0.8}
          >
            <View style={styles.logoPlaceholder}>
              <Text style={styles.logoText}>O</Text>
            </View>
            <Text style={styles.headerTitle}>Orbit</Text>
          </TouchableOpacity>
        </View>

        {/* View tabs */}
        <View style={styles.tabsContainer}>
          <View style={styles.tabsRow}>
            {TAB_VIEWS.map((view) => (
              <TouchableOpacity
                key={view}
                style={[
                  styles.tab,
                  activeView === view && styles.tabActive,
                ]}
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
                    ? 'Today'
                    : view === 'all'
                      ? 'All'
                      : view === 'general'
                        ? 'General'
                        : 'Goals'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Goals view */}
        {activeView === 'goals' && (
          <View style={styles.section}>
            {goalsLoading ? (
              <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>Loading goals...</Text>
              </View>
            ) : goals.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No goals yet</Text>
                <Text style={styles.emptySubtitle}>
                  Create a goal to track your long-term progress
                </Text>
              </View>
            ) : (
              goals.map((goal) => (
                <GoalCard key={goal.id} goal={goal} />
              ))
            )}
          </View>
        )}

        {/* Date navigation (today view only) */}
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

        {/* AI Summary card */}
        {showSummary && summaryData?.summary && (
          <View style={styles.summaryCard}>
            <View style={styles.summaryHeader}>
              <Sparkles size={16} color={colors.primary} />
              <Text style={styles.summaryTitle}>AI Summary</Text>
            </View>
            <Text style={styles.summaryText}>{summaryData.summary}</Text>
          </View>
        )}

        {/* Habits content (hidden on goals tab) */}
        {activeView !== 'goals' && (
          <View style={styles.section}>
            {/* Search bar */}
            <View style={styles.searchContainer}>
              <Search size={18} color={colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search habits..."
                placeholderTextColor={colors.textMuted}
                returnKeyType="search"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <X size={16} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>

            {/* Controls row */}
            <View style={styles.controlsRow}>
              <TouchableOpacity
                style={[
                  styles.toggleButton,
                  showCompleted && styles.toggleButtonActive,
                ]}
                onPress={() => setShowCompleted(!showCompleted)}
                activeOpacity={0.7}
              >
                {showCompleted ? (
                  <Eye size={12} color="#fff" />
                ) : (
                  <EyeOff size={12} color={colors.textMuted} />
                )}
                <Text
                  style={[
                    styles.toggleText,
                    showCompleted && styles.toggleTextActive,
                  ]}
                >
                  Completed
                </Text>
              </TouchableOpacity>
            </View>

            {/* Habit list */}
            {isLoading ? (
              <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>Loading habits...</Text>
              </View>
            ) : visibleHabits.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>
                  {searchQuery ? 'No habits found' : 'No habits yet'}
                </Text>
                <Text style={styles.emptySubtitle}>
                  {searchQuery
                    ? 'Try a different search term'
                    : 'Tap + to create your first habit'}
                </Text>
              </View>
            ) : (
              visibleHabits.map((habit) => {
                const instance = habit.instances?.find(
                  (i) => i.date === dateStr,
                )
                const isLogged = instance?.status === 'Completed'
                return (
                  <HabitCard
                    key={habit.id}
                    habit={habit}
                    dateStr={dateStr}
                    isLogged={isLogged}
                    onLog={handleLog}
                    onSkip={handleSkip}
                  />
                )
              })
            )}
          </View>
        )}
      </ScrollView>

      {/* FAB */}
      {activeView !== 'goals' && (
        <TouchableOpacity style={styles.fab} activeOpacity={0.8}>
          <Plus size={24} color="#fff" />
        </TouchableOpacity>
      )}
    </SafeAreaView>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    paddingBottom: 8,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${colors.primary}20`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.primary,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  tabsContainer: {
    paddingTop: 16,
  },
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceGround,
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: colors.surface,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.primary,
  },
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 16,
  },
  dateNavButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    minWidth: 140,
    textAlign: 'center',
  },
  dateLabelToday: {
    color: colors.primary,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: `${colors.primary}30`,
    padding: 16,
    marginBottom: 12,
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
  section: {
    paddingTop: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
    padding: 0,
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 8,
  },
  toggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  toggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },
  toggleTextActive: {
    color: '#fff',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textMuted,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
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
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
})

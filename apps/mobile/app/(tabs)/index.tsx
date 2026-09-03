import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Animated, StyleSheet, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useFocusEffect, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import {
  getTodayBoundary,
  parseShowGeneralOnTodayPreference,
} from '@orbit/shared/utils'
import type { HabitsFilter, NormalizedHabit } from '@orbit/shared/types/habit'
import { plural } from '@/lib/plural'
import { EMPTY_HABITS_BY_ID, useHabits } from '@/hooks/use-habits'
import { useUIStore } from '@/stores/ui-store'
import { HabitList, type HabitListHandle } from '@/components/habit-list'
import { SelectionTray } from '@/components/habits/selection-tray'
import { CapacityNotice } from '@/components/ui/capacity-notice'
import { TodayDateControl } from '@/components/today/today-date-control'
import { TodayModals } from '@/components/today/today-modals'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useTodayDate } from './use-today-date'
import { useTodaySelection } from './use-today-selection'
import { useShellComposerSlot } from '@/components/shell/shell-composer-slot'
import { TodayAstra } from '@/components/today/today-astra'
import { TrialBanner } from '@/components/ui/trial-banner'
import { useTodayDayMotion } from './use-today-motion'

function getBoundaryMessageKey(
  boundary: ReturnType<typeof getTodayBoundary>,
): 'habits.todayBoundary.lastLoggable' | 'habits.todayBoundary.readOnly' | 'habits.todayBoundary.future' | null {
  if (boundary === 'last-loggable') return 'habits.todayBoundary.lastLoggable'
  if (boundary === 'read-only') return 'habits.todayBoundary.readOnly'
  if (boundary === 'future') return 'habits.todayBoundary.future'
  return null
}

export default function TodayScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const date = useTodayDate()
  const [showGeneralOnToday, setShowGeneralOnToday] = useState(false)
  const [editHabit, setEditHabit] = useState<NormalizedHabit | null>(null)
  const [editHabitOnSaved, setEditHabitOnSaved] = useState<(() => void | Promise<void>) | null>(null)
  const [allLoadedIds, setAllLoadedIds] = useState<Set<string>>(() => new Set())
  const [habitListAllCollapsed, setHabitListAllCollapsed] = useState(false)
  const [todayFocused, setTodayFocused] = useState(false)
  const [listSurfaceOpen, setListSurfaceOpen] = useState(false)
  const habitListRef = useRef<HabitListHandle>(null)
  const [showCompleted, setShowCompleted] = useState(false)
  const isSelectMode = useUIStore((state) => state.isSelectMode)
  const selectedHabitIds = useUIStore((state) => state.selectedHabitIds)
  const showCreateModal = useUIStore((state) => state.showCreateModal)
  const setShowCreateModal = useUIStore((state) => state.setShowCreateModal)
  const showCreateGoalModal = useUIStore((state) => state.showCreateGoalModal)
  const setShowCreateGoalModal = useUIStore((state) => state.setShowCreateGoalModal)
  const setTodayFabHidden = useUIStore((state) => state.setTodayFabHidden)

  useEffect(() => {
    AsyncStorage.getItem('orbit_show_general_on_today')
      .then((value) => setShowGeneralOnToday(parseShowGeneralOnTodayPreference(value)))
      .catch(() => setShowGeneralOnToday(false))
  }, [])

  const filters = useMemo<HabitsFilter>(() => ({
    dateFrom: date.dateStr,
    dateTo: date.dateStr,
    includeOverdue: date.dateStr === date.today,
    includeGeneral: showGeneralOnToday || undefined,
  }), [date.dateStr, date.today, showGeneralOnToday])
  const habitsQuery = useHabits(filters)
  const habitsById = habitsQuery.data?.habitsById ?? EMPTY_HABITS_BY_ID
  const visibleHabitIds = useMemo(() => new Set(habitsById.keys()), [habitsById])
  const closeControlsMenu = useCallback(() => {}, [])
  const selection = useTodaySelection({
    selectedDateStr: date.dateStr,
    today: date.today,
    habitListRef,
    habitListAllLoadedIds: allLoadedIds,
    visibleHabitIds,
    habitsById,
    closeControlsMenu,
  })
  const clearSelection = selection.clearSelection
  const boundaryKey = getBoundaryMessageKey(getTodayBoundary(date.dateStr, date.today))
  const dayMotionStyle = useTodayDayMotion(date.dateStr)

  useFocusEffect(
    useCallback(() => {
      setTodayFocused(true)
      return () => {
        clearSelection()
        setTodayFocused(false)
      }
    }, [clearSelection]),
  )

  useEffect(() => {
    const hidden = isSelectMode || showCreateModal || editHabit !== null || listSurfaceOpen ||
      habitsQuery.isLoading || (habitsQuery.isError && !habitsQuery.data) ||
      Boolean(habitsQuery.data && habitsById.size === 0)
    setTodayFabHidden(hidden)
    return () => setTodayFabHidden(false)
  }, [
    editHabit,
    habitsById.size,
    habitsQuery.data,
    habitsQuery.isError,
    habitsQuery.isLoading,
    isSelectMode,
    listSurfaceOpen,
    setTodayFabHidden,
    showCreateModal,
  ])

  useShellComposerSlot(
    isSelectMode && todayFocused,
    (
      <View style={styles.selectionTray}>
        <SelectionTray
          count={selection.selectedCount}
          allSelected={selection.allSelected}
          onSelectAll={selection.handleSelectAll}
          onDeselectAll={selection.handleDeselectAll}
          onLog={selection.handleOpenBulkLog}
          onSkip={selection.handleOpenBulkSkip}
          onDelete={selection.handleOpenBulkDelete}
          onClose={clearSelection}
          countSuffixLabel={plural(t('common.selectedSuffix'), selection.selectedCount)}
          selectAllLabel={t('common.selectAll')}
          deselectAllLabel={t('common.deselectAll')}
          logLabel={t('habits.bulkBar.log')}
          skipLabel={t('habits.bulkBar.skip')}
          deleteLabel={t('habits.bulkBar.delete')}
          closeLabel={t('common.cancel')}
        />
      </View>
    ),
  )

  const listHeader = (
    <View style={styles.header}>
      {todayFocused ? (
        <TodayAstra
          isTodaySelected={date.dateStr === date.today}
          suppressed={isSelectMode || showCreateModal || editHabit !== null || listSurfaceOpen || habitsQuery.isFetching || (habitsQuery.isError && !habitsQuery.data) || habitsById.size === 0}
        />
      ) : null}
      <TodayDateControl
        dayName={date.dayName}
        numericDate={date.numericDate}
        isTodaySelected={date.dateStr === date.today}
        nextDisabled={date.nextDisabled}
        previousLabel={t('dates.previousDay')}
        todayLabel={t('dates.goToToday')}
        nextLabel={t('dates.nextDay')}
        moreLabel={t('habits.actions.more')}
        selectLabel={isSelectMode ? t('common.cancel') : t('common.select')}
        collapseLabel={habitListAllCollapsed ? t('habits.expandAll') : t('habits.collapseAll')}
        refreshLabel={t('habits.refresh')}
        completedLabel={showCompleted ? t('habits.hideCompleted') : t('habits.showCompleted')}
        isFetching={habitsQuery.isFetching}
        onToggleSelect={selection.handleToggleSelectMode}
        onToggleCollapse={() => {
          if (habitListAllCollapsed) habitListRef.current?.expandAll()
          else habitListRef.current?.collapseAll()
        }}
        onRefresh={() => void habitsQuery.refetch()}
        onToggleCompleted={() => setShowCompleted(!showCompleted)}
        onGoToPreviousDay={date.goToPreviousDay}
        onGoToToday={date.goToToday}
        onGoToNextDay={date.goToNextDay}
      />
      <TrialBanner />
      {boundaryKey ? (
        <View style={styles.notice}>
          <CapacityNotice message={t(boundaryKey)} />
        </View>
      ) : null}
    </View>
  )

  return (
    <View style={[styles.screen, { backgroundColor: tokens.bg }]}>
      <Animated.View style={[styles.dayTransition, dayMotionStyle]}>
        <HabitList
          ref={habitListRef}
          view="today"
          filters={filters}
          selectedDate={date.selectedDate}
          showCompleted={showCompleted}
          isSelectMode={isSelectMode}
          selectedHabitIds={selectedHabitIds}
          listHeader={listHeader}
          onCreatePress={() => setShowCreateModal(true)}
          onSeeUpcoming={date.nextDisabled ? undefined : date.goToNextDay}
          onDetailHabit={(habit) => router.push({
            pathname: '/habits/[id]',
            params: { id: habit.id, date: date.dateStr, from: 'today' },
          })}
          onEditHabit={(habit, onSaved) => {
            setEditHabit(habit)
            setEditHabitOnSaved(() => onSaved ?? null)
          }}
          onAllLoadedIdsChange={setAllLoadedIds}
          onAllCollapsedChange={setHabitListAllCollapsed}
          onSurfaceOpenChange={setListSurfaceOpen}
        />
      </Animated.View>

      <TodayModals
        showCreateModal={showCreateModal}
        onCloseCreateModal={() => setShowCreateModal(false)}
        createInitialDate={date.dateStr}
        editHabit={editHabit}
        editHabitParentIsGeneral={editHabit?.parentId ? (habitsById.get(editHabit.parentId)?.isGeneral ?? null) : null}
        onCloseEdit={() => {
          setEditHabit(null)
          setEditHabitOnSaved(null)
        }}
        editHabitOnSaved={editHabitOnSaved}
        showBulkDeleteConfirm={selection.showBulkDeleteConfirm}
        onBulkDeleteOpenChange={selection.setShowBulkDeleteConfirm}
        onConfirmBulkDelete={() => void selection.confirmBulkDelete()}
        selectedCount={selection.selectedCount}
        showCreateGoalModal={showCreateGoalModal}
        onCloseCreateGoal={() => setShowCreateGoalModal(false)}
        showReferral={false}
        onCloseReferral={() => {}}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  dayTransition: { flex: 1 },
  header: { gap: 24, paddingBottom: 24 },
  notice: { paddingHorizontal: 0 },
  selectionTray: { paddingHorizontal: 20, paddingVertical: 12 },
})

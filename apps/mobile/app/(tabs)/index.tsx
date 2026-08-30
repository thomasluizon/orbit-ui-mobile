import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import {
  getTodayBoundary,
  parseShowGeneralOnTodayPreference,
} from '@orbit/shared/utils'
import type { HabitsFilter, NormalizedHabit } from '@orbit/shared/types/habit'
import { plural } from '@/lib/plural'
import { useAdMob } from '@/hooks/use-ad-mob'
import { EMPTY_HABITS_BY_ID, useHabits } from '@/hooks/use-habits'
import { useUIStore } from '@/stores/ui-store'
import { HabitList, type HabitListHandle } from '@/components/habit-list'
import { BulkActionBarV2 } from '@/components/habits/bulk-action-bar-v2'
import { CapacityNotice } from '@/components/ui/capacity-notice'
import { TodayDateControl } from '@/components/today/today-shell'
import { TodayModals } from '@/components/today/today-modals'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useTodayDate } from './use-today-date'
import { useTodaySelection } from './use-today-selection'

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
  const insets = useSafeAreaInsets()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const { showInterstitialIfDue } = useAdMob()
  const date = useTodayDate()
  const [showGeneralOnToday, setShowGeneralOnToday] = useState(false)
  const [detailHabit, setDetailHabit] = useState<NormalizedHabit | null>(null)
  const [editHabit, setEditHabit] = useState<NormalizedHabit | null>(null)
  const [editHabitOnSaved, setEditHabitOnSaved] = useState<(() => void | Promise<void>) | null>(null)
  const [allLoadedIds, setAllLoadedIds] = useState<Set<string>>(() => new Set())
  const [habitListAllCollapsed, setHabitListAllCollapsed] = useState(false)
  const habitListRef = useRef<HabitListHandle>(null)
  const [showCompleted, setShowCompleted] = useState(false)
  const isSelectMode = useUIStore((state) => state.isSelectMode)
  const selectedHabitIds = useUIStore((state) => state.selectedHabitIds)
  const showCreateModal = useUIStore((state) => state.showCreateModal)
  const setShowCreateModal = useUIStore((state) => state.setShowCreateModal)
  const showCreateGoalModal = useUIStore((state) => state.showCreateGoalModal)
  const setShowCreateGoalModal = useUIStore((state) => state.setShowCreateGoalModal)

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
    closeControlsMenu,
  })
  const boundaryKey = getBoundaryMessageKey(getTodayBoundary(date.dateStr, date.today))
  const handleHabitLogged = useCallback((habitId: string) => {
    habitListRef.current?.markRecentlyCompleted(habitId)
    habitListRef.current?.checkAndPromptParentLog(habitId)
    void showInterstitialIfDue()
  }, [showInterstitialIfDue])

  const listHeader = (
    <>
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
      {boundaryKey ? (
        <View style={styles.notice}>
          <CapacityNotice message={t(boundaryKey)} />
        </View>
      ) : null}
    </>
  )

  return (
    <View style={[styles.screen, { backgroundColor: tokens.bg }]}>
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
        onDetailHabit={setDetailHabit}
        onEditHabit={(habit, onSaved) => {
          setEditHabit(habit)
          setEditHabitOnSaved(() => onSaved ?? null)
        }}
        onAllLoadedIdsChange={setAllLoadedIds}
        onAllCollapsedChange={setHabitListAllCollapsed}
      />

      {isSelectMode ? (
        <View style={[styles.bulkBar, { bottom: insets.bottom + 24 }]}>
          <BulkActionBarV2
            count={selection.selectedCount}
            allSelected={selection.allSelected}
            onSelectAll={selection.handleSelectAll}
            onDeselectAll={selection.handleDeselectAll}
            onLog={selection.handleOpenBulkLog}
            onSkip={selection.handleOpenBulkSkip}
            onDelete={selection.handleOpenBulkDelete}
            onClose={selection.clearSelection}
            countSuffixLabel={plural(t('common.selectedSuffix'), selection.selectedCount)}
            selectAllLabel={t('common.selectAll')}
            deselectAllLabel={t('common.deselectAll')}
            logLabel={t('habits.bulkBar.log')}
            skipLabel={t('habits.bulkBar.skip')}
            deleteLabel={t('habits.bulkBar.delete')}
            closeLabel={t('common.cancel')}
          />
        </View>
      ) : null}

      <TodayModals
        showCreateModal={showCreateModal}
        onCloseCreateModal={() => setShowCreateModal(false)}
        createInitialDate={date.dateStr}
        detailHabit={detailHabit}
        selectedDate={date.dateStr}
        onCloseDetail={() => setDetailHabit(null)}
        onHabitLogged={handleHabitLogged}
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
  notice: { paddingBottom: 16, paddingHorizontal: 16 },
  bulkBar: {
    left: 20,
    position: 'absolute',
    right: 20,
  },
})

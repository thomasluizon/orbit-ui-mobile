import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Animated, StyleSheet, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { getTodayBoundary } from '@orbit/shared/utils'
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
import { useTodayMotion } from './use-today-motion'
import { useProfile } from '@/hooks/use-profile'
import { ErrorState } from '@/components/ui/error-state'
import { PillButton } from '@/components/ui/pill-button'
import { Skeleton } from '@/components/ui/skeleton'
import { getAccountId, useAccountId } from '@/lib/account-scope'
import { readShowGeneralOnToday } from '@/lib/show-general-on-today-storage'

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
  const { profile, isError, refetch } = useProfile()
  if (!profile) {
    return isError
      ? <ErrorState message={t('common.error')} action={<PillButton variant="secondary" onClick={() => void refetch()}>{t('common.retry')}</PillButton>} />
      : <View style={[styles.screen, styles.profileLoading]} accessible accessibilityRole="progressbar" accessibilityLabel={t('profile.loading')} accessibilityState={{ busy: true }}>
          <Skeleton variant="settings" grouped />
          <Skeleton variant="habit-row" grouped />
          <Skeleton variant="habit-row" grouped />
          <Skeleton variant="habit-row" grouped />
        </View>
  }
  return <TodayScreenContent />
}

function TodayScreenContent() {
  const { t } = useTranslation()
  const router = useRouter()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const date = useTodayDate()
  const accountId = useAccountId()
  const [showGeneralOnToday, setShowGeneralOnToday] = useState(false)
  const [editHabit, setEditHabit] = useState<NormalizedHabit | null>(null)
  const [editHabitOnSaved, setEditHabitOnSaved] = useState<(() => void | Promise<void>) | null>(null)
  const [allLoadedIds, setAllLoadedIds] = useState<Set<string> | null>(null)
  const [habitListAllCollapsed, setHabitListAllCollapsed] = useState(false)
  const [todayFocused, setTodayFocused] = useState(false)
  const [listSurfaceOpen, setListSurfaceOpen] = useState(false)
  const habitListRef = useRef<HabitListHandle>(null)
  const [showCompleted, setShowCompleted] = useState(false)
  const isSelectMode = useUIStore((state) => state.isSelectMode)
  const selectedHabitIds = useUIStore((state) => state.selectedHabitIds)
  const showCreateModal = useUIStore((state) => state.showCreateModal)
  const setShowCreateModal = useUIStore((state) => state.setShowCreateModal)
  const setTodayFabHidden = useUIStore((state) => state.setTodayFabHidden)

  const filters = useMemo<HabitsFilter>(() => ({
    dateFrom: date.dateStr,
    dateTo: date.dateStr,
    includeOverdue: date.dateStr === date.today,
    includeGeneral: showGeneralOnToday || undefined,
  }), [date.dateStr, date.today, showGeneralOnToday])
  const habitsQuery = useHabits(filters)
  const habitsById = habitsQuery.data?.habitsById ?? EMPTY_HABITS_BY_ID
  const motion = useTodayMotion({
    filterMotionKey: date.dateStr,
    isRefetching: Boolean(habitsQuery.data && habitsQuery.isFetching),
  })
  const closeControlsMenu = useCallback(() => {}, [])
  const selection = useTodaySelection({
    selectedDateStr: date.dateStr,
    today: date.today,
    habitListRef,
    habitListAllLoadedIds: allLoadedIds,
    habitsById,
    closeControlsMenu,
  })
  const clearSelection = selection.clearSelection
  const boundaryKey = getBoundaryMessageKey(getTodayBoundary(date.dateStr, date.today))

  useFocusEffect(
    useCallback(() => {
      let active = true
      setShowGeneralOnToday(false)
      readShowGeneralOnToday()
        .then((saved) => {
          if (active && getAccountId() === accountId) setShowGeneralOnToday(saved)
        })
        .catch(() => {
          if (active && getAccountId() === accountId) setShowGeneralOnToday(false)
        })
      setTodayFocused(true)
      return () => {
        active = false
        clearSelection()
        setTodayFocused(false)
      }
    }, [accountId, clearSelection]),
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
    motion.renderBulkActionBar && todayFocused,
    (
      <Animated.View style={motion.bulkBarAnimatedStyle}>
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
            completionReadOnly={selection.completionReadOnly}
            completionReason={selection.completionReadOnly ? t('habits.todayBoundary.readOnly') : undefined}
          />
        </View>
      </Animated.View>
    ),
  )

  const listHeader = (
    <View style={styles.header}>
      {todayFocused ? (
        <TodayAstra
          isTodaySelected={date.dateStr === date.today}
          suppressed={isSelectMode || showCreateModal || editHabit !== null || listSurfaceOpen || habitsQuery.isFetching || (habitsQuery.isError && !habitsQuery.data)}
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
    <View testID="today-content-column" style={[styles.screen, { backgroundColor: tokens.bg }]}>
      <Animated.View style={[styles.listBand, motion.refetchAnimatedStyle]}>
        <Animated.View style={[styles.listBand, motion.dayAnimatedStyle]}>
          <HabitList
            ref={habitListRef}
            view="today"
            filters={filters}
            selectedDate={date.selectedDate}
            showCompleted={showCompleted}
            onShowCompleted={() => setShowCompleted(true)}
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
        showReferral={false}
        onCloseReferral={() => {}}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { alignSelf: 'center', flex: 1, maxWidth: 740, width: '100%' },
  profileLoading: { gap: 16, padding: 16 },
  listBand: { flex: 1 },
  header: { gap: 24, paddingBottom: 24 },
  notice: { paddingHorizontal: 0 },
  selectionTray: { paddingHorizontal: 16, paddingVertical: 12 },
})

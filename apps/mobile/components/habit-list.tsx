import { KeyboardAwareFlatList,KeyboardAwareScrollHost } from '@/components/ui/keyboard-aware-scroll-view'
import { HabitListMotionRow } from '@/components/motion/habit-list-row'
import { ContentFade } from '@/components/motion/content-fade'
import { TodayLaunchContent } from '@/components/today/today-launch-content'
import { SPACING } from '@orbit/shared/theme'
import { forwardRef,useCallback,useLayoutEffect,useMemo,useRef,type ReactElement,type RefObject } from 'react'
import { View,Text,RefreshControl } from 'react-native'
import DraggableFlatList,{ type RenderItemParams } from 'react-native-draggable-flatlist'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { canLogHabitOnDate,formatAPIDate,getAllDoneOnDate,type HabitResolution } from '@orbit/shared/utils'
import type { NormalizedHabit,HabitsFilter,BulkMoveHabitParentResult } from '@orbit/shared/types/habit'
import { useUIStore } from '@/stores/ui-store'
import { CreateHabitModal } from '@/components/habits/create-habit-modal'
import { RescheduleSheet } from '@/components/habits/reschedule-sheet'
import { HabitRow,type HabitRowProps } from '@/components/habits/habit-row'
import { Skeleton } from '@/components/ui/skeleton'
import { HabitListConfirmDialogs } from './habit-list/confirm-dialogs'
import { HabitListAllDone,HabitListEmptyState,HabitListFrequencyEmptyState,HabitListNothingOpen } from './habit-list/empty-state'
import { HabitDrill } from './habit-list/habit-drill'
import { MoveParentDialog } from './habit-list/move-parent-dialog'
import type { DragItem } from './habit-list/tree-helpers'
import type { createStyles } from './habit-list/styles'
import { SearchEmpty } from '@/components/search/search-results'
import { useHabitListCollapse,useHabitListRoots,useHabitRecentCompletions,useHabitListMoveActions,useHabitListQueries,useHabitListScroll,useHabitListModalState,useHabitListDrill,useHabitListSubHabitActions,useHabitListProgress,useHabitListAccount,useHabitListPresentation,useHabitListItems,useHabitListCollapseState,useHabitListSelectionState,useHabitRecentCompletionState,useHabitListMoveState,useHabitListVisibility,useHabitMoveParentSelection,useHabitListHandle } from './habits/use-habit-list-state'
import { useParentPromptQueue } from './habits/use-parent-prompt-queue'
import { useHabitListConfirmations } from './habits/use-habit-list-confirmations'
import { useHabitListDrag } from './habits/use-habit-list-drag'

export interface HabitListProps {
  view?: 'today' | 'all' | 'general'
  filters: HabitsFilter
  selectedDate?: Date
  showCompleted: boolean
  onShowCompleted?: () => void
  searchQuery?: string
  onClearSearch?: () => void
  isSelectMode?: boolean
  onBulkMove?: (habitIds: string[], parentId: string | null) => Promise<BulkMoveHabitParentResult | undefined>
  selectedHabitIds?: Set<string>
  listHeader?: ReactElement | null
  onCreatePress: () => void
  onSeeUpcoming?: () => void
  onDetailHabit?: (habit: NormalizedHabit) => void
  onEditHabit?: (
    habit: NormalizedHabit,
    onSaved?: () => void | Promise<void>,
  ) => void
  onScrollBeginDrag?: () => void
  /** Notified with the vertical scroll offset of the active list, so a parent can
   * gate a scroll-to-top affordance once a long list has been scrolled. */
  onScroll?: (offsetY: number) => void
  /** Notified whenever the all-collapsed status changes. Parents can mirror
   * this in render-time state (refs cannot be read during render). */
  onAllCollapsedChange?: (allCollapsed: boolean) => void
  onSurfaceOpenChange?: (open: boolean) => void
  /** Notified whenever the set of visible habit ids changes. Parents can
   * mirror this in render-time state. */
  onAllLoadedIdsChange?: (ids: Set<string>) => void
}

interface RowActionHandlers {
  toggle: (habit: NormalizedHabit, intent: 'log' | 'unlog') => void
  skip: (habit: NormalizedHabit) => void
  reschedule: (habit: NormalizedHabit) => void
  expand: (habitId: string) => void
  delete: (habitId: string) => void
  duplicate: (habit: NormalizedHabit) => void
  edit: (habit: NormalizedHabit, isDrillCard: boolean) => void
  move: (habitId: string) => void
  addChild: (habit: NormalizedHabit) => void
  drill: (habitId: string) => void
  enterSelectMode: (habitId: string) => void
  toggleSelection: (habitId: string) => void
  detail: (habit: NormalizedHabit) => void
}

interface ActionRowProps extends Omit<HabitRowProps, 'actions'> {
  canSkip: boolean
  hasSubHabits: boolean
  isDrillCard: boolean
  onLongPressCard?: () => void
  handlersRef: RefObject<RowActionHandlers>
}

function ActionRow({
  habit,
  canSkip,
  hasSubHabits,
  isDrillCard,
  onLongPressCard,
  handlersRef,
  ...rowProps
}: Readonly<ActionRowProps>) {
  const latestRef = useRef({ habit, onLongPressCard })
  useLayoutEffect(() => {
    latestRef.current = { habit, onLongPressCard }
  }, [habit, onLongPressCard])
  const hasLongPress = Boolean(onLongPressCard)
  const actions = useMemo(() => {
    const habitId = habit.id
    return {
      onLog: () => handlersRef.current.toggle(latestRef.current.habit, 'log'),
      onUnlog: () => handlersRef.current.toggle(latestRef.current.habit, 'unlog'),
      onSkip: canSkip && !habit.isGeneral ? () => handlersRef.current.skip(latestRef.current.habit) : undefined,
      onReschedule: habit.isOverdue
        ? () => handlersRef.current.reschedule(latestRef.current.habit)
        : undefined,
      onToggleExpand: () => rowProps.drillInsteadOfExpand ? handlersRef.current.drill(habitId) : handlersRef.current.expand(habitId),
      onDelete: () => handlersRef.current.delete(habitId),
      onDuplicate: () => handlersRef.current.duplicate(latestRef.current.habit),
      onEdit: () => handlersRef.current.edit(latestRef.current.habit, isDrillCard),
      onMoveParent: () => handlersRef.current.move(habitId),
      onAddSubHabit: () => handlersRef.current.addChild(latestRef.current.habit),
      onDrillInto: hasSubHabits ? () => handlersRef.current.drill(habitId) : undefined,
      onEnterSelectMode: () => handlersRef.current.enterSelectMode(habitId),
      onDetail: () => handlersRef.current.detail(latestRef.current.habit),
      onToggleSelection: () => handlersRef.current.toggleSelection(habitId),
      onLongPressCard: hasLongPress
        ? () => latestRef.current.onLongPressCard?.()
        : undefined,
    }
  }, [canSkip, rowProps.drillInsteadOfExpand, habit.isGeneral, habit.id, habit.isOverdue, handlersRef, hasLongPress, hasSubHabits, isDrillCard])

  return <HabitRow {...rowProps} habit={habit} actions={actions} />
}

export interface HabitListHandle {
  allCollapsed: boolean
  allLoadedIds: Set<string>
  openBulkMove: () => void
  collapseAll: () => void
  expandAll: () => void
  markRecentlyCompleted: (habitId: string) => void
  checkAndPromptParentLog: (childHabitId: string) => void
  settleBulkHabitResolutions: (resolutions: readonly HabitResolution[], date: string) => void
  refetch: () => void
  scrollToOffset: (offset: number, animated?: boolean) => void
}

const SKELETON_KEYS = [
  'skeleton-1',
  'skeleton-2',
  'skeleton-3',
  'skeleton-4',
  'skeleton-5',
]

const KEYBOARD_SHOULD_PERSIST_TAPS = 'handled'

function renderAllDoneListHeader(
  showAllDone: boolean,
  header: ReactElement | null,
  headerStyle: ReturnType<typeof createStyles>['allDoneHeader'],
  onAction: (() => void) | undefined,
): ReactElement | null {
  if (!showAllDone) return header
  return (
    <View style={headerStyle}>
      {header}
      <HabitListAllDone onSeeUpcoming={onAction} />
    </View>
  )
}

function renderDayListEmptyState(
  isCountLoaded: boolean,
  accountCount: number,
  showAllDone: boolean,
  renderFirstRun: () => ReactElement,
  sectionInsetStyle: ReturnType<typeof createStyles>['sectionInset'],
  frequencyUnit: HabitsFilter['frequencyUnit'],
): ReactElement | null {
  if (frequencyUnit) return <HabitListFrequencyEmptyState frequencyUnit={frequencyUnit} />
  if (showAllDone) return null
  if (isCountLoaded && accountCount === 0) return renderFirstRun()
  return <View style={sectionInsetStyle}><HabitListNothingOpen /></View>
}

export const HabitList = forwardRef<HabitListHandle, HabitListProps>(
  function HabitList(
    {
      view = 'today',
      filters,
      selectedDate: requestedDate,
      showCompleted,
      onShowCompleted,
      searchQuery,
      onClearSearch,
      isSelectMode,
      selectedHabitIds,
      onBulkMove,
      listHeader = null,
      onCreatePress,
      onSeeUpcoming,
      onDetailHabit,
      onEditHabit,
      onScrollBeginDrag,
      onScroll,
      onAllCollapsedChange,
      onSurfaceOpenChange,
      onAllLoadedIdsChange,
    },
    ref,
  ) {
    const state = useHabitListModel({ view, filters, requestedDate, showCompleted, onShowCompleted, searchQuery, onClearSearch, isSelectMode, selectedHabitIds, onBulkMove, listHeader, onCreatePress, onSeeUpcoming, onDetailHabit, onEditHabit, onScrollBeginDrag, onScroll, onAllCollapsedChange, onSurfaceOpenChange, onAllLoadedIdsChange, ref })
    const { t, styles } = state.account
    const { scrollContainerRef, revealListFocus, bulkBarStyle, handleMainListOffsetChange } = state.scroll
    const { habitsQuery, launchFromCache, isLoading, isError } = state.queries
    const { drill } = state
    const { listExtraData } = state.selection
    const { presentation, cellMotion } = state.motion
    const { measureList } = state.items
    const { renderItem } = state.rowItems
    const { keyExtractor } = state.empty
    const { refreshControl } = state.refresh
    const { activeListHeader } = state.completion
    const { renderCurrentViewEmptyState } = state.rendering
    const { isDraggingList, handleDragEnd } = state.drag
    const commonOverlays = <HabitListOverlays state={state} />
    if (drill.currentParentId) return renderHabitDrillState({ ...state, commonOverlays })
    if (isLoading) return renderHabitLoadingState({ ...state, commonOverlays })
    if (isError && !habitsQuery.data) return renderHabitErrorState({ ...state, commonOverlays })
    if (view === 'all') return renderHabitAllState({ ...state, commonOverlays })
    return (
      <>
        <ContentFade key="habits" fill><KeyboardAwareScrollHost scrollRef={scrollContainerRef} contentContainerStyle={[styles.listContent, bulkBarStyle]}>{keyboard => <DraggableFlatList
          {...keyboard}
          {...cellMotion}
          ref={scrollContainerRef}
          accessibilityLabel={t('habits.sectionLabel')}
          onLayout={event => { keyboard.onLayout?.(event); measureList(event) }}
          onFocus={revealListFocus}
          data={presentation.items}
          keyboardShouldPersistTaps={KEYBOARD_SHOULD_PERSIST_TAPS}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          extraData={listExtraData}
          testID={isDraggingList ? 'dragging-habit-list' : 'habit-list'}
          refreshControl={refreshControl}
          onDragEnd={(params) => void handleDragEnd(params)}
          ListHeaderComponent={activeListHeader}
          ListEmptyComponent={<TodayLaunchContent enabled={view === 'today'} fromCache={launchFromCache} empty>{renderCurrentViewEmptyState()}</TodayLaunchContent>}
          // WHY: DraggableFlatList overwrites any caller onScroll with its own reanimated handler; onScrollOffsetChange is its supported scroll-offset API https://github.com/computerjazz/react-native-draggable-flatlist/blob/v4.0.3/src/components/DraggableFlatList.tsx#L396
          onScrollOffsetChange={offset => { keyboard.onScrollOffsetChange(offset); handleMainListOffsetChange(offset) }}
          onScrollBeginDrag={onScrollBeginDrag}
          showsVerticalScrollIndicator={false}
          initialNumToRender={10}
          maxToRenderPerBatch={8}
          windowSize={11}
        />}</KeyboardAwareScrollHost></ContentFade>
        {commonOverlays}
      </>
    )
  },
)

export type HabitListHandleInputs = { ref: React.ForwardedRef<HabitListHandle> } & Pick<ReturnType<typeof useHabitListCollapse>, 'allCollapsed' | 'collapseAll' | 'expandAll'> & Pick<ReturnType<typeof useHabitListRoots>, 'allLoadedIds'> & Pick<ReturnType<typeof useHabitRecentCompletions>, 'markRecentlyCompleted'> & Pick<ReturnType<typeof useParentPromptQueue>, 'checkAndPromptParentLog'> & Pick<ReturnType<typeof useParentPromptQueue>, 'settleBulkHabitResolutions'> & Pick<ReturnType<typeof useHabitListMoveActions>, 'openBulkMove'> & Pick<ReturnType<typeof useHabitListQueries>, 'refetch'> & Pick<ReturnType<typeof useHabitListScroll>, 'scrollContainerRef' | 'allListRef' | 'drillListRef' | 'stateListRef'>

type HabitRowActionsInputs = Pick<ReturnType<typeof useParentPromptQueue>, 'handleDirectToggle' | 'skipHabit'> & Pick<ReturnType<typeof useHabitListModalState>, 'setHabitToReschedule' | 'setShowRescheduleSheet'> & Pick<ReturnType<typeof useHabitListCollapse>, 'toggleExpand'> & { confirmations: ReturnType<typeof useHabitListConfirmations> } & Pick<HabitListProps, 'onEditHabit' | 'isSelectMode' | 'onDetailHabit'> & Pick<ReturnType<typeof useHabitListDrill>, 'drill'> & Pick<ReturnType<typeof useHabitListMoveActions>, 'openMoveParentDialog'> & Pick<ReturnType<typeof useHabitListSubHabitActions>, 'startAddSubHabit'> & Pick<ReturnType<typeof useHabitListQueries>, 'toggleSelectMode' | 'toggleSelectionCascade'> & Pick<ReturnType<typeof useHabitListRoots>, 'getDescendantIds'>

function useHabitRowActions({ handleDirectToggle, skipHabit }: Pick<HabitRowActionsInputs, 'handleDirectToggle' | 'skipHabit'>, { setHabitToReschedule, setShowRescheduleSheet }: Pick<HabitRowActionsInputs, 'setHabitToReschedule' | 'setShowRescheduleSheet'>, { toggleExpand }: Pick<HabitRowActionsInputs, 'toggleExpand'>, confirmations: HabitRowActionsInputs['confirmations'], { onEditHabit, isSelectMode, onDetailHabit }: Pick<HabitRowActionsInputs, 'onEditHabit' | 'isSelectMode' | 'onDetailHabit'>, { drill }: Pick<HabitRowActionsInputs, 'drill'>, { openMoveParentDialog }: Pick<HabitRowActionsInputs, 'openMoveParentDialog'>, { startAddSubHabit }: Pick<HabitRowActionsInputs, 'startAddSubHabit'>, { toggleSelectMode, toggleSelectionCascade }: Pick<HabitRowActionsInputs, 'toggleSelectMode' | 'toggleSelectionCascade'>, { getDescendantIds }: Pick<HabitRowActionsInputs, 'getDescendantIds'>) {
  const rowActionHandlers: RowActionHandlers = {
    toggle: (habit, intent) => { void handleDirectToggle(habit, intent) },
    skip: (habit) => { void skipHabit(habit) },
    reschedule: (habit) => {
      setHabitToReschedule(habit)
      setShowRescheduleSheet(true)
    },
    expand: toggleExpand,
    delete: confirmations.promptDelete,
    duplicate: confirmations.promptDuplicate,
    edit: (habit, isDrillCard) => onEditHabit?.(
      habit,
      isDrillCard ? () => drill.refreshCurrent() : undefined,
    ),
    move: openMoveParentDialog,
    addChild: startAddSubHabit,
    drill: (habitId) => { void drill.drillInto(habitId) },
    enterSelectMode: (habitId) => {
      if (!isSelectMode) toggleSelectMode()
      toggleSelectionCascade(habitId, getDescendantIds)
    },
    toggleSelection: (habitId) =>
      toggleSelectionCascade(habitId, getDescendantIds),
    detail: (habit) => onDetailHabit?.(habit),
  }
  const rowActionHandlersRef = useRef(rowActionHandlers)
  useLayoutEffect(() => {
    rowActionHandlersRef.current = rowActionHandlers
  })
  return { rowActionHandlersRef }
}

type HabitRowRenderingInputs = Pick<ReturnType<typeof useHabitListProgress>, 'getChildrenProgress'> & Pick<ReturnType<typeof useHabitListAccount>, 'selectedDateStr' | 'todayStr' | 'rowDate'> & Pick<ReturnType<typeof useHabitListItems>, 'maxInlineDepth'> & Pick<ReturnType<typeof useHabitListCollapseState>, 'collapsedIds'> & Pick<HabitListProps, 'isSelectMode'> & Pick<ReturnType<typeof useHabitListSelectionState>, 'selectedIds'> & Pick<ReturnType<typeof useHabitRowActions>, 'rowActionHandlersRef'>

function useHabitRowRendering({ getChildrenProgress }: Pick<HabitRowRenderingInputs, 'getChildrenProgress'>, { selectedDateStr, todayStr, rowDate }: Pick<HabitRowRenderingInputs, 'selectedDateStr' | 'todayStr' | 'rowDate'>, { maxInlineDepth }: Pick<HabitRowRenderingInputs, 'maxInlineDepth'>, { collapsedIds }: Pick<HabitRowRenderingInputs, 'collapsedIds'>, { isSelectMode }: Pick<HabitRowRenderingInputs, 'isSelectMode'>, { selectedIds }: Pick<HabitRowRenderingInputs, 'selectedIds'>, { rowActionHandlersRef }: Pick<HabitRowRenderingInputs, 'rowActionHandlersRef'>) {
  const renderHabitCard = useCallback(
    (
      habit: NormalizedHabit,
      depth: number,
      hasChildren: boolean,
      hasSubHabits: boolean,
      options?: {
        isDrillCard?: boolean
        onLongPressCard?: () => void
        panelEnd?: boolean
      },
    ) => {
      const progress = hasChildren
        ? getChildrenProgress(habit.id)
        : { done: 0, total: 0 }

      const row = (
        <ActionRow
          key={habit.id}
          habit={habit}
          canSkip={canLogHabitOnDate(habit, selectedDateStr, todayStr)}
          structuralColumn
          selectedDate={rowDate}
          today={todayStr}
          depth={depth}
          drillInsteadOfExpand={Boolean(options?.isDrillCard) || depth >= maxInlineDepth}
          panelEnd={options?.panelEnd}
          hasChildren={hasChildren}
          isExpanded={!options?.isDrillCard && depth < maxInlineDepth && !collapsedIds.has(habit.id)}
          childrenDone={progress.done}
          childrenTotal={progress.total}
          isSelectMode={isSelectMode}
          isSelected={selectedIds.has(habit.id)}
          hasSubHabits={hasSubHabits}
          isDrillCard={Boolean(options?.isDrillCard)}
          onLongPressCard={options?.onLongPressCard}
          handlersRef={rowActionHandlersRef}
        />
      )

      return row
    },
    [getChildrenProgress, selectedDateStr, todayStr, rowDate, maxInlineDepth, collapsedIds, isSelectMode, selectedIds, rowActionHandlersRef],
  )
  return { renderHabitCard }
}

type HabitListItemRenderingInputs = Pick<ReturnType<typeof useHabitListPresentation>, 'presentation'> & Pick<ReturnType<typeof useHabitListItems>, 'isDndEnabled'> & { view: NonNullable<HabitListProps['view']> } & Pick<ReturnType<typeof useHabitListQueries>, 'launchFromCache'> & Pick<ReturnType<typeof useHabitRowRendering>, 'renderHabitCard'> & { drag: ReturnType<typeof useHabitListDrag> }

function useHabitListItemRendering({ presentation }: Pick<HabitListItemRenderingInputs, 'presentation'>, { view }: Pick<HabitListItemRenderingInputs, 'view'>, { launchFromCache }: Pick<HabitListItemRenderingInputs, 'launchFromCache'>, { renderHabitCard }: Pick<HabitListItemRenderingInputs, 'renderHabitCard'>, { isDndEnabled }: Pick<HabitListItemRenderingInputs, 'isDndEnabled'>, dragState: HabitListItemRenderingInputs['drag']) {
  const renderItem = useCallback(
    ({ item, drag, getIndex }: RenderItemParams<DragItem>) => {
      const index = getIndex() ?? 0
      const nextItem = presentation.items[index + 1]
      const motionRow = presentation.rows[index]!
      return <HabitListMotionRow id={item.id} phase={motionRow.phase} offset={motionRow.offset} itemIds={presentation.itemIds} measure={presentation.measure} positionMotion={false}><TodayLaunchContent enabled={view === 'today' && index === 0} fromCache={launchFromCache} empty={false}>{renderHabitCard(
        item.habit,
        item.depth,
        item.hasChildren,
        item.hasSubHabits,
        {
          onLongPressCard: isDndEnabled
            ? () => dragState.prepareDrag(item, drag)
            : undefined,
          panelEnd: !nextItem || nextItem.depth === 0,
        },
      )}</TodayLaunchContent></HabitListMotionRow>
    },
    [
      presentation,
      isDndEnabled,
      dragState,
      renderHabitCard,
      view,
      launchFromCache,
    ],
  )
  return { renderItem }
}

type HabitListEmptyRenderingInputs = Pick<ReturnType<typeof useHabitListAccount>, 'styles' | 't'> & Pick<HabitListProps, 'searchQuery' | 'onClearSearch' | 'onCreatePress' | 'listHeader'> & { view: NonNullable<HabitListProps['view']> }

function useHabitListEmptyRendering({ styles, t }: Pick<HabitListEmptyRenderingInputs, 'styles' | 't'>, { searchQuery, onClearSearch, onCreatePress, view, listHeader }: Pick<HabitListEmptyRenderingInputs, 'searchQuery' | 'onClearSearch' | 'onCreatePress' | 'view' | 'listHeader'>) {
  const keyExtractor = useCallback((item: DragItem) => item.id, [])

  const renderSkeletonItem = useCallback(
    () => (
      <View style={styles.sectionInset}>
        <Skeleton variant="habit-row" label={t('common.loading')} />
      </View>
    ),
    [styles, t],
  )

  const renderEmptyState = useCallback(
    () => searchQuery?.trim() ? <SearchEmpty query={searchQuery.trim()} onClearSearch={onClearSearch} onCreate={onCreatePress} /> : (
      <HabitListEmptyState
        title={t(view === 'general' ? 'habits.emptyGeneral' : 'habits.emptyState')}
        description={view === 'today' ? t('habits.noHabitsBody') : ''}
        askAstraLabel={t('habits.askAstra')}
        onAskAstra={() => useUIStore.getState().setAstraConversationOpen(true)}
        actionLabel={t('habits.createManually')}
        onAction={onCreatePress}
        variant="primary"
      />
    ),
    [onClearSearch, onCreatePress, searchQuery, t, view],
  )

  const listHeaderComponent = useMemo(
    () =>
      listHeader ? (
        <View style={styles.sectionInset}>{listHeader}</View>
      ) : null,
    [listHeader, styles.sectionInset],
  )
  return { listHeaderComponent, renderSkeletonItem, renderEmptyState, keyExtractor }
}

type HabitListRefreshInputs = Pick<ReturnType<typeof useHabitListQueries>, 'isFetching' | 'isLoading' | 'refetch'> & Pick<ReturnType<typeof useHabitListAccount>, 'tokens'>

function useHabitListRefresh({ isFetching, isLoading, refetch }: Pick<HabitListRefreshInputs, 'isFetching' | 'isLoading' | 'refetch'>, { tokens }: Pick<HabitListRefreshInputs, 'tokens'>) {
  const insets = useSafeAreaInsets()
  const refreshControl = useMemo(
    () => (
      <RefreshControl
        refreshing={isFetching && !isLoading}
        onRefresh={() => void refetch()}
        tintColor={tokens.primary}
        progressViewOffset={insets.top}
      />
    ),
    // react-doctor-disable-next-line exhaustive-deps -- isFetching/isLoading/refetch are extracted habitsQuery members already listed; the analyzer wants the qualified paths but the aliases track them https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    [tokens.primary, insets.top, isFetching, isLoading, refetch],
  )
  return { refreshControl }
}

type getHabitListCompletionInputs = { view: NonNullable<HabitListProps['view']> } & Pick<HabitListProps, 'filters' | 'onSeeUpcoming'> & Pick<ReturnType<typeof useHabitListAccount>, 'accountHabitCount' | 'selectedDateStr' | 'todayStr' | 'styles'> & Pick<ReturnType<typeof useHabitListQueries>, 'habitsById' | 'childrenByParent'> & Pick<ReturnType<typeof useHabitListEmptyRendering>, 'listHeaderComponent'>

function getHabitListCompletion({ view, filters, onSeeUpcoming }: Pick<getHabitListCompletionInputs, 'view' | 'filters' | 'onSeeUpcoming'>, { accountHabitCount, selectedDateStr, todayStr, styles }: Pick<getHabitListCompletionInputs, 'accountHabitCount' | 'selectedDateStr' | 'todayStr' | 'styles'>, { habitsById, childrenByParent }: Pick<getHabitListCompletionInputs, 'habitsById' | 'childrenByParent'>, { listHeaderComponent }: Pick<getHabitListCompletionInputs, 'listHeaderComponent'>) {
  const showAllDone = view === 'today' && !filters.frequencyUnit && !(accountHabitCount.isLoaded && accountHabitCount.count === 0) &&
    selectedDateStr === todayStr &&
    getAllDoneOnDate(habitsById, childrenByParent, selectedDateStr).allDone
  const activeListHeader = renderAllDoneListHeader(
    showAllDone,
    listHeaderComponent,
    styles.allDoneHeader,
    onSeeUpcoming,
  )
  return { showAllDone, activeListHeader }
}

function renderCurrentViewEmptyState(context: HabitListRenderingContext) {
  const { searchQuery, renderEmptyState, filters, view, accountHabitCount, showAllDone, styles } = context

  if (searchQuery?.trim()) return renderEmptyState()
  if (filters.frequencyUnit) return <HabitListFrequencyEmptyState frequencyUnit={filters.frequencyUnit} />
  if (view !== 'today') return renderEmptyState()
  return renderDayListEmptyState(accountHabitCount.isLoaded, accountHabitCount.count, showAllDone, renderEmptyState, styles.sectionInset, filters.frequencyUnit)
}

type HabitListRenderingContext = Pick<HabitListProps, 'searchQuery' | 'filters'> & Pick<ReturnType<typeof useHabitListEmptyRendering>, 'renderEmptyState'> & { view: NonNullable<HabitListProps['view']> } & Pick<ReturnType<typeof useHabitListAccount>, 'accountHabitCount' | 'styles'> & Pick<ReturnType<typeof getHabitListCompletion>, 'showAllDone'>

function createHabitListRendering(context: HabitListRenderingContext) {
  return { renderCurrentViewEmptyState: renderCurrentViewEmptyState.bind(null, context) }
}

type HabitListModelInputs = { view: NonNullable<HabitListProps['view']> } & Pick<HabitListProps, 'filters' | 'showCompleted' | 'onShowCompleted' | 'searchQuery' | 'onClearSearch' | 'isSelectMode' | 'selectedHabitIds' | 'onBulkMove' | 'listHeader' | 'onCreatePress' | 'onSeeUpcoming' | 'onDetailHabit' | 'onEditHabit' | 'onScrollBeginDrag' | 'onScroll' | 'onAllCollapsedChange' | 'onSurfaceOpenChange' | 'onAllLoadedIdsChange'> & { requestedDate: HabitListProps['selectedDate'] } & { ref: React.ForwardedRef<HabitListHandle> }

function useHabitListModel(parameters: HabitListModelInputs) {
  const habitListAccount = useHabitListAccount(parameters)
  const habitListScroll = useHabitListScroll(habitListAccount, parameters)
  const habitListQueries = useHabitListQueries(parameters, habitListAccount)
  const habitListCollapseState = useHabitListCollapseState()
  const habitRecentCompletionState = useHabitRecentCompletionState(habitListAccount)
  const habitListDrill = useHabitListDrill(habitListQueries, habitListAccount, parameters, habitRecentCompletionState)
  const confirmations = useHabitListConfirmations(habitListQueries)
  const habitListModalState = useHabitListModalState()
  const habitListMoveState = useHabitListMoveState()
  const habitListSelectionState = useHabitListSelectionState(parameters, habitRecentCompletionState)
  const habitListVisibility = useHabitListVisibility(habitListMoveState, habitListQueries, habitListAccount, parameters, habitRecentCompletionState)
  const habitRecentCompletions = useHabitRecentCompletions({ ...habitListAccount, ...habitRecentCompletionState })
  const habitListRoots = useHabitListRoots(habitListVisibility, parameters, habitListQueries, habitRecentCompletionState)
  const habitListCollapse = useHabitListCollapse(habitListRoots, habitListCollapseState, parameters)
  const habitListItems = useHabitListItems(parameters, habitListRoots, habitListAccount, habitListScroll, habitListCollapseState)
  const drag = useHabitListDrag(habitListCollapseState, habitListItems, habitListQueries)
  const habitListPresentation = useHabitListPresentation(drag, habitListAccount, parameters, habitListCollapseState.reducedListMotion)
  const habitListProgress = useHabitListProgress(habitListVisibility, parameters, habitListQueries)
  const habitMoveParentSelection = useHabitMoveParentSelection(habitListMoveState, habitListQueries, habitListAccount)
  const habitListMoveActions = useHabitListMoveActions(habitListMoveState, habitListQueries, parameters, habitMoveParentSelection, habitListAccount)
  const habitListSubHabitActions = useHabitListSubHabitActions(habitListCollapseState, habitListCollapse, habitListModalState)
  const habitListEmptyRendering = useHabitListEmptyRendering(habitListAccount, parameters)
  const habitListRefresh = useHabitListRefresh(habitListQueries, habitListAccount)
  const habitListCompletion = getHabitListCompletion(parameters, habitListAccount, habitListQueries, habitListEmptyRendering)
  const habitListRendering = createHabitListRendering({ ...parameters, ...habitListEmptyRendering, ...habitListAccount, ...habitListCompletion })
  const parentPromptQueue = useParentPromptQueue({ ...habitListAccount, ...habitListQueries, ...habitListVisibility, ...parameters, ...habitRecentCompletions })
  useHabitListHandle(parameters, habitListCollapse, habitListRoots, habitRecentCompletions, parentPromptQueue, habitListMoveActions, habitListQueries, habitListScroll)
  const habitRowActions = useHabitRowActions(parentPromptQueue, habitListModalState, habitListCollapse, confirmations, parameters, habitListDrill, habitListMoveActions, habitListSubHabitActions, habitListQueries, habitListRoots)
  const habitRowRendering = useHabitRowRendering(habitListProgress, habitListAccount, habitListItems, habitListCollapseState, parameters, habitListSelectionState, habitRowActions)
  const habitListItemRendering = useHabitListItemRendering(habitListPresentation, parameters, habitListQueries, habitRowRendering, habitListItems, drag)
  return { drag, confirmations, parameters, account: habitListAccount, scroll: habitListScroll,
    queries: habitListQueries, drill: habitListDrill.drill, modals: habitListModalState,
    move: habitListMoveState, moveSelection: habitMoveParentSelection, moveActions: habitListMoveActions,
    movingHabit: habitListVisibility.movingHabit, selection: habitListSelectionState, items: habitListItems,
    motion: habitListPresentation, empty: habitListEmptyRendering, refresh: habitListRefresh,
    completion: habitListCompletion, rendering: habitListRendering, parentPrompts: parentPromptQueue,
    rows: habitRowRendering, rowItems: habitListItemRendering, subHabits: habitListSubHabitActions }
}

type HabitListScreenState = ReturnType<typeof useHabitListModel>

function HabitListOverlays({ state }: Readonly<{ state: HabitListScreenState }>) {
  const { t, selectedDate } = state.account
  const { parentPrompt, confirmParentSettlement, selectParentAncestor } = state.parentPrompts
  const { setSubHabitParent, setShowSubHabitModal, setHabitToReschedule, setShowRescheduleSheet, showSubHabitModal, subHabitParent, showRescheduleSheet, habitToReschedule } = state.modals
  const { movingHabitId, moveInventory, bulkMovingIds, selectedMoveParentId, isMovingParent, showMoveParentDialog, moveError, retryMoveInventory } = state.move
  const { movingHabit } = state
  const { canSubmitMoveParent, sharedMoveParentId, inventoryState, moveParentOptions } = state.moveSelection
  const { closeMoveParentDialog, confirmMoveParent, selectMoveParent } = state.moveActions
  const { habitToDuplicate, showDeleteConfirm, deletePending, deleteConfirmation, confirmDuplicate, confirmDelete, closeDelete, cancelDelete, cancelDuplicate } = state.confirmations
  return (
    <>
      <CreateHabitModal
        open={showSubHabitModal}
        onClose={() => {
          setShowSubHabitModal(false)
          setSubHabitParent(null)
        }}
        initialDate={selectedDate ? formatAPIDate(selectedDate) : null}
        parentHabit={subHabitParent}
      />

      <RescheduleSheet
        open={showRescheduleSheet}
        onOpenChange={(open) => {
          setShowRescheduleSheet(open)
          if (!open) setHabitToReschedule(null)
        }}
        habit={habitToReschedule}
      />

      <HabitListConfirmDialogs
        t={t}
        showDeleteConfirm={showDeleteConfirm}
        deletePending={deletePending}
        deleteHabitName={deleteConfirmation.name}
        deleteDescendantCount={deleteConfirmation.descendantCount}
        duplicateHabitName={habitToDuplicate?.title ?? null}
        parentPrompt={parentPrompt}
        onConfirmDelete={() => void confirmDelete()}
        onDeleteClosed={closeDelete}
        onCancelDelete={cancelDelete}
        onConfirmDuplicate={() => void confirmDuplicate()}
        onCancelDuplicate={cancelDuplicate}
        onSelectParentAncestor={selectParentAncestor}
        onConfirmParent={() => void confirmParentSettlement()}
        onCancelParent={state.parentPrompts.cancelParentPrompt}
      />

      <MoveParentDialog
        t={t}
        visible={showMoveParentDialog}
        isPending={isMovingParent}
        movingHabitTitle={moveInventory.habitsById.get(movingHabitId ?? '')?.title ?? movingHabit?.title ?? null}
        movingHabitParentId={sharedMoveParentId}
        movingHabitCount={bulkMovingIds?.length}
        error={moveError}
        inventoryState={inventoryState}
        onRetryInventory={retryMoveInventory}
        options={moveParentOptions}
        selectedMoveParentId={selectedMoveParentId}
        canSubmit={canSubmitMoveParent}
        onClose={closeMoveParentDialog}
        onConfirm={confirmMoveParent}
        onSelectOption={selectMoveParent}
      />
    </>
  )
}

function renderHabitDrillState(state: Readonly<HabitListScreenState & { commonOverlays: ReactElement }>) {
  const { onShowCompleted, onScrollBeginDrag } = state.parameters
  const { t, styles } = state.account
  const { drillListRef, handleListScroll, revealListFocus, bulkBarStyle } = state.scroll
  const { drill, commonOverlays } = state
  const { startAddSubHabit } = state.subHabits
  const { listHeaderComponent } = state.empty
  const { refreshControl } = state.refresh
  const { renderHabitCard } = state.rows
  return ((
    <>
      <HabitDrill
        drill={drill}
        styles={styles}
        t={t}
        listHeaderComponent={listHeaderComponent}
        drillListRef={drillListRef}
        refreshControl={refreshControl}
        onListScroll={handleListScroll}
        onFocus={revealListFocus}
        onScrollBeginDrag={onScrollBeginDrag}
        bulkBarStyle={{ paddingBottom: bulkBarStyle.paddingBottom }}
        renderHabitCard={renderHabitCard}
        onAddSubHabit={startAddSubHabit}
        onShowCompleted={onShowCompleted}
      />
      {commonOverlays}
    </>
  ))
}

function renderHabitLoadingState(state: Readonly<HabitListScreenState & { commonOverlays: ReactElement }>) {
  const { onScrollBeginDrag } = state.parameters
  const { styles } = state.account
  const { stateListRef, handleListScroll, revealListFocus, bulkBarStyle } = state.scroll
  const { listHeaderComponent, renderSkeletonItem } = state.empty
  const { refreshControl } = state.refresh
  const { commonOverlays } = state
  return ((
    <>
      <ContentFade key="loading" fill><KeyboardAwareFlatList
        ref={stateListRef}
        onFocus={revealListFocus}
        onScroll={handleListScroll}
        scrollEventThrottle={16}
        data={SKELETON_KEYS}
        keyboardShouldPersistTaps={KEYBOARD_SHOULD_PERSIST_TAPS}
        keyExtractor={(item) => item}
        renderItem={renderSkeletonItem}
        ListHeaderComponent={listHeaderComponent}
        contentContainerStyle={[
          styles.skeletonContainer,
          bulkBarStyle,
        ]}
        refreshControl={refreshControl}
        onScrollBeginDrag={onScrollBeginDrag}
        accessibilityState={{ busy: true }}
        showsVerticalScrollIndicator={false}
      /></ContentFade>
      {commonOverlays}
    </>
  ))
}

function renderHabitErrorState(state: Readonly<HabitListScreenState & { commonOverlays: ReactElement }>) {
  const { onScrollBeginDrag } = state.parameters
  const { t, styles } = state.account
  const { stateListRef, handleListScroll, revealListFocus, bulkBarStyle } = state.scroll
  const { refetch } = state.queries
  const { listHeaderComponent } = state.empty
  const { refreshControl } = state.refresh
  const { commonOverlays } = state
  return ((
    <>
      <KeyboardAwareFlatList
        ref={stateListRef}
        onFocus={revealListFocus}
        onScroll={handleListScroll}
        scrollEventThrottle={16}
        data={[]}
        keyboardShouldPersistTaps={KEYBOARD_SHOULD_PERSIST_TAPS}
        keyExtractor={() => 'load-error'}
        renderItem={undefined}
        ListHeaderComponent={listHeaderComponent}
        ListEmptyComponent={
          <HabitListEmptyState
            title={t('habits.loadError')}
            description=""
            actionLabel={t('common.retry')} actionIcon="refresh"
            onAction={() => void refetch()}
            variant="secondary"
          />
        }
        contentContainerStyle={[styles.listContent, bulkBarStyle]}
        refreshControl={refreshControl}
        onScrollBeginDrag={onScrollBeginDrag}
        showsVerticalScrollIndicator={false}
      />
      {commonOverlays}
    </>
  ))
}

function renderHabitAllState(state: Readonly<HabitListScreenState & { commonOverlays: ReactElement }>) {
  const { onScrollBeginDrag } = state.parameters
  const { t, styles } = state.account
  const { allListRef, handleListScroll, revealListFocus, bulkBarStyle } = state.scroll
  const { listExtraData } = state.selection
  const { presentation } = state.motion
  const { measureList, groupHeadings, flatItems } = state.items
  const { listHeaderComponent, keyExtractor } = state.empty
  const { refreshControl } = state.refresh
  const { renderHabitCard } = state.rows
  const { renderCurrentViewEmptyState } = state.rendering
  const { commonOverlays } = state
  return (<>
    <ContentFade key="all" fill><KeyboardAwareFlatList
      ref={allListRef}
      accessibilityLabel={t('habits.sectionLabel')}
      onFocus={revealListFocus}
      testID="habit-list-all"
      onLayout={measureList}
      data={presentation.items}
      keyExtractor={keyExtractor}
      renderItem={({ item, index }) => <HabitListMotionRow id={item.id} phase={presentation.rows[index]!.phase} offset={presentation.rows[index]!.offset} itemIds={presentation.itemIds} measure={presentation.measure}>
        {groupHeadings.has(item.id) ? <Text accessibilityRole="header" style={[styles.dateGroupHeading, index === 0 && { paddingTop: SPACING.s0 }]}>{groupHeadings.get(item.id)}</Text> : null}
        {renderHabitCard(item.habit, item.depth, item.hasChildren, item.hasSubHabits, { panelEnd: !flatItems[index + 1] || flatItems[index + 1]!.depth === 0 })}
      </HabitListMotionRow>}
      extraData={listExtraData}
      keyboardShouldPersistTaps={KEYBOARD_SHOULD_PERSIST_TAPS}
      contentContainerStyle={[styles.listContent, bulkBarStyle]}
      refreshControl={refreshControl}
      ListHeaderComponent={listHeaderComponent}
      ListEmptyComponent={renderCurrentViewEmptyState()}
      onScroll={handleListScroll}
      scrollEventThrottle={16}
      onScrollBeginDrag={onScrollBeginDrag}
      showsVerticalScrollIndicator={false}
    /></ContentFade>
    {commonOverlays}
  </>)
}

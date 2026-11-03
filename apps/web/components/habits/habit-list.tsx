'use client'

import { ContentFade,ListMotionItem,ListPresence,MotionDisclosure } from '@/components/motion/list-motion'
import { TodayLaunchContent } from '@/components/today/today-launch-content'
import { Fragment,Suspense,useEffect,useState,type ComponentProps,type Ref } from 'react'
import dynamic from 'next/dynamic'
import { buildHabitDateBuckets,formatHabitDateBucketLabel,buildHabitRowDateModel,computeHabitCardStatus,computeHabitFutureHint,getAllDoneOnDate,isHabitDoneForRange,type HabitResolution } from '@orbit/shared/utils'
import { HabitRow,type HabitRowMetaToken } from './habit-row'
import { HabitListEmptyState,HabitListFrequencyEmptyState,HabitListAllDone,HabitListNothingOpen,HabitListSkeleton } from './habit-list/empty-state'
import { HabitDrill } from './habit-list/habit-drill'
import { SearchEmpty } from '@/components/search/search-results'
import type { DragItem,HabitView } from './habit-list/tree-helpers'
import type { HabitStatus } from '@orbit/shared/contracts/lists'
import { DndContext,closestCenter } from '@dnd-kit/core'
import { SortableContext,verticalListSortingStrategy } from '@dnd-kit/sortable'
import { SortableHabitItem } from './habit-list/sortable-habit-item'
import type { NormalizedHabit,HabitsFilter,BulkMoveHabitParentResult } from '@orbit/shared/types/habit'
import { OfflineRefusal } from '@/components/ui/offline-refusal'
import { useUIStore } from '@/stores/ui-store'
import { useParentPromptQueue } from './use-parent-prompt-queue'
import { useHabitListConfirmations,createHabitListSubHabitActions } from './use-habit-list-confirmations'
import { useHabitListCollapse,useHabitListRoots,useHabitRecentCompletions,useHabitListMoveState,useHabitListQueries,useHabitListModalState,useHabitListProgress,useHabitRecentCompletionState,useHabitListVisibility,useHabitListEditState,useHabitListSurfaceState,useHabitListHandle } from './use-habit-list-state'
import { useHabitListDrag,useHabitListKeyboardReorder } from './use-habit-list-drag'

const CreateHabitModal = dynamic(() =>
  import('./create-habit-modal').then((module) => module.CreateHabitModal),
)

const EditHabitModal = dynamic(() =>
  import('./edit-habit-modal').then((module) => module.EditHabitModal),
)

const RescheduleSheet = dynamic(() =>
  import('./reschedule-sheet').then((module) => module.RescheduleSheet),
)

const HabitListConfirmDialogs = dynamic(() =>
  import('./habit-list/confirm-dialogs').then((module) => module.HabitListConfirmDialogs),
)

const MoveParentController = dynamic(() =>
  import('./habit-list/move-parent-controller').then((module) => module.MoveParentController),
)

function DeferredEditHabitModal(props: Readonly<ComponentProps<typeof EditHabitModal>>) {
  return props.open ? <EditHabitModal {...props} /> : null
}

function DeferredRescheduleSheet(props: Readonly<ComponentProps<typeof RescheduleSheet>>) {
  return props.open ? <RescheduleSheet {...props} /> : null
}

function DeferredCreateHabitModal(props: Readonly<ComponentProps<typeof CreateHabitModal>>) {
  return props.open ? <CreateHabitModal {...props} /> : null
}

function DeferredConfirmDialogs(
  props: Readonly<ComponentProps<typeof HabitListConfirmDialogs>>,
) {
  const [activated, setActivated] = useState(false)
  const open =
    props.showDeleteConfirm ||
    props.deletePending ||
    props.duplicateHabitName !== null ||
    props.parentPrompt !== null
  if (open && !activated) setActivated(true)
  return open || activated ? <HabitListConfirmDialogs {...props} /> : null
}

function PendingMoveParent({ onClose }: Readonly<{ onClose: () => void }>) {
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', cancel)
    return () => window.removeEventListener('keydown', cancel)
  }, [onClose])
  return null
}

export interface HabitListProps {
  ref?: Ref<HabitListHandle>
  view?: HabitView
  selectedDate?: Date
  showCompleted?: boolean
  onShowCompleted?: () => void
  isSelectMode?: boolean
  onBulkMove?: (habitIds: string[], parentId: string | null) => Promise<BulkMoveHabitParentResult | undefined>
  selectedHabitIds?: Set<string>
  searchQuery?: string
  onClearSearch?: () => void
  filters: HabitsFilter
  onToggleSelection?: (habitId: string) => void
  onEnterSelectMode?: (habitId: string) => void
  onCreate?: () => void
  createRefusal?: boolean
  onSeeUpcoming?: () => void
  /** Notified whenever the all-collapsed status changes. Used by parent
   * components that need to surface this in render (e.g., a controls menu). */
  onAllLoadedIdsChange?: (ids: Set<string>) => void
  onAllCollapsedChange?: (allCollapsed: boolean) => void
  onSurfaceOpenChange?: (open: boolean) => void
}

const HABIT_PANEL_CLASS_NAME = 'habit-panel'

export interface HabitListHandle {
  openBulkMove: () => void
  collapseAll: () => void
  expandAll: () => void
  allCollapsed: boolean
  allLoadedIds: Set<string>
  markRecentlyCompleted: (habitId: string) => void
  checkAndPromptParentLog: (childHabitId: string) => void
  settleBulkHabitResolutions: (resolutions: readonly HabitResolution[], date: string) => void
}

export function HabitList({
  ref,
  view = 'today',
  selectedDate: requestedDate,
  showCompleted = false,
  onShowCompleted,
  isSelectMode = false,
  selectedHabitIds,
  onBulkMove,
  searchQuery = '',
  onClearSearch,
  filters,
  onToggleSelection,
  onEnterSelectMode,
  onCreate,
  createRefusal,
  onSeeUpcoming,
  onAllLoadedIdsChange,
  onAllCollapsedChange,
  onSurfaceOpenChange,
}: Readonly<HabitListProps>) {
  const state = useHabitListModel({ ref, view, requestedDate, showCompleted, onShowCompleted, isSelectMode, selectedHabitIds, onBulkMove, searchQuery, onClearSearch, filters, onToggleSelection, onEnterSelectMode, onCreate, createRefusal, onSeeUpcoming, onAllLoadedIdsChange, onAllCollapsedChange, onSurfaceOpenChange })
  const { habitsQuery, t, accountGeneration } = state.queries
  const { parentPrompt, confirmParentSettlement, selectParentAncestor } = state.parentPrompts
  const { showEditModal, showSubHabitModal, showRescheduleSheet, habitToEdit, setShowSubHabitModal, setHabitToReschedule, setShowRescheduleSheet, editModalOnSaved, habitToReschedule, subHabitParent } = state.modals
  const { moveIntent, closeMoveParentPicker } = state.move
  const { handleEditModalOpenChange, editHabitLockedGeneral } = state.edit
  const { renderList } = state.rendering
  const { listContainerRef } = state.drag
  const { showDeleteConfirm, deletePending, habitToDuplicate, deleteConfirmation, confirmDuplicate, confirmDelete, closeDelete, cancelDelete, cancelDuplicate } = state.confirmations
  return <>
    <ListPresence>{habitsQuery.isLoading ? <ContentFade key="loading"><HabitListSkeleton /></ContentFade> : null}</ListPresence>
    {renderList()}
    <DeferredEditHabitModal
      open={showEditModal}
      onOpenChange={handleEditModalOpenChange}
      habit={habitToEdit}
      onSaved={editModalOnSaved ?? undefined}
      lockedGeneral={editHabitLockedGeneral}
    />

    <DeferredRescheduleSheet
      open={showRescheduleSheet}
      onOpenChange={(open) => {
        setShowRescheduleSheet(open)
        if (!open) setHabitToReschedule(null)
      }}
      habit={habitToReschedule}
    />

    <DeferredCreateHabitModal
      open={showSubHabitModal}
      onOpenChange={setShowSubHabitModal}
      parentHabit={subHabitParent}
    />

    <DeferredConfirmDialogs
      key={accountGeneration}
      t={t}
      showDeleteConfirm={showDeleteConfirm}
      deletePending={deletePending}
      deleteHabitName={deleteConfirmation.name}
      deleteDescendantCount={deleteConfirmation.descendantCount}
      duplicateHabitName={habitToDuplicate?.title ?? null}
      parentPrompt={parentPrompt}
      onConfirmDelete={() => void confirmDelete()}
      onDeleteClosed={() => {
        closeDelete()
        listContainerRef.current?.focus()
      }}
      onCancelDelete={cancelDelete}
      onConfirmDuplicate={() => void confirmDuplicate()}
      onCancelDuplicate={cancelDuplicate}
      onSelectParentAncestor={selectParentAncestor}
      onConfirmParent={() => void confirmParentSettlement()}
      onCancelParent={state.parentPrompts.cancelParentPrompt}
    />
    {moveIntent && moveIntent.accountGeneration === accountGeneration ? (
      <Suspense key="move-parent" fallback={<PendingMoveParent onClose={closeMoveParentPicker} />}>
        <MoveParentController key={moveIntent.key} intent={moveIntent}
          onBulkMove={onBulkMove} onClose={closeMoveParentPicker} />
      </Suspense>
    ) : null}
  </>
}

export type HabitListHandleInputs = Pick<HabitListProps, 'ref'> & Pick<ReturnType<typeof useHabitListCollapse>, 'collapseAll' | 'expandAll' | 'allCollapsed'> & Pick<ReturnType<typeof useHabitListRoots>, 'allLoadedIds'> & Pick<ReturnType<typeof useHabitRecentCompletions>, 'markRecentlyCompleted'> & Pick<ReturnType<typeof useParentPromptQueue>, 'checkAndPromptParentLog' | 'settleBulkHabitResolutions'> & Pick<ReturnType<typeof useHabitListMoveState>, 'openBulkMove'> & Pick<ReturnType<typeof useHabitListDrag>, 'listContainerRef'>

type getHabitListCompletionInputs = { view: HabitView } & Pick<HabitListProps, 'filters'> & Pick<ReturnType<typeof useHabitListQueries>, 'accountHabitCount' | 'selectedDateStr' | 'todayStr' | 'habitsById' | 'childrenByParent'>

function getHabitListCompletion({ view, filters }: Pick<getHabitListCompletionInputs, 'view' | 'filters'>, { accountHabitCount, selectedDateStr, todayStr, habitsById, childrenByParent }: Pick<getHabitListCompletionInputs, 'accountHabitCount' | 'selectedDateStr' | 'todayStr' | 'habitsById' | 'childrenByParent'>) {
  const showAllDone = view === 'today' && !filters.frequencyUnit && !(accountHabitCount.isLoaded && accountHabitCount.count === 0) &&
    selectedDateStr === todayStr &&
    getAllDoneOnDate(habitsById, childrenByParent, selectedDateStr).allDone
  return { showAllDone }
}

function deriveRowState(context: HabitListRenderingContext,
  habit: NormalizedHabit,
  recentlyCompleted: boolean,
): HabitStatus {
  const { cardSelectedDate } = context

  if (habit.isBadHabit) return 'bad'
  const completed = recentlyCompleted || isHabitDoneForRange(habit)
  if (completed) return 'done'
  const status = computeHabitCardStatus(habit, cardSelectedDate)
  if (status === 'overdue') return 'overdue'
  return 'empty'
}

function buildMetaTokens(context: HabitListRenderingContext, habit: NormalizedHabit, childProgress?: { done: number; total: number }): HabitRowMetaToken[] {
  const { t, displayTime, selectedDateStr, todayStr, locale } = context

  const tokens: HabitRowMetaToken[] = []
  if (childProgress) tokens.push(t('habits.rowProgress', childProgress))
  else if (habit.dueTime) tokens.push(displayTime(habit.dueTime))
  if (habit.isOverdue && !habit.isCompleted) {
    tokens.push({ kind: 'overdue', label: t('habits.overdue') })
  }
  if (habit.isBadHabit && (habit.isCompleted || habit.isLoggedInRange)) {
    tokens.push({ kind: 'bad', label: t('habits.statusDot.bad') })
  }
  if (!habit.isCompleted && selectedDateStr === todayStr) {
    const futureHint = computeHabitFutureHint(habit, todayStr, t, locale)
    if (futureHint) tokens.push({ kind: 'future', label: futureHint })
  }
  return tokens
}

function renderHabitCard(context: HabitListRenderingContext,
  habit: NormalizedHabit,
  depth: number,
  hasChildren: boolean,
  hasSubHabits: boolean,
  options?: {
    isDrillCard?: boolean
    isDraggingList?: boolean
    childPanelId?: string
    reorderInstructionsId?: string
    onReorder?: (direction: -1 | 1) => void
  },
) {
  const { getChildrenProgress, recentlyCompletedIds, selectedDateStr, todayStr, t, isSelectMode, selectedHabitIds, collapsedIds, handleDirectToggle, skipFromRow, confirmations, setHabitToEdit, drill, setEditModalOnSaved, setShowEditModal, openMoveParentPicker, setHabitToReschedule, setShowRescheduleSheet, openDetail, startAddSubHabit, toggleExpand, onToggleSelection, onEnterSelectMode, refusedSubHabitParentId, isOnline } = context
  const { maxInlineDepth } = context.drag

  const progress = hasChildren ? getChildrenProgress(habit.id) : undefined
  const isChild = depth > 0
  const recentlyCompleted = recentlyCompletedIds.has(habit.id)
  const state = deriveRowState(context, habit, recentlyCompleted)
  const meta = buildMetaTokens(context, habit, progress)
  const { canLog, dateStatusKey, completionReadOnly, completionReasonKey, completionStatusUnavailable } = buildHabitRowDateModel(habit, selectedDateStr, todayStr)
  if (dateStatusKey) meta.push({ kind: 'date-status', label: t(dateStatusKey) })
  const hasLinkedGoal = (habit.linkedGoals?.length ?? 0) > 0
  return (
    <Fragment key={habit.id}>
      <HabitRow
        habit={habit}
        reorderInstructionsId={options?.reorderInstructionsId}
        structuralColumn
        drillInsteadOfExpand={Boolean(options?.isDrillCard) || depth >= maxInlineDepth}
        state={state}
        meta={meta}
        canLog={canLog}
        completionReadOnly={completionReadOnly}
        completionStatusUnavailable={completionStatusUnavailable}
        completionReason={completionReasonKey ? t(completionReasonKey) : undefined}
        streak={habit.currentStreak}
        child={isChild}
        depth={depth}
        selectMode={isSelectMode}
        selected={selectedHabitIds?.has(habit.id) ?? false}
        hasChildren={hasChildren}
        hasSubHabits={hasSubHabits}
        expanded={!options?.isDrillCard && depth < maxInlineDepth && !collapsedIds.has(habit.id)}
        childPanelId={options?.childPanelId}
        childProgress={progress}
        showLinkedGoalDot={hasLinkedGoal}
        actions={{
          onReorder: options?.onReorder,
          onLog: () => { void handleDirectToggle(habit, 'log') },
          onUnlog: () => { void handleDirectToggle(habit, 'unlog') },
          onSkip: !completionReadOnly && canLog && !habit.isGeneral ? () => { void skipFromRow(habit) } : undefined,
          onDuplicate: () => confirmations.promptDuplicate(habit),
          onEdit: () => {
            setHabitToEdit(habit)
            const onSaved = options?.isDrillCard ? () => drill.refreshCurrent() : null
            setEditModalOnSaved(() => onSaved)
            setShowEditModal(true)
          },
          onMoveParent: () => openMoveParentPicker(habit.id),
          onReschedule: !completionReadOnly && habit.isOverdue
            ? () => {
              setHabitToReschedule(habit)
              setShowRescheduleSheet(true)
            }
            : undefined,
          onDelete: () => confirmations.promptDelete(habit.id),
          onDetail: () => openDetail(habit),
          onDrillInto: () => void drill.drillInto(habit.id),
          onAddSubHabit: () => startAddSubHabit(habit),
          onToggleExpand: () => options?.isDrillCard || depth >= maxInlineDepth ? void drill.drillInto(habit.id) : toggleExpand(habit.id),
          onToggleSelection: () => onToggleSelection?.(habit.id),
          onEnterSelectMode: () => onEnterSelectMode?.(habit.id),
        }}
      />
      <div aria-live="polite" aria-atomic="true" className="contents">
        {refusedSubHabitParentId === habit.id && drill.currentParentId !== habit.id && !isOnline
          ? <div className="px-4 pb-3"><OfflineRefusal icon="create" embedded title={t('offline.create.title')} reason={t('offline.create.reason')} /></div>
          : null}
      </div>
    </Fragment>
  )
}

function renderHabitTree(context: HabitListRenderingContext, item: DragItem, panel: DragItem[], sortable: boolean): React.ReactNode {
  const { dndContextId, reorderInstructionsId, moveHabitByKeyboard, collapsedIds } = context
  const { maxInlineDepth, isDragging } = context.drag

  const childPanelId = item.depth < maxInlineDepth ? `${dndContextId}-habit-children-${item.id}` : undefined
  const row = renderHabitCard(context,
    item.habit,
    item.depth,
    item.hasChildren,
    item.hasSubHabits,
    {
      isDraggingList: isDragging,
      childPanelId,
      reorderInstructionsId: sortable ? reorderInstructionsId : undefined,
      onReorder: sortable ? (direction) => moveHabitByKeyboard(item.habit, direction) : undefined,
    },
  )
  return (
    <Fragment key={item.id}>
      {sortable ? <SortableHabitItem id={item.id}>{row}</SortableHabitItem> : row}
      {childPanelId ? (
        <MotionDisclosure id={childPanelId} expanded={!collapsedIds.has(item.id)} positionMotion={!sortable}>
          {sortable ? panel.filter((child) => child.parentId === item.id).map((child) => renderHabitTree(context, child, panel, sortable)) :
            <ListPresence>{panel.filter((child) => child.parentId === item.id).map((child) => <ListMotionItem key={child.id} className="flex min-w-0 flex-col gap-2">{renderHabitTree(context, child, panel, sortable)}</ListMotionItem>)}</ListPresence>}
        </MotionDisclosure>
      ) : null}
    </Fragment>
  )
}

function renderAllHabitGroups(context: HabitListRenderingContext): React.ReactNode {
  const { habits, todayStr, locale, t } = context
  const { dragPanels, listViewPanelStyle } = context.drag

  return <div className="flex min-w-0 flex-col gap-6">
    <ListPresence>{buildHabitDateBuckets(habits, todayStr).map((bucket) => <ListMotionItem key={bucket.key}><section className="flex min-w-0 flex-col gap-3" aria-label={formatHabitDateBucketLabel(bucket.key, todayStr, locale, t)}>
      <h2 className="font-mono text-xs font-medium text-[var(--fg-3)]">{formatHabitDateBucketLabel(bucket.key, todayStr, locale, t)}</h2>
      <ListPresence>{dragPanels.filter((panel) => bucket.habits.some((habit) => habit.id === panel[0]?.id)).map((panel) => <ListMotionItem key={panel[0]?.id} className={HABIT_PANEL_CLASS_NAME} style={listViewPanelStyle}>
        {panel.filter((item) => item.depth === 0).map((item) => renderHabitTree(context, item, panel, false))}
      </ListMotionItem>)}</ListPresence>
    </section></ListMotionItem>)}</ListPresence>
  </div>
}

function renderEmptyList(context: HabitListRenderingContext): React.ReactNode {
  const { searchQuery, onClearSearch, onCreate, filters, view, t, createRefusal, showAllDone, accountHabitCount } = context

  if (searchQuery.trim()) return <SearchEmpty query={searchQuery.trim()} onClearSearch={onClearSearch} onCreate={onCreate} />
  if (filters.frequencyUnit) return <HabitListFrequencyEmptyState frequencyUnit={filters.frequencyUnit} />
  if (view !== 'today') return <HabitListEmptyState title={t(view === 'general' ? 'habits.emptyGeneral' : 'habits.emptyState')} description="" askAstraLabel={t('habits.askAstra')} onAskAstra={() => useUIStore.getState().setAstraConversationOpen(true)} actionLabel={t('habits.createManually')} onAction={onCreate} createRefusal={createRefusal} />
  if (showAllDone) return null
  return accountHabitCount.isLoaded && accountHabitCount.count === 0 ? (
    <HabitListEmptyState
      title={t('habits.emptyState')}
      description={t('habits.noHabitsBody')}
      askAstraLabel={t('habits.askAstra')}
      onAskAstra={() => useUIStore.getState().setAstraConversationOpen(true)}
      actionLabel={t('habits.createManually')}
      onAction={onCreate}
      createRefusal={createRefusal}
    />
  ) : <HabitListNothingOpen />
}

function renderMainContent(context: HabitListRenderingContext): React.ReactNode {
  const { drill, t, startAddSubHabit, refusedSubHabitParentId, isOnline, onShowCompleted, view, habits, dndContextId, dragAccessibility } = context
  const { sensors, handleDragStart, handleDragEnd, restoreAfterDrag, activeDragItems, isDragging, isDndEnabled, activeDragPanels, dragPanels, listViewPanelStyle } = context.drag

  if (drill.currentParent) {
    return (
      <HabitDrill
        t={t}
        drill={drill}
        renderHabitCard={renderHabitCard.bind(null, context)}
        onAddSubHabit={startAddSubHabit}
        subHabitRefusal={refusedSubHabitParentId === drill.currentParentId && !isOnline}
        onShowCompleted={onShowCompleted}
      />
    )
  }

  if (view === 'all') return <>{habits.length === 0 ? renderEmptyList(context) : null}{renderAllHabitGroups(context)}</>

  return (
    <DndContext
      id={dndContextId}
      accessibility={dragAccessibility}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={restoreAfterDrag}
    >
      <SortableContext
        items={activeDragItems.map((item) => item.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className={isDragging ? 'is-dragging flex flex-col' : 'flex flex-col'} style={{ gap: 12 }}>
          {habits.length === 0 ? renderEmptyList(context) : null}
          <ListPresence>{(isDndEnabled ? activeDragPanels : dragPanels).map((panel) => (
            <ListMotionItem key={panel[0]?.id} className={HABIT_PANEL_CLASS_NAME} positionMotion={!isDndEnabled}
              style={isDndEnabled ? { ...listViewPanelStyle, overflow: 'visible' } : listViewPanelStyle}>
              {panel.filter((item) => item.depth === 0).map((item) => renderHabitTree(context, item, panel, isDndEnabled))}
            </ListMotionItem>
          ))}</ListPresence>
        </div>
      </SortableContext>
    </DndContext>
  )
}

function renderList(context: HabitListRenderingContext): React.ReactNode {
  const { habitsQuery, t, view, selectedDateStr, searchQuery, filters, launchFromCache, habits, reorderInstructionsId, reorderAnnouncements, drill, showAllDone, onSeeUpcoming } = context
  const { setListContainerRef } = context.drag

  if (habitsQuery.isLoading) return null
  if (habitsQuery.isError && !habitsQuery.data) return <HabitListEmptyState
    title={t('habits.loadError')} description="" actionLabel={t('common.retry')} actionIcon="refresh"
    onAction={() => { void habitsQuery.refetch() }} variant="secondary" />

  return <ContentFade key={JSON.stringify([view, selectedDateStr, searchQuery, filters])}><TodayLaunchContent enabled={view === 'today'} fromCache={launchFromCache} empty={habits.length === 0}><div
    ref={setListContainerRef}
    data-habit-list=""
    style={{ overflowAnchor: 'none' }}
    tabIndex={-1}
    role="group"
    aria-label={t('habits.sectionLabel')}
    className="min-w-0 px-screen-gutter"
  >
    <div id={reorderInstructionsId} className="sr-only">{t('dragAndDrop.habitInstructions')}</div>
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">{reorderAnnouncements[0]}</div>
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">{reorderAnnouncements[1]}</div>
    <div className="flex min-w-0 flex-col gap-6">
      {!drill.currentParent && showAllDone ? <HabitListAllDone onSeeUpcoming={onSeeUpcoming} /> : null}
      {renderMainContent(context)}
    </div>
  </div></TodayLaunchContent></ContentFade>
}

type HabitListRenderingContext = Pick<ReturnType<typeof useHabitListModalState>, 'cardSelectedDate' | 'setHabitToEdit' | 'setEditModalOnSaved' | 'setShowEditModal' | 'setHabitToReschedule' | 'setShowRescheduleSheet' | 'refusedSubHabitParentId'> & Pick<ReturnType<typeof useHabitListQueries>, 't' | 'displayTime' | 'selectedDateStr' | 'todayStr' | 'locale' | 'isOnline' | 'dndContextId' | 'accountHabitCount' | 'dragAccessibility' | 'habitsQuery' | 'launchFromCache'> & Pick<ReturnType<typeof useHabitListProgress>, 'getChildrenProgress'> & Pick<ReturnType<typeof useHabitRecentCompletionState>, 'recentlyCompletedIds'> & { drag: ReturnType<typeof useHabitListDrag> } & { isSelectMode: boolean } & Pick<HabitListProps, 'selectedHabitIds' | 'onToggleSelection' | 'onEnterSelectMode' | 'onClearSearch' | 'onCreate' | 'filters' | 'createRefusal' | 'onShowCompleted' | 'onSeeUpcoming'> & Pick<ReturnType<typeof useHabitListCollapse>, 'collapsedIds' | 'toggleExpand'> & Pick<ReturnType<typeof useParentPromptQueue>, 'handleDirectToggle' | 'skipFromRow'> & { confirmations: ReturnType<typeof useHabitListConfirmations> } & Pick<ReturnType<typeof useHabitListVisibility>, 'drill'> & Pick<ReturnType<typeof useHabitListMoveState>, 'openMoveParentPicker'> & Pick<ReturnType<typeof createHabitListSubHabitActions>, 'startAddSubHabit'> & Pick<ReturnType<typeof useHabitListEditState>, 'openDetail'> & Pick<ReturnType<typeof useHabitListKeyboardReorder>, 'reorderInstructionsId' | 'moveHabitByKeyboard' | 'reorderAnnouncements'> & Pick<ReturnType<typeof useHabitListRoots>, 'habits'> & { searchQuery: string } & { view: HabitView } & Pick<ReturnType<typeof getHabitListCompletion>, 'showAllDone'>

function createHabitListRendering(context: HabitListRenderingContext) {
  return { renderList: renderList.bind(null, context) }
}

type HabitListModelInputs = Pick<HabitListProps, 'ref' | 'onShowCompleted' | 'selectedHabitIds' | 'onBulkMove' | 'onClearSearch' | 'filters' | 'onToggleSelection' | 'onEnterSelectMode' | 'onCreate' | 'createRefusal' | 'onSeeUpcoming' | 'onAllLoadedIdsChange' | 'onAllCollapsedChange' | 'onSurfaceOpenChange'> & { view: HabitView } & { requestedDate: HabitListProps['selectedDate'] } & { showCompleted: boolean } & { isSelectMode: boolean } & { searchQuery: string }

function useHabitListModel(parameters: HabitListModelInputs) {
  const habitListQueries = useHabitListQueries(parameters)
  const habitRecentCompletionState = useHabitRecentCompletionState(habitListQueries)
  const habitRecentCompletions = useHabitRecentCompletions({ ...habitListQueries, ...habitRecentCompletionState })
  const habitListVisibility = useHabitListVisibility(habitListQueries, parameters, habitRecentCompletionState)
  const habitListCollapse = useHabitListCollapse(habitListQueries, parameters)
  const habitListRoots = useHabitListRoots(habitListQueries, parameters, habitRecentCompletionState, habitListVisibility)
  const habitListProgress = useHabitListProgress(habitListVisibility, parameters, habitListQueries)
  const drag = useHabitListDrag(habitListVisibility, parameters.view, habitListRoots, habitListQueries, habitListCollapse, parameters.isSelectMode)
  const habitListKeyboardReorder = useHabitListKeyboardReorder(habitListQueries, drag)
  const habitListModalState = useHabitListModalState(parameters, habitListQueries)
  const confirmations = useHabitListConfirmations(habitListQueries)
  const habitListMoveState = useHabitListMoveState(habitListQueries, parameters)
  const habitListEditState = useHabitListEditState(habitListModalState, habitListQueries)
  const habitListCompletion = getHabitListCompletion(parameters, habitListQueries)
  const habitListActions = createHabitListSubHabitActions({ ...habitListQueries, ...habitListModalState, ...habitListCollapse })
  const parentPromptQueue = useParentPromptQueue({ ...habitListQueries, ...habitListVisibility, ...parameters, ...habitRecentCompletions })
  useHabitListSurfaceState(habitRecentCompletions, confirmations, habitListVisibility, habitListModalState, parentPromptQueue, habitListMoveState, parameters)
  useHabitListHandle(parameters, habitListCollapse, habitListRoots, habitRecentCompletions, parentPromptQueue, habitListMoveState, drag)
  const habitListRendering = createHabitListRendering({ ...habitListModalState, ...habitListQueries, ...habitListProgress, ...habitRecentCompletionState, drag, ...parameters, ...habitListCollapse, ...parentPromptQueue, confirmations, ...habitListVisibility, ...habitListMoveState, ...habitListActions, ...habitListEditState, ...habitListKeyboardReorder, ...habitListRoots, ...habitListCompletion })
  return { queries: habitListQueries, modals: habitListModalState, move: habitListMoveState,
    edit: habitListEditState, parentPrompts: parentPromptQueue, rendering: habitListRendering, drag, confirmations }
}

'use client'

import { Fragment, useMemo, useCallback, useEffect, useId, useState, useRef as useReactRef, useImperativeHandle, type ComponentProps, type Ref } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import {
  canLogHabitOnDate,
  collectSelectableDescendantIds,
  collectVisibleHabitTreeIds,
  computeHabitCardStatus,
  computeHabitFutureHint,
  computeHabitReorderPositions,
  computeParentSettlementDecision,
  computeParentPromptProgress,
  formatAPIDate,
  formatAPIDateInTimeZone,
  getAllDoneOnDate,
  getTodayBoundary,
  hasAncestorInSet,
  hasHabitScheduleOnDate,
  isHabitDoneForRange,
  type HabitResolution,
  type HabitResolutionMode,
} from '@orbit/shared/utils'
import { HabitRow, type HabitRowMetaToken } from './habit-row'
import {
  HabitListEmptyState,
  HabitListAllDone,
  HabitListNothingOpen,
  HabitListSkeleton,
} from './habit-list/empty-state'
import { HabitDrill } from './habit-list/habit-drill'
import type { MoveParentOption } from './habit-list/move-parent-overlay'
import {
  buildDragItemsFlat,
  buildMoveParentOptions,
  groupDragItemsByPanel,
  validateMoveTarget as computeMoveTargetValidation,
  type DragItem,
} from './habit-list/tree-helpers'
import type { HabitStatus } from '@orbit/shared/contracts/lists'
import {
  EMPTY_CHILDREN_BY_PARENT,
  EMPTY_HABITS_BY_ID,
  EMPTY_NORMALIZED_HABITS,
  useHabits,
  useLogHabit,
  useSkipHabit,
  useDeleteHabit,
  useDuplicateHabit,
  useReorderHabits,
  useMoveHabitParent,
} from '@/hooks/use-habits'
import { useProfile } from '@/hooks/use-profile'
import { useToday } from '@/app/(app)/today-provider'
import { useTimeFormat } from '@/hooks/use-time-format'
import { useHabitVisibility } from '@/hooks/use-habit-visibility'
import { useDrillNavigation } from '@/hooks/use-drill-navigation'
import { addRecentCompletion, getRecentlyCompletedIdsForDate, removeRecentCompletion } from '@orbit/shared/utils/drill-navigation'
import { useConfig } from '@/hooks/use-config'
import { useHabitCountLoaded } from '@/hooks/use-habit-queries'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useDragAccessibility } from '@/components/ui/drag-accessibility'
import { SortableHabitItem } from './habit-list/sortable-habit-item'
import type { NormalizedHabit, HabitsFilter } from '@orbit/shared/types/habit'
import { useAccountGeneration, useAccountScopedState, useResetOnAccountChange } from '@/hooks/use-session-reset'
import { useOffline } from '@/hooks/use-offline'
import { OfflineRefusal } from '@/components/ui/offline-refusal'
import { useUIStore } from '@/stores/ui-store'

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
const MoveParentOverlay = dynamic(() =>
  import('./habit-list/move-parent-overlay').then((module) => module.MoveParentOverlay),
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

function DeferredMoveParentOverlay(
  props: Readonly<ComponentProps<typeof MoveParentOverlay>>,
) {
  return props.open ? <MoveParentOverlay {...props} /> : null
}

interface HabitListProps {
  ref?: Ref<HabitListHandle>
  view?: 'today'
  selectedDate?: Date
  showCompleted?: boolean
  onShowCompleted?: () => void
  isSelectMode?: boolean
  selectedHabitIds?: Set<string>
  searchQuery?: string
  filters: HabitsFilter
  onToggleSelection?: (habitId: string) => void
  onEnterSelectMode?: (habitId: string) => void
  onCreate?: () => void
  createRefusal?: boolean
  onSeeUpcoming?: () => void
  /** Notified whenever the all-collapsed status changes. Used by parent
   * components that need to surface this in render (e.g., a controls menu). */
  onAllCollapsedChange?: (allCollapsed: boolean) => void
  onSurfaceOpenChange?: (open: boolean) => void
}

const HABIT_PANEL_CLASS_NAME = 'habit-panel'

export interface HabitListHandle {
  collapseAll: () => void
  expandAll: () => void
  allCollapsed: boolean
  allLoadedIds: Set<string>
  markRecentlyCompleted: (habitId: string) => void
  checkAndPromptParentLog: (childHabitId: string) => void
  settleBulkHabitResolutions: (resolutions: readonly HabitResolution[], date: string) => void
}

interface ParentSettlementData {
  getChildren: (id: string) => NormalizedHabit[]
  visibility: ReturnType<typeof useHabitVisibility>
  habitsById: Map<string, NormalizedHabit>
  selectedDateStr: string
}

interface ParentSettlementOperation {
  data: ParentSettlementData
  date: string
  confirmedResolutions: ConfirmedResolutionRecord
  requiresLogConfirmation: boolean
}

interface ParentSettlementPrompt {
  habit: NormalizedHabit
  mode: 'log' | 'skip'
  date: string
}

interface ParentPromptQueue {
  date: string
  prompts: ParentSettlementPrompt[]
}

function getCurrentParentPrompt(queue: ParentPromptQueue, date: string) {
  if (queue.date !== date) return null
  return queue.prompts[0] ?? null
}

function enqueueParentPrompt(
  queue: ParentPromptQueue,
  prompt: ParentSettlementPrompt,
): ParentPromptQueue {
  const prompts = queue.date === prompt.date ? queue.prompts : []
  return { date: prompt.date, prompts: [...prompts, prompt] }
}

function removeParentPrompt(
  queue: ParentPromptQueue,
  habitId: string,
  date: string,
): ParentPromptQueue {
  if (queue.date !== date) return queue
  const prompts = queue.prompts.filter((prompt) => prompt.habit.id !== habitId)
  return prompts.length === queue.prompts.length ? queue : { ...queue, prompts }
}

function shiftParentPrompt(queue: ParentPromptQueue, date: string): ParentPromptQueue {
  if (queue.date !== date) return queue
  return { ...queue, prompts: queue.prompts.slice(1) }
}

interface ConfirmedResolutionRecord {
  date: string
  modes: Map<string, HabitResolutionMode>
  skippedIds: Set<string>
  activeSettlements: number
  clearWhenIdle: boolean
}

function getParentPromptProgress(
  habitId: string,
  confirmedResolutions: ConfirmedResolutionRecord,
  settlementData: ParentSettlementData | null,
) {
  if (!settlementData) return { done: 0, total: 0, loggedDone: 0 }
  return computeParentPromptProgress({
    parentId: habitId,
    getChildren: settlementData.getChildren,
    isRelevantToday: settlementData.visibility.isRelevantToday,
    isDueOnSelectedDate: settlementData.visibility.isDueOnSelectedDate,
    skippedIds: confirmedResolutions.skippedIds,
    resolvedModes: confirmedResolutions.modes,
  })
}

function clearPersistedResolutions(
  confirmedResolutions: ConfirmedResolutionRecord,
  habitsById: ReadonlyMap<string, NormalizedHabit>,
) {
  for (const habitId of confirmedResolutions.modes.keys()) {
    const habit = habitsById.get(habitId)
    const hasFlexibleSkip = habit?.flexibleTarget != null &&
      habit.flexibleCompleted != null &&
      habit.flexibleCompleted >= habit.flexibleTarget &&
      !habit.isLoggedInRange
    if (!habit?.isCompleted && !habit?.isLoggedInRange && !hasFlexibleSkip) continue
    confirmedResolutions.modes.delete(habitId)
    confirmedResolutions.skippedIds.delete(habitId)
  }
}

function refreshConfirmedResolutions(
  confirmedResolutions: ConfirmedResolutionRecord,
  hasQueuedParentPrompt: boolean,
  habitsById: ReadonlyMap<string, NormalizedHabit>,
) {
  if (hasQueuedParentPrompt) {
    clearPersistedResolutions(confirmedResolutions, habitsById)
    confirmedResolutions.clearWhenIdle = false
    return
  }
  if (confirmedResolutions.activeSettlements === 0) {
    confirmedResolutions.modes.clear()
    confirmedResolutions.skippedIds.clear()
    confirmedResolutions.clearWhenIdle = false
    return
  }
  confirmedResolutions.clearWhenIdle = true
}

function createConfirmedResolutionRecord(date: string): ConfirmedResolutionRecord {
  return {
    date,
    modes: new Map(),
    skippedIds: new Set(),
    activeSettlements: 0,
    clearWhenIdle: false,
  }
}

function getDeleteConfirmation(
  habitId: string | null,
  habitsById: ReadonlyMap<string, NormalizedHabit>,
  childrenByParent: ReadonlyMap<string, string[]>,
) {
  if (!habitId) return { name: '', descendantCount: 0 }
  return {
    name: habitsById.get(habitId)?.title ?? '',
    descendantCount: collectSelectableDescendantIds(
      habitId,
      (descendantId) => childrenByParent.get(descendantId) ?? [],
    ).length,
  }
}

// react-doctor-disable-next-line no-giant-component -- top-level habit-list surface owning query data, visibility, drill navigation, collapse state, and the full confirm-dialog cluster as one imperative-handle unit; extraction deferred to avoid regression without visual QA https://github.com/thomasluizon/orbit-ui-mobile/issues/243
export function HabitList({
  ref,
  view = 'today',
  selectedDate,
  showCompleted = false,
  onShowCompleted,
  isSelectMode = false,
  selectedHabitIds,
  searchQuery = '',
  filters,
  onToggleSelection,
  onEnterSelectMode,
  onCreate,
  createRefusal,
  onSeeUpcoming,
  onAllCollapsedChange,
  onSurfaceOpenChange,
}: Readonly<HabitListProps>) {
  const accountGeneration = useAccountGeneration()
  const t = useTranslations()
  const { isOnline } = useOffline()
  const router = useRouter()
  const { profile } = useProfile()
  const todayStr = useToday(profile?.timeZone)
  const locale = useLocale()
  const { displayTime } = useTimeFormat()
  const dndContextId = useId()

  const habitsQuery = useHabits(filters, undefined, { completeDay: true })
  const accountHabitCount = useHabitCountLoaded()
  const logHabit = useLogHabit()
  const skipHabit = useSkipHabit()
  const deleteHabitMut = useDeleteHabit()
  const duplicateHabitMut = useDuplicateHabit()
  const reorderHabitsMut = useReorderHabits()
  const moveHabitParentMut = useMoveHabitParent()

  const { config: appConfig } = useConfig()
  const maxHabitDepth = appConfig.limits.maxHabitDepth

  const data = habitsQuery.data
  const habitsById = data?.habitsById ?? EMPTY_HABITS_BY_ID
  const dragAccessibility = useDragAccessibility(t, (id) => habitsById.get(String(id))?.title)
  const childrenByParent = data?.childrenByParent ?? EMPTY_CHILDREN_BY_PARENT
  const topLevelHabits = data?.topLevelHabits ?? EMPTY_NORMALIZED_HABITS


  const getChildren = habitsQuery.getChildren

  const selectedDateStr = selectedDate ? formatAPIDate(selectedDate) : todayStr

  const [recentlyCompletedDates, setRecentlyCompletedDates] = useAccountScopedState(
    () => new Map<string, Set<string>>(),
  )
  const recentlyCompletedIds = useMemo(
    () => getRecentlyCompletedIdsForDate(recentlyCompletedDates, selectedDateStr),
    [recentlyCompletedDates, selectedDateStr],
  )
  const pendingToggleHabitIdsRef = useReactRef(new Set<string>())
  const promptedParentIdsRef = useReactRef(new Set<string>())
  const confirmedResolutionsRef = useReactRef(
    createConfirmedResolutionRecord(selectedDateStr),
  )
  const [parentPromptQueue, setParentPromptQueue] = useAccountScopedState<ParentPromptQueue>(() => ({
    date: selectedDateStr,
    prompts: [],
  }))
  const parentPrompt = getCurrentParentPrompt(parentPromptQueue, selectedDateStr)
  const hasQueuedParentPrompt = parentPrompt !== null
  const promptDataRef = useReactRef<ParentSettlementData | null>(null)

  const recentlyCompletedTimersRef = useReactRef(
    new Map<string, ReturnType<typeof setTimeout>>(),
  )

  useEffect(() => {
    const timers = recentlyCompletedTimersRef.current
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer)
      }
      timers.clear()
    }
  }, [recentlyCompletedTimersRef])

  const markRecentlyCompleted = useCallback((habitId: string, date = selectedDateStr) => {
    setRecentlyCompletedDates((prev) => addRecentCompletion(prev, habitId, date))
    const timers = recentlyCompletedTimersRef.current
    const timerKey = `${habitId}:${date}`
    const existing = timers.get(timerKey)
    if (existing) clearTimeout(existing)
    timers.set(
      timerKey,
      setTimeout(() => {
        timers.delete(timerKey)
        setRecentlyCompletedDates((prev) => removeRecentCompletion(prev, habitId, date))
      }, 1400),
    )
  }, [recentlyCompletedTimersRef, selectedDateStr, setRecentlyCompletedDates])

  const clearRecentlyCompleted = useCallback((habitId: string, date = selectedDateStr) => {
    const timers = recentlyCompletedTimersRef.current
    const timerKey = `${habitId}:${date}`
    const existing = timers.get(timerKey)
    if (existing) {
      clearTimeout(existing)
      timers.delete(timerKey)
    }
    setRecentlyCompletedDates((prev) => removeRecentCompletion(prev, habitId, date))
  }, [recentlyCompletedTimersRef, selectedDateStr, setRecentlyCompletedDates])

  useEffect(() => {
    promptedParentIdsRef.current.clear()
    confirmedResolutionsRef.current = createConfirmedResolutionRecord(selectedDateStr)
  }, [confirmedResolutionsRef, promptedParentIdsRef, selectedDateStr])
  const visibility = useHabitVisibility({
    habitsById,
    childrenByParent,
    selectedDate: selectedDateStr,
    searchQuery,
    showCompleted,
    recentlyCompletedIds,
  })

  const getVisibleChildren = useCallback(
    (parentId: string): NormalizedHabit[] => {
      return visibility.getVisibleChildren(parentId, view)
    },
    [visibility, view],
  )

  const drill = useDrillNavigation(habitsById, habitsQuery.dataUpdatedAt, {
    habitsById,
    childrenByParent,
    selectedDate: selectedDateStr,
    searchQuery,
    showCompleted,
    recentlyCompletedIds,
    recentlyCompletedDates,
  }, view, todayStr)

  const [collapsedIds, setCollapsedIds] = useAccountScopedState(() => new Set<string>())

  const toggleExpand = useCallback((habitId: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(habitId)) {
        next.delete(habitId)
      } else {
        next.add(habitId)
      }
      return next
    })
  }, [setCollapsedIds])

  const expandableIds = useMemo(() => {
    const ids: string[] = []
    for (const h of habitsById.values()) {
      const childIds = childrenByParent.get(h.id)
      if (childIds && childIds.length > 0) ids.push(h.id)
    }
    return ids
  }, [habitsById, childrenByParent])

  const allCollapsed = expandableIds.length > 0 && expandableIds.every((id) => collapsedIds.has(id))

  useEffect(() => {
    // react-doctor-disable-next-line no-pass-data-to-parent, no-pass-live-state-to-parent, no-prop-callback-in-effect -- allCollapsed is derived from both collapsedIds (local) and expandableIds (data-driven); the parent toolbar must reflect it, and no single event handler covers the data-driven changes, so a notify-effect is the correct channel https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    onAllCollapsedChange?.(allCollapsed)
  }, [allCollapsed, onAllCollapsedChange])

  const collapseAll = useCallback(() => {
    setCollapsedIds(new Set(expandableIds))
  }, [expandableIds, setCollapsedIds])

  const expandAll = useCallback(() => {
    setCollapsedIds(new Set())
  }, [setCollapsedIds])

  const habits = useMemo(() => {
    return topLevelHabits.filter((h) => visibility.hasVisibleContent(h))
    // react-doctor-disable-next-line exhaustive-deps -- topLevelHabits is destructured from the query data every render and already listed; the memo keys off the resolved array, not data.topLevelHabits https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  }, [topLevelHabits, visibility])

  const allLoadedIds = useMemo(() => {
    return collectVisibleHabitTreeIds(habits, getVisibleChildren)
  }, [getVisibleChildren, habits])

  useEffect(() => {
    promptDataRef.current = {
      getChildren,
      visibility,
      habitsById,
      selectedDateStr,
    }
    // react-doctor-disable-next-line exhaustive-deps -- getChildren and habitsById are aliased from the query result every render and already listed; the effect only mirrors the current render values into a ref, so no staleness is possible https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  }, [promptDataRef, getChildren, visibility, habitsById, selectedDateStr])

  const childrenProgressMap = useMemo(() => {
    const map = new Map<string, { done: number; total: number }>()

    function computeChildProgress(
      child: NormalizedHabit,
      computeFn: (id: string) => { done: number; total: number },
    ): { done: number; total: number } {
      let done = 0
      let total = 0

      if (child.isGeneral) {
        total++
        if (child.isCompleted) done++
      } else if (!visibility.isRelevantToday(child) && !child.isOverdue && !child.isLoggedInRange) {
        const nested = computeFn(child.id)
        return nested
      } else if (visibility.isDueOnSelectedDate(child) || child.isOverdue || child.isLoggedInRange) {
        total++
        if (child.isCompleted || child.isLoggedInRange) done++
      }

      const nested = computeFn(child.id)
      done += nested.done
      total += nested.total
      return { done, total }
    }

    function compute(habitId: string): { done: number; total: number } {
      const cached = map.get(habitId)
      if (cached) return cached

      const children = getChildren(habitId)
      if (children.length === 0) {
        const result = { done: 0, total: 0 }
        map.set(habitId, result)
        return result
      }

      let done = 0
      let total = 0
      for (const child of children) {
        const progress = computeChildProgress(child, compute)
        done += progress.done
        total += progress.total
      }

      const result = { done, total }
      map.set(habitId, result)
      return result
    }

    for (const habit of habitsById.values()) {
      if (!map.has(habit.id)) {
        compute(habit.id)
      }
    }

    return map
    // react-doctor-disable-next-line exhaustive-deps -- getChildren is aliased from habitsQuery.getChildren every render and already listed; the memo keys off the resolved function, not habitsQuery.getChildren https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  }, [habitsById, getChildren, visibility])

  const getChildrenProgress = useCallback(
    (habitId: string) => {
      return childrenProgressMap.get(habitId) ?? { done: 0, total: 0 }
    },
    [childrenProgressMap],
  )

  useEffect(() => {
    const confirmedResolutions = confirmedResolutionsRef.current
    refreshConfirmedResolutions(
      confirmedResolutions,
      hasQueuedParentPrompt,
      promptDataRef.current?.habitsById ?? EMPTY_HABITS_BY_ID,
    )
    for (const parentId of promptedParentIdsRef.current) {
      const { done, total } = getParentPromptProgress(
        parentId,
        confirmedResolutions,
        promptDataRef.current,
      )
      if (total === 0 || done < total) promptedParentIdsRef.current.delete(parentId)
    }
  }, [
    confirmedResolutionsRef,
    habitsQuery.dataUpdatedAt,
    hasQueuedParentPrompt,
    promptDataRef,
    promptedParentIdsRef,
  ])

  const dragItems = useMemo<DragItem[]>(() => {
    return buildDragItemsFlat(habits, collapsedIds, visibility.getVisibleChildren, view)
  }, [habits, collapsedIds, visibility, view])

  const [isDragging, setIsDragging] = useAccountScopedState(false)
  const autoCollapsedOnDragRef = useReactRef<string | null>(null)

  const dragItemsRef = useReactRef<DragItem[]>(dragItems)
  useEffect(() => {
    dragItemsRef.current = dragItems
  }, [dragItems, dragItemsRef])

  const [dragOverrideItems, setDragOverrideItems] = useAccountScopedState<DragItem[] | null>(null)
  const activeDragItems = dragOverrideItems ?? dragItems
  const dragPanels = useMemo(() => groupDragItemsByPanel(dragItems), [dragItems])
  const activeDragPanels = useMemo(
    () => groupDragItemsByPanel(activeDragItems),
    [activeDragItems],
  )

  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 5 },
  })
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 300, tolerance: 5 },
  })
  const keyboardSensor = useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates,
  })
  const sensors = useSensors(pointerSensor, touchSensor, keyboardSensor)

  const isDndEnabled = !isSelectMode

  function handleDragStart(event: DragStartEvent) {
    setIsDragging(true)
    autoCollapsedOnDragRef.current = null

    const draggedId = String(event.active.id)

    const currentItems = dragItemsRef.current
    const draggedItem = currentItems.find((item) => item.id === draggedId)
    if (!draggedItem) return

    const isCollapsed = collapsedIds.has(draggedItem.id)
    if (draggedItem.hasChildren && !isCollapsed) {
      autoCollapsedOnDragRef.current = draggedItem.id
      const draggedDepth = draggedItem.depth
      const filtered: DragItem[] = []
      let stripping = false
      for (const it of currentItems) {
        if (it.id === draggedId) {
          stripping = true
          filtered.push({ ...it, hasChildren: true })
          continue
        }
        if (stripping && it.depth > draggedDepth) {
          continue
        }
        stripping = false
        filtered.push(it)
      }
      setDragOverrideItems(filtered)
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    const items = dragOverrideItems ?? dragItemsRef.current

    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex((item) => item.id === active.id)
      const newIndex = items.findIndex((item) => item.id === over.id)

      if (oldIndex !== -1 && newIndex !== -1) {
        const positions = computeHabitReorderPositions(
          items, oldIndex, newIndex, habitsById, getChildren,
        )
        if (positions.length > 0) {
          reorderHabitsMut.mutate({ positions })
        }
      }
    }

    setIsDragging(false)
    setDragOverrideItems(null)

    const autoCollapsedId = autoCollapsedOnDragRef.current
    if (autoCollapsedId) {
      setCollapsedIds((prev) => {
        const next = new Set(prev)
        next.delete(autoCollapsedId)
        return next
      })
      autoCollapsedOnDragRef.current = null
    }
  }

  const cardSelectedDate = selectedDate ?? new Date()

  const [showEditModal, setShowEditModal] = useAccountScopedState(false)
  const [habitToEdit, setHabitToEdit] = useAccountScopedState<NormalizedHabit | null>(null)
  const [editModalOnSaved, setEditModalOnSaved] = useAccountScopedState<(() => void | Promise<void>) | null>(null)
  const [showSubHabitModal, setShowSubHabitModal] = useAccountScopedState(false)
  const [refusedSubHabitParentId, setRefusedSubHabitParentId] = useAccountScopedState<string | null>(null)
  useEffect(() => { if (isOnline) setRefusedSubHabitParentId(null) }, [isOnline, setRefusedSubHabitParentId])
  const [subHabitParent, setSubHabitParent] = useAccountScopedState<NormalizedHabit | null>(null)
  const [showRescheduleSheet, setShowRescheduleSheet] = useAccountScopedState(false)
  const [habitToReschedule, setHabitToReschedule] = useAccountScopedState<NormalizedHabit | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useAccountScopedState(false)
  const [deletePending, setDeletePending] = useAccountScopedState(false)
  const [habitToDelete, setHabitToDelete] = useAccountScopedState<{
    id: string; name: string; descendantCount: number
  } | null>(null)
  const [habitToDuplicate, setHabitToDuplicate] = useAccountScopedState<NormalizedHabit | null>(null)

  const [showMoveParentOverlay, setShowMoveParentOverlay] = useAccountScopedState(false)
  const [movingHabitId, setMovingHabitId] = useAccountScopedState<string | null>(null)
  const [selectedMoveParentId, setSelectedMoveParentId] = useAccountScopedState<string | null>(null)
  const [isMovingParent, setIsMovingParent] = useAccountScopedState(false)

  /**
   * The state above drops itself, but a ref carries the previous account's habit ids past an
   * account change with nothing to notice: a queued parent prompt, a pending toggle and a running
   * highlight timer each key on an id the next account does not own.
   */
  useResetOnAccountChange(() => {
    for (const timer of recentlyCompletedTimersRef.current.values()) clearTimeout(timer)
    recentlyCompletedTimersRef.current.clear()
    pendingToggleHabitIdsRef.current.clear()
    promptedParentIdsRef.current.clear()
    confirmedResolutionsRef.current = createConfirmedResolutionRecord(selectedDateStr)
    promptDataRef.current = null
    autoCollapsedOnDragRef.current = null
  })
  const movingHabit = movingHabitId ? habitsById.get(movingHabitId) ?? null : null
  const deleteConfirmation = habitToDelete ?? { name: '', descendantCount: 0 }

  const surfaceOpen = Boolean(
    drill.currentParent ||
    showEditModal ||
    showSubHabitModal ||
    showRescheduleSheet ||
    showDeleteConfirm ||
    deletePending ||
    habitToDuplicate ||
    parentPrompt ||
    showMoveParentOverlay,
  )
  useEffect(() => {
    onSurfaceOpenChange?.(surfaceOpen)
  }, [onSurfaceOpenChange, surfaceOpen])

  function recordHabitResolution(
    confirmedResolutions: ConfirmedResolutionRecord,
    habitId: string,
    mode: HabitResolutionMode,
  ) {
    confirmedResolutions.modes.set(habitId, mode)
    if (mode === 'skip') {
      confirmedResolutions.skippedIds.add(habitId)
    } else {
      confirmedResolutions.skippedIds.delete(habitId)
    }
  }

  function finishParentSettlement(confirmedResolutions: ConfirmedResolutionRecord) {
    confirmedResolutions.activeSettlements -= 1
    if (confirmedResolutions.activeSettlements === 0 && confirmedResolutions.clearWhenIdle) {
      confirmedResolutions.modes.clear()
      confirmedResolutions.skippedIds.clear()
      confirmedResolutions.clearWhenIdle = false
    }
  }

  function settlementDateIsReadOnly(date: string): boolean {
    return !profile || getTodayBoundary(
      date,
      formatAPIDateInTimeZone(new Date(), profile.timeZone),
    ) === 'read-only'
  }

  function checkAndSettleParent(
    childHabitId: string,
    confirmedResolutions: ConfirmedResolutionRecord,
    settlementData: ParentSettlementData | null = promptDataRef.current,
  ) {
    if (!settlementData) return
    const child = settlementData.habitsById.get(childHabitId)
    if (!child?.parentId) return
    const parent = settlementData.habitsById.get(child.parentId)
    if (!parent || parent.isCompleted) return
    if (settlementDateIsReadOnly(settlementData.selectedDateStr)) {
      promptedParentIdsRef.current.delete(parent.id)
      setParentPromptQueue((current) => removeParentPrompt(current, parent.id, settlementData.selectedDateStr))
      return
    }

    const parentIsDueOnViewedDate =
      parent.isGeneral ||
      parent.isOverdue ||
      hasHabitScheduleOnDate(parent, settlementData.selectedDateStr)
    if (!parentIsDueOnViewedDate) return

    const mode = computeParentSettlementDecision(
      parent,
      getParentPromptProgress(parent.id, confirmedResolutions, settlementData),
      settlementData.selectedDateStr,
    )
    if (mode) {
      confirmedResolutions.clearWhenIdle = false
      if (!promptedParentIdsRef.current.has(parent.id)) {
        promptedParentIdsRef.current.add(parent.id)
        setParentPromptQueue((current) => enqueueParentPrompt(current, {
          habit: parent,
          mode,
          date: settlementData.selectedDateStr,
        }))
      }
    } else {
      promptedParentIdsRef.current.delete(parent.id)
      setParentPromptQueue((current) => removeParentPrompt(
        current,
        parent.id,
        settlementData.selectedDateStr,
      ))
    }
  }

  function settleParentAutomatically(
    childHabitId: string,
    operation: ParentSettlementOperation,
  ) {
    const child = operation.data.habitsById.get(childHabitId)
    if (!child?.parentId) return
    const parent = operation.data.habitsById.get(child.parentId)
    if (!parent) return

    const mode = computeParentSettlementDecision(
      parent,
      getParentPromptProgress(
        parent.id,
        operation.confirmedResolutions,
        operation.data,
      ),
      operation.date,
    )
    if (!mode) {
      promptedParentIdsRef.current.delete(parent.id)
      return
    }
    if (promptedParentIdsRef.current.has(parent.id)) return

    if (mode === 'log' && operation.requiresLogConfirmation) {
      checkAndSettleParent(childHabitId, operation.confirmedResolutions, operation.data)
      return
    }

    promptedParentIdsRef.current.add(parent.id)
    void settleCompletedParent(parent.id, mode, operation, true)
  }

  async function settleCompletedParent(
    parentId: string,
    mode: HabitResolutionMode,
    operation: ParentSettlementOperation,
    automatic = false,
  ) {
    if (settlementDateIsReadOnly(operation.date)) {
      promptedParentIdsRef.current.delete(parentId)
      return
    }
    operation.confirmedResolutions.activeSettlements += 1
    markRecentlyCompleted(parentId, operation.date)
    try {
      try {
        if (mode === 'skip') {
          await skipHabit.mutateAsync({ habitId: parentId, date: operation.date })
        } else {
          await logHabit.mutateAsync({
            habitId: parentId,
            date: operation.date,
            intent: 'log',
          })
        }
      } catch {
        if (confirmedResolutionsRef.current === operation.confirmedResolutions) {
          promptedParentIdsRef.current.delete(parentId)
          clearRecentlyCompleted(parentId, operation.date)
        }
        return
      }

      if (
        promptDataRef.current?.selectedDateStr !== operation.date ||
        confirmedResolutionsRef.current !== operation.confirmedResolutions
      ) return
      recordHabitResolution(operation.confirmedResolutions, parentId, mode)
      if (automatic) settleParentAutomatically(parentId, operation)
      else checkAndSettleParent(parentId, operation.confirmedResolutions, operation.data)
    } finally {
      finishParentSettlement(operation.confirmedResolutions)
    }
  }

  function checkAndPromptParentLog(childHabitId: string) {
    const confirmedResolutions = confirmedResolutionsRef.current
    recordHabitResolution(confirmedResolutions, childHabitId, 'log')
    checkAndSettleParent(childHabitId, confirmedResolutions)
  }

  function settleBulkHabitResolutions(resolutions: readonly HabitResolution[], date: string) {
    const settlementData = promptDataRef.current
    if (!settlementData) return
    for (const resolution of resolutions) {
      markRecentlyCompleted(resolution.habitId, date)
    }
    if (selectedDateStr !== date || settlementData.selectedDateStr !== date) return
    const confirmedResolutions = confirmedResolutionsRef.current
    const resolvedIds = new Set(resolutions.map((resolution) => resolution.habitId))
    for (const resolution of resolutions) {
      recordHabitResolution(
        confirmedResolutions,
        resolution.habitId,
        resolution.mode,
      )
    }

    const childIdByAffectedParent = new Map<string, string>()
    for (const resolution of resolutions) {
      if (hasAncestorInSet(resolution.habitId, habitsById, resolvedIds)) continue
      const parentId = habitsById.get(resolution.habitId)?.parentId
      if (parentId && !childIdByAffectedParent.has(parentId)) {
        childIdByAffectedParent.set(parentId, resolution.habitId)
      }
    }

    const operation: ParentSettlementOperation = {
      data: settlementData,
      date,
      confirmedResolutions,
      requiresLogConfirmation: false,
    }
    for (const childId of childIdByAffectedParent.values()) {
      settleParentAutomatically(childId, operation)
    }
  }

  function validateMoveTarget(targetParentId: string | null, draggedId: string) {
    return computeMoveTargetValidation(
      { habitsById, getChildren, maxHabitDepth, t },
      targetParentId,
      draggedId,
    )
  }

  const moveParentOptions = ((): MoveParentOption[] => {
    if (!movingHabitId) return []
    return buildMoveParentOptions(
      { topLevelHabits, getChildren, validateMoveTarget, t },
      movingHabitId,
    )
  })()

  const selectedMoveOption = moveParentOptions.find(
    (option) => option.id === selectedMoveParentId,
  ) ?? null

  const editHabitLockedGeneral = ((): boolean | null => {
    if (!habitToEdit) return null
    if (habitToEdit.parentId) {
      return habitsById.get(habitToEdit.parentId)?.isGeneral ?? null
    }
    for (const candidate of habitsById.values()) {
      if (candidate.parentId === habitToEdit.id) return candidate.isGeneral
    }
    return null
  })()

  const canSubmitMoveParent =
    movingHabit !== null &&
    !isMovingParent &&
    selectedMoveParentId !== movingHabit.parentId &&
    selectedMoveOption !== null &&
    !selectedMoveOption.disabled

  function openMoveParentPicker(habitId: string) {
    const habit = habitsById.get(habitId)
    if (!habit) return
    setMovingHabitId(habitId)
    setSelectedMoveParentId(habit.parentId)
    setShowMoveParentOverlay(true)
  }

  function closeMoveParentPicker() {
    if (isMovingParent) return
    setShowMoveParentOverlay(false)
    setMovingHabitId(null)
    setSelectedMoveParentId(null)
  }

  async function confirmMoveParent() {
    if (!movingHabitId || !canSubmitMoveParent) return

    setIsMovingParent(true)
    try {
      await moveHabitParentMut.mutateAsync({
        habitId: movingHabitId,
        data: { parentId: selectedMoveParentId },
      })
      setShowMoveParentOverlay(false)
      setMovingHabitId(null)
      setSelectedMoveParentId(null)
    } catch {
    } finally {
      setIsMovingParent(false)
    }
  }

  function openDetail(habit: NormalizedHabit) {
    router.push(`/habits/${habit.id}?date=${selectedDateStr}&from=today`)
  }

  const handleEditModalOpenChange = useCallback((open: boolean) => {
    setShowEditModal(open)
    if (!open) {
      setHabitToEdit(null)
      setEditModalOnSaved(null)
    }
  }, [setEditModalOnSaved, setHabitToEdit, setShowEditModal])

  function promptDelete(habitId: string) {
    setHabitToDelete({ id: habitId, ...getDeleteConfirmation(habitId, habitsById, childrenByParent) })
    setShowDeleteConfirm(true)
  }

  async function confirmDuplicate() {
    if (!habitToDuplicate) return
    try {
      await duplicateHabitMut.mutateAsync(habitToDuplicate.id)
    } catch {
    } finally {
      setHabitToDuplicate(null)
    }
  }

  function startAddSubHabit(parentId: string) {
    if (profile?.hasProAccess === false) {
      router.push('/upgrade')
      return
    }

    const parent = habitsById.get(parentId)
    if (!parent) return
    if (!isOnline) { setRefusedSubHabitParentId(parentId); return }
    if (collapsedIds.has(parentId)) toggleExpand(parentId)
    setSubHabitParent(parent)
    setShowSubHabitModal(true)
  }

  async function confirmDelete() {
    if (!habitToDelete) return
    setDeletePending(true)
    setShowDeleteConfirm(false)
    try {
      await deleteHabitMut.mutateAsync(habitToDelete.id)
    } catch {
    } finally {
      setDeletePending(false)
    }
  }

  async function skipFromRow(habit: NormalizedHabit) {
    if (!profile) return
    const currentDate = new Date()
    const accountToday = formatAPIDateInTimeZone(currentDate, profile.timeZone)
    const boundary = getTodayBoundary(selectedDateStr, accountToday)
    if (boundary === 'read-only' || (boundary === 'future' &&
      !canLogHabitOnDate(habit, selectedDateStr, accountToday))) return
    const habitId = habit.id
    const date = selectedDateStr
    const settlementData = promptDataRef.current
    const confirmedResolutions = confirmedResolutionsRef.current
    try {
      await skipHabit.mutateAsync({
        habitId,
        date,
        onUndo: () => {
          confirmedResolutions.modes.delete(habitId)
          confirmedResolutions.skippedIds.delete(habitId)
        },
      })
      if (
        promptDataRef.current?.selectedDateStr !== date ||
        confirmedResolutionsRef.current !== confirmedResolutions
      ) return
      recordHabitResolution(confirmedResolutions, habitId, 'skip')
      if (settlementData) {
        settleParentAutomatically(habitId, {
          data: settlementData,
          date,
          confirmedResolutions,
          requiresLogConfirmation: true,
        })
      }
    } catch {
    }
  }

  function confirmParentSettlement() {
    const settlementData = promptDataRef.current
    if (!parentPrompt || parentPrompt.date !== selectedDateStr || !settlementData) return
    const parentId = parentPrompt.habit.id
    const currentParent = settlementData.habitsById.get(parentId) ?? null
    const confirmedResolutions = confirmedResolutionsRef.current
    const mode = computeParentSettlementDecision(
      currentParent,
      getParentPromptProgress(parentId, confirmedResolutions, settlementData),
      parentPrompt.date,
    )
    setParentPromptQueue((current) => removeParentPrompt(
      current,
      parentId,
      parentPrompt.date,
    ))
    if (!mode) {
      promptedParentIdsRef.current.delete(parentId)
      return
    }
    void settleCompletedParent(parentId, mode, {
      data: settlementData,
      date: parentPrompt.date,
      confirmedResolutions,
      requiresLogConfirmation: true,
    })
  }

  function handleLogged(habitId: string, markAsRecentlyCompleted: boolean) {
    if (markAsRecentlyCompleted) {
      markRecentlyCompleted(habitId)
    }

    checkAndPromptParentLog(habitId)
  }

  async function handleDirectToggle(habitId: string, intent: 'log' | 'unlog') {
    if (!profile) return
    const currentDate = new Date()
    const accountToday = formatAPIDateInTimeZone(currentDate, profile.timeZone)
    const boundary = getTodayBoundary(selectedDateStr, accountToday)
    const habit = habitsById.get(habitId)
    if (boundary === 'read-only' || (!selectedDate && selectedDateStr !== accountToday) ||
      (boundary === 'future' && (!habit || !canLogHabitOnDate(habit, selectedDateStr, accountToday)))) return
    const pendingHabitIds = pendingToggleHabitIdsRef.current
    if (pendingHabitIds.has(habitId)) return

    pendingHabitIds.add(habitId)
    if (intent === 'log') markRecentlyCompleted(habitId)
    let mutationSucceeded = false

    try {
      await logHabit.mutateAsync(
        selectedDate ? { habitId, date: selectedDateStr, intent } : { habitId, intent },
      )
      mutationSucceeded = true
      if (intent === 'log') handleLogged(habitId, false)
      await habitsQuery.refetch()
    } catch {
      if (!mutationSucceeded && intent === 'log') clearRecentlyCompleted(habitId)
    } finally {
      pendingHabitIds.delete(habitId)
    }
  }
  useImperativeHandle(ref, () => ({
    collapseAll,
    expandAll,
    get allCollapsed() { return allCollapsed },
    get allLoadedIds() { return allLoadedIds },
    markRecentlyCompleted,
    checkAndPromptParentLog,
    settleBulkHabitResolutions,
  }))

  const listContainerRef = useReactRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = listContainerRef.current
    if (!container) return

    const handleHomeEndFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Home' && event.key !== 'End') return

      const rows = Array.from(
        container.querySelectorAll<HTMLElement>(':scope [role="button"][tabindex="0"]'),
      )
      const activeElement = document.activeElement
      if (!(activeElement instanceof HTMLElement) || !rows.includes(activeElement)) return

      const target = event.key === 'Home' ? rows[0] : rows.at(-1)
      if (!target) return
      event.preventDefault()
      target.focus()
    }

    container.addEventListener('keydown', handleHomeEndFocus)
    return () => container.removeEventListener('keydown', handleHomeEndFocus)
  }, [listContainerRef])

  function deriveRowState(
    habit: NormalizedHabit,
    recentlyCompleted: boolean,
  ): HabitStatus {
    if (habit.isBadHabit) return 'bad'
    const completed = recentlyCompleted || isHabitDoneForRange(habit)
    if (completed) return 'done'
    const status = computeHabitCardStatus(habit, cardSelectedDate)
    if (status === 'overdue') return 'overdue'
    return 'empty'
  }

  function buildMetaTokens(habit: NormalizedHabit, childProgress?: { done: number; total: number }): HabitRowMetaToken[] {
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

  function renderHabitCard(
    habit: NormalizedHabit,
    depth: number,
    hasChildren: boolean,
    hasSubHabits: boolean,
    options?: {
      isDrillCard?: boolean
      isDraggingList?: boolean
      childPanelId?: string
    },
  ) {
    const progress = hasChildren ? getChildrenProgress(habit.id) : undefined
    const displayDepth: 0 | 1 = depth === 0 ? 0 : 1
    const isChild = displayDepth === 1
    const recentlyCompleted = recentlyCompletedIds.has(habit.id)
    const state = deriveRowState(habit, recentlyCompleted)
    const meta = buildMetaTokens(habit, progress)
    const canLog = canLogHabitOnDate(habit, selectedDateStr, todayStr)
    const boundary = getTodayBoundary(selectedDateStr, todayStr)
    const completionReadOnly = boundary === 'read-only' || (boundary === 'future' && !canLog)
    const hasLinkedGoal = (habit.linkedGoals?.length ?? 0) > 0
    return (
      <Fragment key={habit.id}>
      <HabitRow
        habit={habit}
        structuralColumn
        state={state}
        meta={meta}
        canLog={canLog}
        completionReadOnly={completionReadOnly}
        completionReason={boundary === 'read-only' ? t('habits.todayBoundary.readOnly') : boundary === 'future' ? t('habits.todayBoundary.future') : undefined}
        hasProAccess={profile?.hasProAccess !== false}
        streak={habit.currentStreak}
        child={isChild}
        depth={displayDepth}
        selectMode={isSelectMode}
        selected={selectedHabitIds?.has(habit.id) ?? false}
        hasChildren={hasChildren}
        hasSubHabits={hasSubHabits}
        expanded={!collapsedIds.has(habit.id)}
        childPanelId={options?.childPanelId}
        childProgress={progress}
        showLinkedGoalDot={hasLinkedGoal}
        actions={{
          onLog: () => { void handleDirectToggle(habit.id, 'log') },
          onUnlog: () => { void handleDirectToggle(habit.id, 'unlog') },
          onSkip: completionReadOnly ? undefined : () => { void skipFromRow(habit) },
          onDuplicate: () => setHabitToDuplicate(habit),
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
          onDelete: () => promptDelete(habit.id),
          onDetail: () => openDetail(habit),
          onDrillInto: () => void drill.drillInto(habit.id),
          onAddSubHabit: () => startAddSubHabit(habit.id),
          onToggleExpand: () => toggleExpand(habit.id),
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

  if (habitsQuery.isLoading) {
    return <HabitListSkeleton />
  }

  if (habitsQuery.isError && !habitsQuery.data) {
    return (
      <HabitListEmptyState
        title={t('habits.loadError')}
        description=""
        actionLabel={t('common.retry')}
        onAction={() => {
          void habitsQuery.refetch()
        }}
        variant="secondary"
      />
    )
  }

  const showAllDone = !(accountHabitCount.isLoaded && accountHabitCount.count === 0) &&
    selectedDateStr === todayStr &&
    getAllDoneOnDate(habitsById, childrenByParent, selectedDateStr).allDone

  function renderHabitTree(item: DragItem, panel: DragItem[], sortable: boolean): React.ReactNode {
    const childPanelId = item.hasChildren ? `${dndContextId}-habit-children-${item.id}` : undefined
    const row = renderHabitCard(
      item.habit,
      item.depth,
      item.hasChildren,
      item.hasSubHabits,
      { isDraggingList: isDragging, childPanelId },
    )
    return (
      <Fragment key={item.id}>
        {sortable ? <SortableHabitItem id={item.id}>{row}</SortableHabitItem> : row}
        {item.hasChildren ? (
          <div id={childPanelId} hidden={collapsedIds.has(item.id)}>
            {panel.filter((child) => child.parentId === item.id).map((child) => renderHabitTree(child, panel, sortable))}
          </div>
        ) : null}
      </Fragment>
    )
  }

  function renderMainContent(): React.ReactNode {
    if (drill.currentParent) {
      return (
        <HabitDrill
          t={t}
          drill={drill}
          hasProAccess={profile?.hasProAccess !== false}
          renderHabitCard={renderHabitCard}
          onAddSubHabit={startAddSubHabit}
          subHabitRefusal={refusedSubHabitParentId === drill.currentParentId && !isOnline}
          onShowCompleted={onShowCompleted}
        />
      )
    }

    if (habits.length === 0) {
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

    if (isDndEnabled) {
      return (
        <DndContext
          id={dndContextId}
          accessibility={dragAccessibility}
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={activeDragItems.map((item) => item.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className={isDragging ? 'is-dragging flex flex-col' : 'flex flex-col'} style={{ gap: 12 }}>
              {activeDragPanels.map((panel) => (
                <div key={panel[0]?.id} className={HABIT_PANEL_CLASS_NAME}>
                  {panel.filter((item) => item.depth === 0).map((item) => renderHabitTree(item, panel, true))}
                </div>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )
    }

    return (
      <div className="flex flex-col" style={{ gap: 12 }}>
        {dragPanels.map((panel) => (
          <div key={panel[0]?.id} className={HABIT_PANEL_CLASS_NAME}>
            {panel.filter((item) => item.depth === 0).map((item) => renderHabitTree(item, panel, false))}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div
      ref={listContainerRef}
      tabIndex={-1}
      className="px-[16px]"
    >
      {!drill.currentParent && showAllDone ? <HabitListAllDone onSeeUpcoming={onSeeUpcoming} /> : null}
      {renderMainContent()}

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
        parentPrompt={parentPrompt?.date === selectedDateStr
          ? { id: parentPrompt.habit.id, name: parentPrompt.habit.title, mode: parentPrompt.mode }
          : null}
        onConfirmDelete={() => void confirmDelete()}
        onDeleteClosed={() => {
          setHabitToDelete(null)
          listContainerRef.current?.focus()
        }}
        onCancelDelete={() => {
          setHabitToDelete(null)
          setShowDeleteConfirm(false)
        }}
        onConfirmDuplicate={() => void confirmDuplicate()}
        onCancelDuplicate={() => setHabitToDuplicate(null)}
        onConfirmParent={confirmParentSettlement}
        onCancelParent={() => setParentPromptQueue(
          (current) => shiftParentPrompt(current, selectedDateStr),
        )}
      />

      <DeferredMoveParentOverlay
        t={t}
        open={showMoveParentOverlay}
        isMoving={isMovingParent}
        movingHabitTitle={movingHabit?.title ?? null}
        movingHabitParentId={movingHabit?.parentId ?? null}
        options={moveParentOptions}
        selectedMoveParentId={selectedMoveParentId}
        canSubmit={canSubmitMoveParent}
        onClose={closeMoveParentPicker}
        onConfirm={() => void confirmMoveParent()}
        onSelectOption={setSelectedMoveParentId}
      />
    </div>
  )
}

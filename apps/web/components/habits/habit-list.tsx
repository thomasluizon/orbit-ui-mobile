'use client'

import { useState, useMemo, useCallback, useEffect, useRef as useReactRef, useImperativeHandle, type ComponentProps, type Ref } from 'react'
import {
  ArrowLeft,
  Home,
} from '@/components/ui/icons'
import { useTranslations, useLocale } from 'next-intl'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import {
  buildHabitDateBuckets,
  canLogHabitOnDate,
  collectVisibleHabitTreeIds,
  computeHabitCardStatus,
  computeHabitFrequencyLabel,
  computeHabitFutureHint,
  computeHabitReorderPositions,
  computeParentPromptProgress,
  formatAPIDate,
  getHabitEmptyStateKey,
  getTodayBoundary,
  hasAncestorInSet,
  hasHabitScheduleOnDate,
  isHabitVisibleInAllView,
  type HabitResolution,
  type HabitResolutionMode,
} from '@orbit/shared/utils'
import { HabitRow, type HabitRowMetaToken } from './habit-row'
import {
  HabitListEmptyState,
  HabitListSkeleton,
} from './habit-list/empty-state'
import { getEmptyHabitsMessage } from './habit-list/empty-state-message'
import {
  HabitListDateGroupSection,
  type HabitListDateGroup,
} from './habit-list/date-group-section'
import { formatDateGroupLabel } from './habit-list/date-group-label'
import { HabitListDrillContent } from './habit-list/drill-content'
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
import { useTimeFormat } from '@/hooks/use-time-format'
import { useHabitVisibility } from '@/hooks/use-habit-visibility'
import { useDrillNavigation } from '@/hooks/use-drill-navigation'
import { useConfig } from '@/hooks/use-config'
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
import { SortableHabitItem } from './habit-list/sortable-habit-item'
import type { NormalizedHabit, HabitsFilter } from '@orbit/shared/types/habit'

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
  return props.showDeleteConfirm ? <HabitListConfirmDialogs {...props} /> : null
}

function DeferredMoveParentOverlay(
  props: Readonly<ComponentProps<typeof MoveParentOverlay>>,
) {
  return props.open ? <MoveParentOverlay {...props} /> : null
}

const HABIT_PANEL_STYLE = {
  marginInline: 16,
  overflow: 'hidden',
  borderRadius: 20,
  background: 'var(--bg-card)',
  boxShadow: 'inset 0 0 0 1px var(--hairline-ghost, var(--hairline))',
} as const

interface HabitListProps {
  ref?: Ref<HabitListHandle>
  view?: 'today' | 'all' | 'general'
  selectedDate?: Date
  showCompleted?: boolean
  isSelectMode?: boolean
  selectedHabitIds?: Set<string>
  searchQuery?: string
  filters: HabitsFilter
  onToggleSelection?: (habitId: string) => void
  onEnterSelectMode?: (habitId: string) => void
  onCreate?: () => void
  onSeeUpcoming?: () => void
  /** Notified whenever the all-collapsed status changes. Used by parent
   * components that need to surface this in render (e.g., a controls menu). */
  onAllCollapsedChange?: (allCollapsed: boolean) => void
}

export interface HabitListHandle {
  collapseAll: () => void
  expandAll: () => void
  allCollapsed: boolean
  allLoadedIds: Set<string>
  markRecentlyCompleted: (habitId: string) => void
  checkAndPromptParentLog: (childHabitId: string) => void
  settleBulkHabitResolutions: (resolutions: readonly HabitResolution[]) => void
}

const TOUR_FEATURED_HABIT_ID = 'tour-habit-2'

// react-doctor-disable-next-line no-giant-component -- top-level habit-list surface owning query data, visibility, drill navigation, collapse state, and the full confirm-dialog cluster as one imperative-handle unit; extraction deferred to avoid regression without visual QA https://github.com/thomasluizon/orbit-ui-mobile/issues/243
export function HabitList({
  ref,
  view = 'today',
  selectedDate,
  showCompleted = false,
  isSelectMode = false,
  selectedHabitIds,
  searchQuery = '',
  filters,
  onToggleSelection,
  onEnterSelectMode,
  onCreate,
  onSeeUpcoming,
  onAllCollapsedChange,
}: Readonly<HabitListProps>) {
  const t = useTranslations()
  const router = useRouter()
  const { profile } = useProfile()
  const locale = useLocale()
  const { displayTime } = useTimeFormat()

  const habitsQuery = useHabits(filters)
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
  const childrenByParent = data?.childrenByParent ?? EMPTY_CHILDREN_BY_PARENT
  const topLevelHabits = data?.topLevelHabits ?? EMPTY_NORMALIZED_HABITS

  const tourCardHabitId = habitsById.has(TOUR_FEATURED_HABIT_ID)
    ? TOUR_FEATURED_HABIT_ID
    : topLevelHabits[0]?.id

  const getChildren = habitsQuery.getChildren

  const [recentlyCompletedIds, setRecentlyCompletedIds] = useState(
    new Set<string>(),
  )
  const pendingToggleHabitIdsRef = useReactRef(new Set<string>())
  const promptedParentIdsRef = useReactRef(new Set<string>())
  const skippedChildIdsRef = useReactRef(new Set<string>())
  const resolvedModesRef = useReactRef(new Map<string, HabitResolutionMode>())
  const promptDataRef = useReactRef<{
    getChildren: (id: string) => NormalizedHabit[]
    isListView: boolean
    visibility: ReturnType<typeof useHabitVisibility>
    habitsById: Map<string, NormalizedHabit>
    selectedDateStr: string
  } | null>(null)

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

  const markRecentlyCompleted = useCallback((habitId: string) => {
    setRecentlyCompletedIds((prev) => new Set(prev).add(habitId))
    const timers = recentlyCompletedTimersRef.current
    const existing = timers.get(habitId)
    if (existing) clearTimeout(existing)
    timers.set(
      habitId,
      setTimeout(() => {
        timers.delete(habitId)
        setRecentlyCompletedIds((prev) => {
          const next = new Set(prev)
          next.delete(habitId)
          return next
        })
      }, 1400),
    )
  }, [recentlyCompletedTimersRef])

  const clearRecentlyCompleted = useCallback((habitId: string) => {
    const timers = recentlyCompletedTimersRef.current
    const existing = timers.get(habitId)
    if (existing) {
      clearTimeout(existing)
      timers.delete(habitId)
    }
    setRecentlyCompletedIds((prev) => {
      if (!prev.has(habitId)) return prev
      const next = new Set(prev)
      next.delete(habitId)
      return next
    })
  }, [recentlyCompletedTimersRef])

  const selectedDateStr = selectedDate ? formatAPIDate(selectedDate) : formatAPIDate(new Date())
  const todayStr = formatAPIDate(new Date())
  useEffect(() => {
    promptedParentIdsRef.current.clear()
    skippedChildIdsRef.current.clear()
    resolvedModesRef.current.clear()
  }, [promptedParentIdsRef, resolvedModesRef, selectedDateStr, skippedChildIdsRef])
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

  const drill = useDrillNavigation(habitsById, habitsQuery.dataUpdatedAt)

  const [collapsedIds, setCollapsedIds] = useState(new Set<string>())

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
  }, [])

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
  }, [expandableIds])

  const expandAll = useCallback(() => {
    setCollapsedIds(new Set())
  }, [])

  const habits = useMemo(() => {
    if (view === 'all') {
      return topLevelHabits.filter((h) => isHabitVisibleInAllView(h, showCompleted))
    }

    if (view === 'general') {
      return showCompleted
        ? topLevelHabits
        : topLevelHabits.filter(
            (h) => !h.isCompleted || recentlyCompletedIds.has(h.id),
          )
    }
    if (showCompleted) return topLevelHabits
    return topLevelHabits.filter((h) => visibility.hasVisibleContent(h))
    // react-doctor-disable-next-line exhaustive-deps -- topLevelHabits is destructured from the query data every render and already listed; the memo keys off the resolved array, not data.topLevelHabits https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  }, [topLevelHabits, view, showCompleted, recentlyCompletedIds, visibility])

  const allLoadedIds = useMemo(() => {
    return collectVisibleHabitTreeIds(habits, getVisibleChildren)
  }, [getVisibleChildren, habits])

  const isListView = view === 'all' || view === 'general'
  useEffect(() => {
    promptDataRef.current = {
      getChildren,
      isListView,
      visibility,
      habitsById,
      selectedDateStr,
    }
    // react-doctor-disable-next-line exhaustive-deps -- getChildren and habitsById are aliased from the query result every render and already listed; the effect only mirrors the current render values into a ref, so no staleness is possible https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  }, [promptDataRef, getChildren, isListView, visibility, habitsById, selectedDateStr])

  const childrenProgressMap = useMemo(() => {
    const map = new Map<string, { done: number; total: number }>()

    function computeChildProgress(
      child: NormalizedHabit,
      computeFn: (id: string) => { done: number; total: number },
    ): { done: number; total: number } {
      let done = 0
      let total = 0

      if (isListView || child.isGeneral) {
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
  }, [habitsById, getChildren, isListView, visibility])

  const getChildrenProgress = useCallback(
    (habitId: string) => {
      return childrenProgressMap.get(habitId) ?? { done: 0, total: 0 }
    },
    [childrenProgressMap],
  )

  const getChildrenProgressForPrompt = useCallback(
    (
      habitId: string,
      resolvedModes: ReadonlyMap<string, HabitResolutionMode> = resolvedModesRef.current,
    ) => {
      const data = promptDataRef.current
      if (!data) return { done: 0, total: 0, loggedDone: 0 }
      return computeParentPromptProgress({
        parentId: habitId,
        getChildren: data.getChildren,
        isRelevantToday: data.visibility.isRelevantToday,
        isDueOnSelectedDate: data.visibility.isDueOnSelectedDate,
        isListView: data.isListView,
        skippedIds: skippedChildIdsRef.current,
        resolvedModes,
      })
    },
    [promptDataRef, resolvedModesRef, skippedChildIdsRef],
  )

  useEffect(() => {
    resolvedModesRef.current.clear()
    for (const parentId of promptedParentIdsRef.current) {
      const { done, total } = getChildrenProgressForPrompt(parentId)
      if (total === 0 || done < total) promptedParentIdsRef.current.delete(parentId)
    }
  }, [getChildrenProgressForPrompt, habitsQuery.dataUpdatedAt, promptedParentIdsRef, resolvedModesRef])

  const dateGroups = useMemo<HabitListDateGroup[]>(() => {
    if (view !== 'all') return []

    const today = formatAPIDate(new Date())
    return buildHabitDateBuckets(habits, today).map((bucket) => ({
      ...bucket,
      label:
        bucket.key === '__overdue__'
          ? t('habits.overdue')
          : formatDateGroupLabel(bucket.key, locale, t),
    }))
  }, [view, habits, t, locale])

  const dragItems = useMemo<DragItem[]>(() => {
    if (view === 'all') return []
    return buildDragItemsFlat(habits, collapsedIds, visibility.getVisibleChildren, view)
  }, [habits, collapsedIds, visibility, view])

  const [isDragging, setIsDragging] = useState(false)
  const autoCollapsedOnDragRef = useReactRef<string | null>(null)

  const dragItemsRef = useReactRef<DragItem[]>(dragItems)
  useEffect(() => {
    dragItemsRef.current = dragItems
  }, [dragItems, dragItemsRef])

  const [dragOverrideItems, setDragOverrideItems] = useState<DragItem[] | null>(null)
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

  const isDndEnabled = view !== 'all' && !isSelectMode

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

  const cardSelectedDate = view === 'today' ? (selectedDate ?? new Date()) : undefined

  const [showEditModal, setShowEditModal] = useState(false)
  const [habitToEdit, setHabitToEdit] = useState<NormalizedHabit | null>(null)
  const [editModalOnSaved, setEditModalOnSaved] = useState<(() => void | Promise<void>) | null>(null)
  const [showSubHabitModal, setShowSubHabitModal] = useState(false)
  const [subHabitParent, setSubHabitParent] = useState<NormalizedHabit | null>(null)
  const [showRescheduleSheet, setShowRescheduleSheet] = useState(false)
  const [habitToReschedule, setHabitToReschedule] = useState<NormalizedHabit | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [habitToDelete, setHabitToDelete] = useState<string | null>(null)

  const [showMoveParentOverlay, setShowMoveParentOverlay] = useState(false)
  const [movingHabitId, setMovingHabitId] = useState<string | null>(null)
  const [selectedMoveParentId, setSelectedMoveParentId] = useState<string | null>(null)
  const [isMovingParent, setIsMovingParent] = useState(false)
  const movingHabit = movingHabitId ? habitsById.get(movingHabitId) ?? null : null

  function recordHabitResolution(habitId: string, mode: HabitResolutionMode) {
    resolvedModesRef.current.set(habitId, mode)
    if (mode === 'skip') {
      skippedChildIdsRef.current.add(habitId)
    } else {
      skippedChildIdsRef.current.delete(habitId)
    }
  }

  function checkAndSettleParent(
    childHabitId: string,
    resolvedModes: ReadonlyMap<string, HabitResolutionMode>,
  ) {
    const data = promptDataRef.current
    if (!data) return
    const child = data.habitsById.get(childHabitId)
    if (!child?.parentId) return
    const parent = data.habitsById.get(child.parentId)
    if (!parent || parent.isCompleted) return

    const parentIsDueOnViewedDate =
      parent.isGeneral ||
      parent.isOverdue ||
      hasHabitScheduleOnDate(parent, data.selectedDateStr)
    if (!parentIsDueOnViewedDate) return

    const { done, total, loggedDone } = getChildrenProgressForPrompt(parent.id, resolvedModes)
    if (total > 0 && done >= total) {
      if (!promptedParentIdsRef.current.has(parent.id)) {
        promptedParentIdsRef.current.add(parent.id)
        const mode = loggedDone > 0 ? 'log' : 'skip'
        const ancestorResolvedModes = new Map(resolvedModes).set(parent.id, mode)
        recordHabitResolution(parent.id, mode)
        void settleCompletedParent(parent.id, mode, data.selectedDateStr, ancestorResolvedModes)
      }
    } else {
      promptedParentIdsRef.current.delete(parent.id)
    }
  }

  async function settleCompletedParent(
    parentId: string,
    mode: HabitResolutionMode,
    settlementDate: string,
    resolvedModes: ReadonlyMap<string, HabitResolutionMode>,
  ) {
    markRecentlyCompleted(parentId)
    try {
      if (mode === 'skip') {
        await skipHabit.mutateAsync({ habitId: parentId, date: settlementDate })
      } else {
        await logHabit.mutateAsync({ habitId: parentId, date: settlementDate })
      }
      checkAndSettleParent(parentId, resolvedModes)
    } catch {
      promptedParentIdsRef.current.delete(parentId)
      resolvedModesRef.current.delete(parentId)
      skippedChildIdsRef.current.delete(parentId)
      clearRecentlyCompleted(parentId)
    }
  }

  function checkAndPromptParentLog(childHabitId: string) {
    recordHabitResolution(childHabitId, 'log')
    checkAndSettleParent(childHabitId, new Map(resolvedModesRef.current))
  }

  function settleBulkHabitResolutions(resolutions: readonly HabitResolution[]) {
    const resolvedIds = new Set(resolutions.map((resolution) => resolution.habitId))
    for (const resolution of resolutions) {
      recordHabitResolution(resolution.habitId, resolution.mode)
      markRecentlyCompleted(resolution.habitId)
    }

    const childIdByAffectedParent = new Map<string, string>()
    for (const resolution of resolutions) {
      if (hasAncestorInSet(resolution.habitId, habitsById, resolvedIds)) continue
      const parentId = habitsById.get(resolution.habitId)?.parentId
      if (parentId && !childIdByAffectedParent.has(parentId)) {
        childIdByAffectedParent.set(parentId, resolution.habitId)
      }
    }

    const resolvedSnapshot = new Map(resolvedModesRef.current)
    for (const childId of childIdByAffectedParent.values()) {
      checkAndSettleParent(childId, resolvedSnapshot)
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
  }, [])

  function promptDelete(habitId: string) {
    setHabitToDelete(habitId)
    setShowDeleteConfirm(true)
  }

  async function duplicateImmediately(id: string) {
    try {
      await duplicateHabitMut.mutateAsync(id)
    } catch {
    }
  }

  function startAddSubHabit(parentId: string) {
    if (profile?.hasProAccess === false) {
      router.push('/upgrade')
      return
    }

    const parent = habitsById.get(parentId)
    if (!parent) return
    if (collapsedIds.has(parentId)) toggleExpand(parentId)
    setSubHabitParent(parent)
    setShowSubHabitModal(true)
  }

  async function confirmDelete() {
    if (!habitToDelete) return
    try {
      await deleteHabitMut.mutateAsync(habitToDelete)
    } catch {
    } finally {
      setHabitToDelete(null)
      setShowDeleteConfirm(false)
    }
  }

  async function handleSkip(habitId: string) {
    try {
      await skipHabit.mutateAsync({ habitId, date: selectedDateStr })
      recordHabitResolution(habitId, 'skip')
      markRecentlyCompleted(habitId)
      checkAndSettleParent(habitId, new Map(resolvedModesRef.current))
    } catch {
    }
  }

  function handleLogged(habitId: string, markAsRecentlyCompleted: boolean) {
    if (markAsRecentlyCompleted) {
      markRecentlyCompleted(habitId)
    }

    checkAndPromptParentLog(habitId)
  }

  async function handleDirectToggle(habitId: string, intent: 'log' | 'unlog') {
    const pendingHabitIds = pendingToggleHabitIdsRef.current
    if (pendingHabitIds.has(habitId)) return

    pendingHabitIds.add(habitId)
    if (intent === 'log') markRecentlyCompleted(habitId)
    let mutationSucceeded = false

    try {
      await logHabit.mutateAsync(
        selectedDate ? { habitId, date: selectedDateStr } : { habitId },
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
    const completed = recentlyCompleted || habit.isCompleted || habit.isLoggedInRange
    if (completed) return 'done'
    const status = computeHabitCardStatus(habit, view === 'today' ? cardSelectedDate : undefined)
    if (status === 'overdue') return 'overdue'
    return 'empty'
  }

  function buildMetaTokens(habit: NormalizedHabit): HabitRowMetaToken[] {
    const tokens: HabitRowMetaToken[] = []
    const freqLabel = computeHabitFrequencyLabel(habit, t)
    if (freqLabel) tokens.push(freqLabel)
    if (habit.dueTime) tokens.push(displayTime(habit.dueTime))
    if (habit.checklistItems.length > 0) {
      const done = habit.checklistItems.filter((c) => c.isChecked).length
      tokens.push(`${done}/${habit.checklistItems.length}`)
    }
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
    },
  ) {
    const progress = hasChildren ? getChildrenProgress(habit.id) : { done: 0, total: 0 }
    const displayDepth: 0 | 1 = depth === 0 ? 0 : 1
    const isChild = displayDepth === 1
    const recentlyCompleted = recentlyCompletedIds.has(habit.id)
    const state = deriveRowState(habit, recentlyCompleted)
    const meta = buildMetaTokens(habit)
    const canLog = canLogHabitOnDate(habit, selectedDateStr, todayStr)
    const boundary = getTodayBoundary(selectedDateStr, todayStr)
    const readOnly = boundary === 'read-only' || (boundary === 'future' && !canLog)
    const hasLinkedGoal = (habit.linkedGoals?.length ?? 0) > 0
    const tourTargetId =
      habit.id === tourCardHabitId ? 'tour-habit-card' : undefined

    return (
      <HabitRow
        key={habit.id}
        habit={habit}
        tourTargetId={tourTargetId}
        state={state}
        meta={meta}
        canLog={canLog}
        readOnly={readOnly}
        streak={habit.currentStreak}
        child={isChild}
        depth={displayDepth}
        selectMode={isSelectMode}
        selected={selectedHabitIds?.has(habit.id) ?? false}
        hasChildren={hasChildren}
        hasSubHabits={hasSubHabits}
        expanded={!collapsedIds.has(habit.id)}
        childProgress={hasChildren ? progress : undefined}
        showLinkedGoalDot={hasLinkedGoal}
        actions={{
          onLog: () => { void handleDirectToggle(habit.id, 'log') },
          onUnlog: () => { void handleDirectToggle(habit.id, 'unlog') },
          onSkip: () => void handleSkip(habit.id),
          onDuplicate: () => void duplicateImmediately(habit.id),
          onEdit: () => {
            setHabitToEdit(habit)
            const onSaved = options?.isDrillCard ? () => drill.refreshCurrent() : null
            setEditModalOnSaved(() => onSaved)
            setShowEditModal(true)
          },
          onMoveParent: () => openMoveParentPicker(habit.id),
          onReschedule: habit.isOverdue
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

  function renderAllViewChildren(parentId: string, depth: number): React.ReactNode {
    if (collapsedIds.has(parentId) || depth >= maxHabitDepth) return null
    const children = getVisibleChildren(parentId)
    if (children.length === 0) return null

    return children.map((child) => (
      <div key={child.id}>
        {renderHabitCard(
          child,
          depth,
          getVisibleChildren(child.id).length > 0,
          habitsById.get(child.id)?.hasSubHabits ?? false,
        )}
        {renderAllViewChildren(child.id, depth + 1)}
      </div>
    ))
  }

  function renderMainContent(): React.ReactNode {
    if (drill.currentParent) {
      return (
        <>
          <div className="flex items-center" style={{ padding: '4px 16px 8px', gap: 12 }}>
            <button
              type="button"
              aria-label={t('common.goBack')}
              className="touch-target shrink-0 appearance-none border-0 bg-transparent cursor-pointer flex items-center justify-center text-[var(--fg-1)] transition-[background-color] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:bg-[var(--bg-elev)]"
              style={{
                width: 40,
                height: 40,
                borderRadius: 999,
                boxShadow: 'inset 0 0 0 1.5px var(--hairline-strong)',
              }}
              onClick={drill.drillBack}
            >
              <ArrowLeft size={20} strokeWidth={1.8} aria-hidden="true" />
            </button>
            <div className="flex-1 min-w-0">
              <h3
                className="truncate"
                style={{
                  margin: 0,
                  fontFamily: 'var(--font-sans)',
                  fontSize: 16,
                  fontWeight: 500,
                  color: 'var(--fg-1)',
                }}
              >
                {drill.currentParent.title}
              </h3>
              <p
                style={{
                  margin: 0,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  letterSpacing: '0.02em',
                  color: 'var(--fg-3)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {drill.drillChildren.filter((c) => c.isCompleted).length}/
                {drill.drillChildren.length} {t('habits.completed')}
              </p>
            </div>
          </div>

          {drill.drillStack.length > 1 && (
            <button
              type="button"
              className="flex items-center appearance-none border-0 bg-transparent cursor-pointer text-[var(--primary)] hover:text-[var(--primary-pressed)] transition-colors"
              style={{
                gap: 4,
                padding: '8px 16px',
                fontFamily: 'var(--font-sans)',
                fontSize: 13,
                fontWeight: 500,
              }}
              onClick={drill.drillReset}
            >
              <Home size={16} strokeWidth={1.8} aria-hidden="true" />
              {t('habits.backToHabits')}
            </button>
          )}

          <HabitListDrillContent
            t={t}
            drillLoading={drill.drillLoading}
            drillError={drill.drillError}
            drillChildren={drill.drillChildren}
            currentParentId={drill.currentParentId}
            getDrillChildren={drill.getDrillChildren}
            renderHabitCard={renderHabitCard}
            onAddSubHabit={startAddSubHabit}
            onRetry={() => {
              void drill.refreshCurrent()
            }}
          />
        </>
      )
    }

    if (habits.length === 0 && view === 'today' && (data?.totalCount ?? 0) > 0) {
      return (
        <HabitListEmptyState
          title={t('habits.allDoneToday')}
          description={t('habits.allDoneHint')}
          actionLabel={onSeeUpcoming ? t('habits.seeUpcoming') : undefined}
          onAction={onSeeUpcoming}
          variant="secondary"
        />
      )
    }

    if (habits.length === 0) {
      return (
        <HabitListEmptyState
          title={view === 'today' ? t('habits.emptyState') : t(getHabitEmptyStateKey(view))}
          description={view === 'today' ? t('habits.noHabitsBody') : getEmptyHabitsMessage(view, t)}
          askAstraLabel={t('habits.askAstra')}
          onAskAstra={() => router.push('/chat')}
          actionLabel={t('habits.createManually')}
          onAction={onCreate}
        />
      )
    }

    if (view === 'all') {
      return (
        <>
          {dateGroups.map((group) => (
            <HabitListDateGroupSection key={group.key} group={group} overdueLabel={t('habits.overdue')}>
              <div className="flex flex-col" style={{ gap: 12 }}>
                {group.habits.map((habit) => (
                  <div key={habit.id} style={HABIT_PANEL_STYLE}>
                    {renderHabitCard(
                      habit,
                      0,
                      getChildren(habit.id).length > 0,
                      habit.hasSubHabits,
                    )}
                    {renderAllViewChildren(habit.id, 1)}
                  </div>
                ))}
              </div>
            </HabitListDateGroupSection>
          ))}
        </>
      )
    }

    if (isDndEnabled) {
      return (
        <DndContext
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
                <div key={panel[0]?.id} style={HABIT_PANEL_STYLE}>
                  {panel.map((item) => (
                    <SortableHabitItem key={item.id} id={item.id}>
                      {renderHabitCard(
                        item.habit,
                        item.depth,
                        item.hasChildren,
                        item.hasSubHabits,
                        { isDraggingList: isDragging },
                      )}
                    </SortableHabitItem>
                  ))}
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
          <div key={panel[0]?.id} style={HABIT_PANEL_STYLE}>
            {panel.map((item) => renderHabitCard(
              item.habit,
              item.depth,
              item.hasChildren,
              item.hasSubHabits,
            ))}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div data-tour="tour-habit-list" ref={listContainerRef}>
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
        t={t}
        showDeleteConfirm={showDeleteConfirm}
        onConfirmDelete={() => void confirmDelete()}
        onCancelDelete={() => {
          setHabitToDelete(null)
          setShowDeleteConfirm(false)
        }}
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

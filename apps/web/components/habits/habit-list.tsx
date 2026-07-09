'use client'

import { useState, useMemo, useCallback, useEffect, useRef as useReactRef, forwardRef, useImperativeHandle } from 'react'
import {
  ArrowLeft,
  Home,
} from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import { useRouter } from 'next/navigation'
import {
  buildHabitDateBuckets,
  computeHabitReorderPositions,
  computeParentPromptProgress,
  collectVisibleHabitTreeIds,
  formatAPIDate,
  getHabitEmptyStateKey,
  hasHabitScheduleOnDate,
  isHabitVisibleInAllView,
} from '@orbit/shared/utils'
import { HabitRow, type HabitRowMetaToken } from './habit-row'
import { HabitDetailDrawer } from './habit-detail-drawer'
import { CreateHabitModal } from './create-habit-modal'
import { EditHabitModal } from './edit-habit-modal'
import { RescheduleSheet } from './reschedule-sheet'
import {
  getEmptyHabitsMessage,
  HabitListEmptyState,
  HabitListSkeleton,
} from './habit-list/empty-state'
import {
  formatDateGroupLabel,
  HabitListDateGroupSection,
  type HabitListDateGroup,
} from './habit-list/date-group-section'
import { HabitListConfirmDialogs } from './habit-list/confirm-dialogs'
import { HabitListDrillContent } from './habit-list/drill-content'
import { MoveParentOverlay, type MoveParentOption } from './habit-list/move-parent-overlay'
import {
  buildDragItemsFlat,
  buildMoveParentOptions,
  validateMoveTarget as computeMoveTargetValidation,
  type DragItem,
} from './habit-list/tree-helpers'
import type { StatusDotState } from '@/components/ui/status-dot'
import {
  canLogHabitOnDate,
  computeHabitCardStatus,
  computeHabitFrequencyLabel,
  computeHabitFutureHint,
} from '@orbit/shared/utils'
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

interface HabitListProps {
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
}

const TOUR_FEATURED_HABIT_ID = 'tour-habit-2'

export const HabitList = forwardRef<HabitListHandle, HabitListProps>(function HabitList({
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
}, ref) {
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
  const promptedParentIdsRef = useReactRef(new Set<string>())
  const skippedChildIdsRef = useReactRef(new Set<string>())
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
  }, [topLevelHabits, view, showCompleted, recentlyCompletedIds, visibility])

  const allLoadedIds = useMemo(() => {
    return collectVisibleHabitTreeIds(habits, getVisibleChildren)
  }, [getVisibleChildren, habits])

  const isListView = view === 'all' || view === 'general'
  promptDataRef.current = {
    getChildren,
    isListView,
    visibility,
    habitsById,
    selectedDateStr,
  }

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
  }, [habitsById, getChildren, isListView, visibility])

  const getChildrenProgress = useCallback(
    (habitId: string) => {
      return childrenProgressMap.get(habitId) ?? { done: 0, total: 0 }
    },
    [childrenProgressMap],
  )

  const getChildrenProgressForPrompt = useCallback(
    (habitId: string, assumeCompletedId?: string) => {
      const data = promptDataRef.current
      if (!data) return { done: 0, total: 0, loggedDone: 0 }
      return computeParentPromptProgress({
        parentId: habitId,
        getChildren: data.getChildren,
        isRelevantToday: data.visibility.isRelevantToday,
        isDueOnSelectedDate: data.visibility.isDueOnSelectedDate,
        isListView: data.isListView,
        skippedIds: skippedChildIdsRef.current,
        assumeCompletedId,
      })
    },
    [promptDataRef, skippedChildIdsRef],
  )

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

  const [showDetailDrawer, setShowDetailDrawer] = useState(false)
  const [selectedHabit, setSelectedHabit] = useState<NormalizedHabit | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [habitToEdit, setHabitToEdit] = useState<NormalizedHabit | null>(null)
  const [editModalOnSaved, setEditModalOnSaved] = useState<(() => void | Promise<void>) | null>(null)
  const [showSubHabitModal, setShowSubHabitModal] = useState(false)
  const [subHabitParent, setSubHabitParent] = useState<NormalizedHabit | null>(null)
  const [showRescheduleSheet, setShowRescheduleSheet] = useState(false)
  const [habitToReschedule, setHabitToReschedule] = useState<NormalizedHabit | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [habitToDelete, setHabitToDelete] = useState<string | null>(null)
  const [showDuplicateConfirm, setShowDuplicateConfirm] = useState(false)
  const [habitToDuplicate, setHabitToDuplicate] = useState<NormalizedHabit | null>(null)
  const [showSkipConfirm, setShowSkipConfirm] = useState(false)
  const [habitToSkip, setHabitToSkip] = useState<string | null>(null)
  const [showForceLogConfirm, setShowForceLogConfirm] = useState(false)
  const [forceLogHabitId, setForceLogHabitId] = useState<string | null>(null)

  const [showAutoLogParent, setShowAutoLogParent] = useState(false)
  const [autoLogParentId, setAutoLogParentId] = useState<string | null>(null)
  const [autoLogParentMode, setAutoLogParentMode] = useState<'log' | 'skip'>('log')
  const autoLogParentHabit = autoLogParentId ? habitsById.get(autoLogParentId) ?? null : null

  const [showMoveParentOverlay, setShowMoveParentOverlay] = useState(false)
  const [movingHabitId, setMovingHabitId] = useState<string | null>(null)
  const [selectedMoveParentId, setSelectedMoveParentId] = useState<string | null>(null)
  const [isMovingParent, setIsMovingParent] = useState(false)
  const movingHabit = movingHabitId ? habitsById.get(movingHabitId) ?? null : null

  function checkAndPromptParentLog(childHabitId: string) {
    const data = promptDataRef.current
    if (!data) return
    const child = data.habitsById.get(childHabitId)
    if (!child?.parentId) return
    const parent = data.habitsById.get(child.parentId)
    if (!parent || parent.isCompleted) return

    const parentIsDueToday =
      parent.isGeneral ||
      parent.isOverdue ||
      hasHabitScheduleOnDate(parent, data.selectedDateStr)
    if (!parentIsDueToday) return

    const { done, total, loggedDone } = getChildrenProgressForPrompt(parent.id, childHabitId)
    if (total > 0 && done >= total) {
      if (!promptedParentIdsRef.current.has(parent.id)) {
        promptedParentIdsRef.current.add(parent.id)
        setAutoLogParentId(parent.id)
        setAutoLogParentMode(loggedDone > 0 ? 'log' : 'skip')
        setShowAutoLogParent(true)
      }
    } else {
      promptedParentIdsRef.current.delete(parent.id)
    }
  }

  async function confirmAutoLogParent() {
    const parentId = autoLogParentId
    if (!parentId) return
    const mode = autoLogParentMode
    setShowAutoLogParent(false)
    setAutoLogParentId(null)
    markRecentlyCompleted(parentId)
    try {
      if (mode === 'skip') {
        skippedChildIdsRef.current.add(parentId)
        await skipHabit.mutateAsync({ habitId: parentId })
      } else {
        skippedChildIdsRef.current.delete(parentId)
        await logHabit.mutateAsync({ habitId: parentId })
      }
      checkAndPromptParentLog(parentId)
    } catch {
      clearRecentlyCompleted(parentId)
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
    setSelectedHabit(habit)
    setShowDetailDrawer(true)
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

  function promptDuplicate(habitId: string) {
    const habit = habitsById.get(habitId)
    if (!habit) return
    setHabitToDuplicate(habit)
    setShowDuplicateConfirm(true)
  }

  async function confirmDuplicate() {
    if (!habitToDuplicate) return
    const id = habitToDuplicate.id
    try {
      await duplicateHabitMut.mutateAsync(id)
    } catch {
    } finally {
      setHabitToDuplicate(null)
      setShowDuplicateConfirm(false)
    }
  }

  function promptSkip(habitId: string) {
    setHabitToSkip(habitId)
    setShowSkipConfirm(true)
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

  async function confirmSkip() {
    if (!habitToSkip) return
    const skippedId = habitToSkip
    try {
      await skipHabit.mutateAsync({ habitId: skippedId })
      skippedChildIdsRef.current.add(skippedId)
      markRecentlyCompleted(skippedId)
      checkAndPromptParentLog(skippedId)
    } catch {
    } finally {
      setHabitToSkip(null)
      setShowSkipConfirm(false)
    }
  }

  function handleLogged(habitId: string, markAsRecentlyCompleted = true) {
    skippedChildIdsRef.current.delete(habitId)
    if (markAsRecentlyCompleted) {
      markRecentlyCompleted(habitId)
    }

    checkAndPromptParentLog(habitId)
  }

  async function handleDirectLog(habitId: string) {
    markRecentlyCompleted(habitId)
    try {
      await logHabit.mutateAsync({ habitId })
      handleLogged(habitId, false)
    } catch {
      clearRecentlyCompleted(habitId)
    }
  }
  async function confirmForceLog() {
    if (!forceLogHabitId) return
    skippedChildIdsRef.current.delete(forceLogHabitId)
    markRecentlyCompleted(forceLogHabitId)
    try {
      await logHabit.mutateAsync({ habitId: forceLogHabitId })
    } catch {
      clearRecentlyCompleted(forceLogHabitId)
    } finally {
      setForceLogHabitId(null)
      setShowForceLogConfirm(false)
    }
  }

const isPostponeAction = useMemo(() => {
    if (!habitToSkip) return false
    const habit = habitsById.get(habitToSkip)
    return habit ? !habit.frequencyUnit : false
  }, [habitToSkip, habitsById])

  const skipConfirmMessage = useMemo(() => {
    if (isPostponeAction) return t('habits.postponeConfirmMessage')
    if (habitToSkip) {
      const habit = habitsById.get(habitToSkip)
      if (habit?.flexibleTarget != null) {
        return t('habits.skipConfirmMessageFlexible')
      }
    }
    return t('habits.skipConfirmMessage')
  }, [isPostponeAction, habitToSkip, habitsById, t])

  useImperativeHandle(ref, () => ({
    collapseAll,
    expandAll,
    get allCollapsed() { return allCollapsed },
    get allLoadedIds() { return allLoadedIds },
    markRecentlyCompleted,
    checkAndPromptParentLog,
  }))

  const listContainerRef = useReactRef<HTMLDivElement>(null)

  function handleListKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Home' && event.key !== 'End') return
    const container = listContainerRef.current
    if (!container) return

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

  function deriveRowState(
    habit: NormalizedHabit,
    recentlyCompleted: boolean,
  ): StatusDotState {
    if (recentlyCompleted || habit.isCompleted || habit.isLoggedInRange) return 'done'
    if (habit.isBadHabit) return 'bad'
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
    _hasSubHabits: boolean,
    options?: {
      isDrillCard?: boolean
      isDraggingList?: boolean
    },
  ) {
    const progress = hasChildren ? getChildrenProgress(habit.id) : { done: 0, total: 0 }
    const isChild = depth > 0
    const recentlyCompleted = recentlyCompletedIds.has(habit.id)
    const state = deriveRowState(habit, recentlyCompleted)
    const meta = buildMetaTokens(habit)
    const canLog = canLogHabitOnDate(habit, selectedDateStr, todayStr)
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
        streak={habit.currentStreak}
        child={isChild}
        depth={depth}
        selectMode={isSelectMode}
        selected={selectedHabitIds?.has(habit.id) ?? false}
        hasChildren={hasChildren}
        expanded={!collapsedIds.has(habit.id)}
        childProgress={hasChildren ? progress : undefined}
        showLinkedGoalDot={hasLinkedGoal}
        actions={{
          onLog: () => { void handleDirectLog(habit.id) },
          onUnlog: () => logHabit.mutate({ habitId: habit.id }),
          onForceLogParent: () => {
            setForceLogHabitId(habit.id)
            setShowForceLogConfirm(true)
          },
          onSkip: () => promptSkip(habit.id),
          onDuplicate: () => promptDuplicate(habit.id),
          onEdit: () => {
            setHabitToEdit(habit)
            setEditModalOnSaved(() => (
              options?.isDrillCard ? () => drill.refreshCurrent() : null
            ))
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
          <div className="flex items-center" style={{ padding: '4px 20px 10px', gap: 12 }}>
            <button
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
                  margin: '2px 0 0',
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
              className="flex items-center appearance-none border-0 bg-transparent cursor-pointer text-[var(--primary)] hover:text-[var(--primary-pressed)] transition-colors"
              style={{
                gap: 6,
                padding: '10px 20px',
                fontFamily: 'var(--font-sans)',
                fontSize: 13,
                fontWeight: 500,
              }}
              onClick={drill.drillReset}
            >
              <Home size={13} strokeWidth={1.8} aria-hidden="true" />
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
          actionLabel={t('habits.seeUpcoming')}
          onAction={onSeeUpcoming}
          variant="secondary"
        />
      )
    }

    if (habits.length === 0) {
      return (
        <HabitListEmptyState
          title={t(getHabitEmptyStateKey(view))}
          description={getEmptyHabitsMessage(view, t)}
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
              <div className="stagger-enter">
                {group.habits.map((habit) => (
                  <div key={habit.id}>
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
            <div className={isDragging ? 'is-dragging stagger-enter' : 'stagger-enter'}>
              {activeDragItems.map((item) => (
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
          </SortableContext>
        </DndContext>
      )
    }

    return (
      <div className="stagger-enter">
        {dragItems.map((item) => (
          <div key={item.id}>
            {renderHabitCard(
              item.habit,
              item.depth,
              item.hasChildren,
              item.hasSubHabits,
            )}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div data-tour="tour-habit-list" ref={listContainerRef} onKeyDown={handleListKeyDown}>
      {renderMainContent()}

      <HabitDetailDrawer
        open={showDetailDrawer}
        onOpenChange={setShowDetailDrawer}
        habit={selectedHabit}
        onLogged={handleLogged}
      />

      <EditHabitModal
        open={showEditModal}
        onOpenChange={handleEditModalOpenChange}
        habit={habitToEdit}
        onSaved={editModalOnSaved ?? undefined}
      />

      <RescheduleSheet
        open={showRescheduleSheet}
        onOpenChange={(open) => {
          setShowRescheduleSheet(open)
          if (!open) setHabitToReschedule(null)
        }}
        habit={habitToReschedule}
      />

      {showSubHabitModal && (
        <CreateHabitModal
          open={showSubHabitModal}
          onOpenChange={setShowSubHabitModal}
          parentHabit={subHabitParent}
        />
      )}

      <HabitListConfirmDialogs
        t={t}
        showDeleteConfirm={showDeleteConfirm}
        onDeleteOpenChange={setShowDeleteConfirm}
        onConfirmDelete={() => void confirmDelete()}
        onCancelDelete={() => {
          setHabitToDelete(null)
          setShowDeleteConfirm(false)
        }}
        showDuplicateConfirm={showDuplicateConfirm}
        onDuplicateOpenChange={(open) => {
          setShowDuplicateConfirm(open)
          if (!open) setHabitToDuplicate(null)
        }}
        duplicateName={habitToDuplicate?.title ?? ''}
        onConfirmDuplicate={() => void confirmDuplicate()}
        onCancelDuplicate={() => {
          setHabitToDuplicate(null)
          setShowDuplicateConfirm(false)
        }}
        showSkipConfirm={showSkipConfirm}
        onSkipOpenChange={setShowSkipConfirm}
        isPostponeAction={isPostponeAction}
        skipConfirmMessage={skipConfirmMessage}
        onConfirmSkip={() => void confirmSkip()}
        onCancelSkip={() => {
          setHabitToSkip(null)
          setShowSkipConfirm(false)
        }}
        showForceLogConfirm={showForceLogConfirm}
        onForceLogOpenChange={setShowForceLogConfirm}
        onConfirmForceLog={() => void confirmForceLog()}
        onCancelForceLog={() => {
          setForceLogHabitId(null)
          setShowForceLogConfirm(false)
        }}
        showAutoLogParent={showAutoLogParent}
        autoLogParentMode={autoLogParentMode}
        onAutoLogParentOpenChange={setShowAutoLogParent}
        autoLogParentName={autoLogParentHabit?.title ?? ''}
        onConfirmAutoLogParent={() => void confirmAutoLogParent()}
        onCancelAutoLogParent={() => {
          setAutoLogParentId(null)
          setShowAutoLogParent(false)
        }}
      />

      <MoveParentOverlay
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
})

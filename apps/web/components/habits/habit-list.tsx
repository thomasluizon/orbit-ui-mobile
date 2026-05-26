'use client'

import { useState, useMemo, useCallback, useEffect, useRef as useReactRef, forwardRef, useImperativeHandle } from 'react'
import {
  isToday as isDateToday,
  isTomorrow,
  isYesterday,
} from 'date-fns'
import {
  ArrowLeft,
  Home,
  Plus,
} from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import { useRouter } from 'next/navigation'
import {
  computeHabitReorderPositions,
  collectVisibleHabitTreeIds,
  formatAPIDate,
  formatLocaleDate,
  getHabitEmptyStateKey,
  hasHabitScheduleOnDate,
  isHabitVisibleInAllView,
} from '@orbit/shared/utils'
import { HabitRow, type HabitRowMetaToken } from './habit-row'
import { HabitDetailDrawer } from './habit-detail-drawer'
import { CreateHabitModal } from './create-habit-modal'
import { EditHabitModal } from './edit-habit-modal'
import {
  HabitListDateGroupSection,
  HabitListEmptyState,
  type HabitListDateGroup,
} from './habit-list-sections'
import type { StatusDotState } from '@/components/ui/status-dot'
import { computeHabitCardStatus, computeHabitFrequencyLabel } from '@orbit/shared/utils'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { AppOverlay } from '@/components/ui/app-overlay'
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
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
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

interface MoveParentOption {
  id: string | null
  label: string
  depth: number
  disabled: boolean
  reason: string | null
}

interface DragItem {
  id: string
  habit: NormalizedHabit
  depth: number
  parentId: string | null
  hasChildren: boolean
  hasSubHabits: boolean
}

const TOUR_FEATURED_HABIT_ID = 'tour-habit-2'

function formatDateGroupLabel(
  key: string,
  locale: string,
  t: (key: string) => string,
): string {
  if (!key) return t('common.unknown')

  const date = new Date(key + 'T00:00:00')

  if (isDateToday(date)) return t('dates.today')
  if (isTomorrow(date)) return t('dates.tomorrow')
  if (isYesterday(date)) return t('dates.yesterday')

  return formatLocaleDate(date, locale, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function getEmptyHabitsMessage(
  view: 'today' | 'all' | 'general',
  t: (key: string) => string,
): string {
  return t(getHabitEmptyStateKey(view))
}

type HabitView = 'today' | 'all' | 'general'

function buildDragItemsFlat(
  habits: NormalizedHabit[],
  collapsedIds: Set<string>,
  getVisibleChildrenForView: (habitId: string, view: HabitView) => NormalizedHabit[],
  view: HabitView,
): DragItem[] {
  const items: DragItem[] = []

  function addHabitTree(habit: NormalizedHabit, depth: number, parentId: string | null) {
    const visChildren = getVisibleChildrenForView(habit.id, view)
    items.push({
      id: habit.id,
      habit,
      depth,
      parentId,
      hasChildren: visChildren.length > 0,
      hasSubHabits: habit.hasSubHabits,
    })
    if (!collapsedIds.has(habit.id)) {
      for (const child of visChildren) {
        addHabitTree(child, depth + 1, habit.id)
      }
    }
  }

  for (const h of habits) {
    addHabitTree(h, 0, null)
  }

  return items
}

function HabitListSkeleton() {
  return (
    <div>
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="flex items-center"
          style={{
            padding: '16px 20px',
            gap: 14,
            borderBottom: '1px solid var(--hairline)',
          }}
        >
          <div className="flex-1 flex flex-col" style={{ gap: 8 }}>
            <div
              className="rounded-sm animate-pulse"
              style={{ width: '55%', height: 10, background: 'var(--bg-sunk)' }}
            />
            <div
              className="rounded-sm animate-pulse"
              style={{ width: '30%', height: 7, background: 'var(--bg-sunk)' }}
            />
          </div>
          <div
            className="rounded-full shrink-0"
            style={{
              width: 9,
              height: 9,
              boxShadow: 'inset 0 0 0 1.5px var(--hairline-strong)',
            }}
          />
        </div>
      ))}
    </div>
  )
}

function SortableHabitItem({
  id,
  children,
}: Readonly<{
  id: string
  children: React.ReactNode
}>) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isItemDragging,
  } = useSortable({ id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isItemDragging ? 0.5 : 1,
    position: 'relative' as const,
    zIndex: isItemDragging ? 50 : 'auto',
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  )
}

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

  // The tour's "card" step anchors to the featured mock habit when injected,
  // otherwise falls back to the first visible row so the spotlight still has
  // something to point at when the user already has real habits.
  const tourCardHabitId = habitsById.has(TOUR_FEATURED_HABIT_ID)
    ? TOUR_FEATURED_HABIT_ID
    : topLevelHabits[0]?.id

  const getChildren = habitsQuery.getChildren

  const [recentlyCompletedIds, setRecentlyCompletedIds] = useState(
    new Set<string>(),
  )
  const recentlyCompletedPromptIdsRef = useReactRef(new Set<string>())

  const markRecentlyCompleted = useCallback((habitId: string) => {
    recentlyCompletedPromptIdsRef.current.add(habitId)
    setRecentlyCompletedIds((prev) => new Set(prev).add(habitId))
    setTimeout(() => {
      recentlyCompletedPromptIdsRef.current.delete(habitId)
      setRecentlyCompletedIds((prev) => {
        const next = new Set(prev)
        next.delete(habitId)
        return next
      })
    }, 1400)
  }, [recentlyCompletedPromptIdsRef])

  const clearRecentlyCompleted = useCallback((habitId: string) => {
    recentlyCompletedPromptIdsRef.current.delete(habitId)
    setRecentlyCompletedIds((prev) => {
      if (!prev.has(habitId)) return prev
      const next = new Set(prev)
      next.delete(habitId)
      return next
    })
  }, [recentlyCompletedPromptIdsRef])

  const selectedDateStr = selectedDate ? formatAPIDate(selectedDate) : formatAPIDate(new Date())
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
      } else if (!visibility.isRelevantToday(child) && !child.isLoggedInRange) {
        const nested = computeFn(child.id)
        return nested
      } else if (visibility.isDueOnSelectedDate(child) || child.isLoggedInRange) {
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
    (habitId: string) => {
      const completedOverrideIds = recentlyCompletedPromptIdsRef.current

      function computeChildProgress(
        child: NormalizedHabit,
        computeFn: (id: string) => { done: number; total: number },
      ): { done: number; total: number } {
        let done = 0
        let total = 0
        const isCompletedForPrompt =
          child.isCompleted ||
          child.isLoggedInRange ||
          completedOverrideIds.has(child.id)

        const shouldCountDirectly =
          isListView ||
          child.isGeneral ||
          visibility.isDueOnSelectedDate(child) ||
          child.isLoggedInRange

        if (!isListView && !child.isGeneral && !visibility.isRelevantToday(child) && !child.isLoggedInRange) {
          return computeFn(child.id)
        }

        if (shouldCountDirectly) {
          total++
          if (isCompletedForPrompt) done++
        }

        const nested = computeFn(child.id)
        done += nested.done
        total += nested.total
        return { done, total }
      }

      function compute(currentHabitId: string): { done: number; total: number } {
        const children = getChildren(currentHabitId)
        if (children.length === 0) {
          return { done: 0, total: 0 }
        }

        let done = 0
        let total = 0
        for (const child of children) {
          const progress = computeChildProgress(child, compute)
          done += progress.done
          total += progress.total
        }

        return { done, total }
      }

      return compute(habitId)
    },
    [getChildren, isListView, visibility, recentlyCompletedPromptIdsRef],
  )

  const dateGroups = useMemo<HabitListDateGroup[]>(() => {
    if (view !== 'all') return []

    const today = formatAPIDate(new Date())
    const overdueHabits: NormalizedHabit[] = []
    const groups = new Map<string, NormalizedHabit[]>()

    for (const habit of habits) {
      const key = habit.dueDate ?? ''
      if (!key) {
        if (!groups.has('')) groups.set('', [])
        groups.get('')!.push(habit)
      } else if (key < today && !habit.isCompleted) {
        overdueHabits.push(habit)
      } else {
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(habit)
      }
    }

    const result: HabitListDateGroup[] = []

    if (overdueHabits.length > 0) {
      result.push({
        key: '__overdue__',
        label: t('habits.overdue'),
        isOverdue: true,
        habits: [...overdueHabits].sort((a, b) =>
          a.dueDate.localeCompare(b.dueDate),
        ),
      })
    }

    const sorted = Array.from(groups.entries()).sort(([a], [b]) =>
      a.localeCompare(b),
    )
    for (const [key, groupHabits] of sorted) {
      result.push({
        key,
        label: formatDateGroupLabel(key, locale, t),
        isOverdue: false,
        habits: groupHabits,
      })
    }

    return result
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
  const sensors = useSensors(pointerSensor, touchSensor)

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

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    const items = dragOverrideItems ?? dragItemsRef.current

    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex((item) => item.id === active.id)
      const newIndex = items.findIndex((item) => item.id === over.id)

      if (oldIndex !== -1 && newIndex !== -1) {
        const positions = computeHabitReorderPositions(
          items, oldIndex, newIndex, habitsById, getChildren,
        )
        try {
          if (positions.length > 0) {
            await reorderHabitsMut.mutateAsync({ positions })
          }
        } catch {
          // Error handled by mutation - query will be refetched
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
  const autoLogParentHabit = autoLogParentId ? habitsById.get(autoLogParentId) ?? null : null

  const [showMoveParentOverlay, setShowMoveParentOverlay] = useState(false)
  const [movingHabitId, setMovingHabitId] = useState<string | null>(null)
  const [selectedMoveParentId, setSelectedMoveParentId] = useState<string | null>(null)
  const [isMovingParent, setIsMovingParent] = useState(false)
  const movingHabit = movingHabitId ? habitsById.get(movingHabitId) ?? null : null

  function checkAndPromptParentLog(childHabitId: string) {
    const child = habitsById.get(childHabitId)
    if (!child?.parentId) return
    const parent = habitsById.get(child.parentId)
    if (!parent || parent.isCompleted) return

    const parentIsDueToday =
      parent.isGeneral ||
      parent.isOverdue ||
      hasHabitScheduleOnDate(parent, selectedDateStr)
    if (!parentIsDueToday) return

    const { done, total } = getChildrenProgressForPrompt(parent.id)
    if (total > 0 && done >= total) {
      setAutoLogParentId(parent.id)
      setShowAutoLogParent(true)
    }
  }

  async function confirmAutoLogParent() {
    const parentId = autoLogParentId
    if (!parentId) return
    setShowAutoLogParent(false)
    setAutoLogParentId(null)
    markRecentlyCompleted(parentId)
    try {
      await logHabit.mutateAsync({ habitId: parentId })
      checkAndPromptParentLog(parentId)
    } catch {
      clearRecentlyCompleted(parentId)
    }
  }

  function getHabitDepth(habitId: string): number {
    let depth = 0
    let current = habitsById.get(habitId)
    while (current?.parentId) {
      depth++
      current = habitsById.get(current.parentId)
    }
    return depth
  }

  function getSubtreeMaxDepth(habitId: string, baseDepth: number): number {
    let max = baseDepth
    const children = getChildren(habitId)
    for (const child of children) {
      const childMax = getSubtreeMaxDepth(child.id, baseDepth + 1)
      if (childMax > max) max = childMax
    }
    return max
  }

  function isDescendant(candidateId: string, ancestorId: string): boolean {
    let current = habitsById.get(candidateId)
    while (current?.parentId) {
      if (current.parentId === ancestorId) return true
      current = habitsById.get(current.parentId)
    }
    return false
  }

  function validateMoveTarget(
    targetParentId: string | null,
    draggedId: string,
  ): { valid: boolean; reason: string | null } {
    if (targetParentId === draggedId) {
      return { valid: false, reason: t('habits.moveParent.invalidSelf') }
    }

    if (targetParentId && isDescendant(targetParentId, draggedId)) {
      return { valid: false, reason: t('habits.moveParent.invalidDescendant') }
    }

    const newParentDepth = targetParentId ? getHabitDepth(targetParentId) : -1
    const subtreeMax = getSubtreeMaxDepth(draggedId, newParentDepth + 1)
    if (subtreeMax >= maxHabitDepth) {
      return {
        valid: false,
        reason: t('habits.moveParent.invalidDepth', { max: maxHabitDepth }),
      }
    }

    return { valid: true, reason: null }
  }

  const moveParentOptions = ((): MoveParentOption[] => {
    if (!movingHabitId) return []

    const options: MoveParentOption[] = []
    const rootValidation = validateMoveTarget(null, movingHabitId)
    options.push({
      id: null,
      label: t('habits.moveParent.toRoot'),
      depth: 0,
      disabled: !rootValidation.valid,
      reason: rootValidation.reason,
    })

    const stack: Array<{ habit: NormalizedHabit; depth: number }> = []
    for (let i = topLevelHabits.length - 1; i >= 0; i--) {
      const habit = topLevelHabits[i]
      if (habit) stack.push({ habit, depth: 0 })
    }
    while (stack.length > 0) {
      const top = stack.pop()
      if (!top) break
      const { habit, depth } = top
      const validation = validateMoveTarget(habit.id, movingHabitId)
      options.push({
        id: habit.id,
        label: habit.title,
        depth,
        disabled: !validation.valid,
        reason: validation.reason,
      })
      const children = getChildren(habit.id)
      for (let i = children.length - 1; i >= 0; i--) {
        const child = children[i]
        if (child) stack.push({ habit: child, depth: depth + 1 })
      }
    }

    return options
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
      // Error handled by mutation
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
      // Error handled by mutation
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
      // Error handled by mutation
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
      markRecentlyCompleted(skippedId)
      checkAndPromptParentLog(skippedId)
    } catch {
      // Error handled by mutation
    } finally {
      setHabitToSkip(null)
      setShowSkipConfirm(false)
    }
  }

  function handleLogged(habitId: string, markAsRecentlyCompleted = true) {
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
      // Error handled by mutation
    }
  }
  async function confirmForceLog() {
    if (!forceLogHabitId) return
    markRecentlyCompleted(forceLogHabitId)
    try {
      await logHabit.mutateAsync({ habitId: forceLogHabitId })
    } catch {
      clearRecentlyCompleted(forceLogHabitId)
      // Error handled by mutation
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

  // Derive HabitRow visual state from habit flags + status.
  // `recentlyCompleted` flips immediately on optimistic log so the row reads as done
  // before the server response lands.
  function deriveRowState(
    habit: NormalizedHabit,
    isChild: boolean,
    recentlyCompleted: boolean,
  ): StatusDotState {
    if (recentlyCompleted || habit.isCompleted || habit.isLoggedInRange) return 'done'
    const status = computeHabitCardStatus(habit, view === 'today' ? cardSelectedDate : undefined)
    if (status === 'overdue' && !isChild) return 'overdue'
    if (habit.isBadHabit && !isChild) return 'bad'
    return 'empty'
  }

  function buildMetaTokens(habit: NormalizedHabit, isChild: boolean): HabitRowMetaToken[] {
    const tokens: HabitRowMetaToken[] = []
    const freqLabel = computeHabitFrequencyLabel(habit, t)
    if (freqLabel) tokens.push(freqLabel)
    if (habit.dueTime) tokens.push(displayTime(habit.dueTime))
    if (habit.checklistItems.length > 0) {
      const done = habit.checklistItems.filter((c) => c.isChecked).length
      tokens.push(`${done}/${habit.checklistItems.length}`)
    }
    if (habit.isOverdue && !isChild && !habit.isCompleted) {
      tokens.push({ kind: 'overdue', label: t('habits.overdue') })
    }
    if (habit.isBadHabit && !isChild) {
      tokens.push({ kind: 'bad', label: t('habits.badHabit') })
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
    const state = deriveRowState(habit, isChild, recentlyCompleted)
    const meta = buildMetaTokens(habit, isChild)
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
          onDelete: () => promptDelete(habit.id),
          onDetail: () => openDetail(habit),
          onDrillInto: () => drill.drillInto(habit.id),
          onAddSubHabit: () => startAddSubHabit(habit.id),
          onToggleExpand: () => toggleExpand(habit.id),
          onToggleSelection: () => onToggleSelection?.(habit.id),
          onEnterSelectMode: () => onEnterSelectMode?.(habit.id),
        }}
      />
    )
  }

  if (habitsQuery.isLoading && !habitsQuery.data) {
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

  function renderDrillContent(): React.ReactNode {
    if (drill.drillLoading) {
      return <HabitListSkeleton />
    }

    if (drill.drillChildren.length > 0) {
      return (
        <div>
          {drill.drillChildren.map((child) =>
            renderHabitCard(
              child,
              0,
              drill.getDrillChildren(child.id).length > 0,
              child.hasSubHabits || drill.getDrillChildren(child.id).length > 0,
              { isDrillCard: true },
            ),
          )}
          <button
            type="button"
            className="w-full flex items-center justify-center gap-2 py-3 text-[var(--fg-3)] text-sm hover:text-[var(--primary-pressed)] transition-[color] duration-150"
            style={{
              fontFamily: 'var(--font-family-sans)',
              fontSize: 13,
              borderTop: '1px solid var(--hairline)',
            }}
            onClick={() => drill.currentParentId && startAddSubHabit(drill.currentParentId)}
          >
            <Plus className="size-4" />
            {t('habits.form.addSubHabit')}
          </button>
        </div>
      )
    }

    return (
      <div className="text-center py-8">
        <p className="text-[var(--fg-3)] text-sm">
          {t('habits.noSubHabits')}
        </p>
        <button
          className="mt-4 flex items-center justify-center gap-2 mx-auto px-6 py-3 rounded-xl border border-dashed border-[var(--hairline)] text-[var(--fg-3)] text-sm hover:border-[var(--primary)] hover:text-[var(--primary-pressed)] transition-[border-color,color,background-color,transform] duration-150"
          onClick={() => drill.currentParentId && startAddSubHabit(drill.currentParentId)}
        >
          <Plus className="size-4" />
          {t('habits.form.addSubHabit')}
        </button>
      </div>
    )
  }

  function renderMainContent(): React.ReactNode {
    if (drill.currentParent) {
      return (
        <>
          <div className="flex items-center gap-3 pb-1">
            <button
              aria-label={t('common.goBack')}
              className="shrink-0 size-8 rounded-full bg-[var(--bg-elev)] flex items-center justify-center hover:bg-[var(--bg-elev)]/80 transition-[background-color,transform] duration-150"
              onClick={drill.drillBack}
            >
              <ArrowLeft className="size-4 text-[var(--fg-2)]" aria-hidden="true" />
            </button>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-[var(--fg-1)] truncate">
                {drill.currentParent.title}
              </h3>
              <p className="text-[10px] text-[var(--fg-3)] uppercase tracking-wider">
                {drill.drillChildren.filter((c) => c.isCompleted).length}/
                {drill.drillChildren.length} {t('habits.completed')}
              </p>
            </div>
          </div>

          {drill.drillStack.length > 1 && (
            <button
              className="flex items-center gap-1.5 text-xs text-[var(--primary)] hover:text-[var(--primary-pressed)] transition-colors pb-2"
              onClick={drill.drillReset}
            >
              <Home className="size-3" />
              {t('habits.backToHabits')}
            </button>
          )}

          {renderDrillContent()}
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
          actionLabel={view === 'all' || view === 'general' ? t('habits.createHabit') : undefined}
          onAction={onCreate}
        />
      )
    }

    if (view === 'all') {
      return (
        <>
          {dateGroups.map((group) => (
            <HabitListDateGroupSection key={group.key} group={group} overdueLabel={t('habits.overdue')}>
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
    <div data-tour="tour-habit-list">
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

      {showSubHabitModal && (
        <CreateHabitModal
          open={showSubHabitModal}
          onOpenChange={setShowSubHabitModal}
          parentHabit={subHabitParent}
        />
      )}

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title={t('habits.deleteConfirmTitle')}
        description={t('habits.deleteConfirmMessage')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        onConfirm={confirmDelete}
        onCancel={() => {
          setHabitToDelete(null)
          setShowDeleteConfirm(false)
        }}
        variant="danger"
      />

      <ConfirmDialog
        open={showDuplicateConfirm}
        onOpenChange={(open) => {
          setShowDuplicateConfirm(open)
          if (!open) setHabitToDuplicate(null)
        }}
        title={t('habits.duplicateConfirmTitle')}
        description={t('habits.duplicateConfirmMessage', {
          name: habitToDuplicate?.title ?? '',
        })}
        confirmLabel={t('habits.duplicateConfirm')}
        cancelLabel={t('common.cancel')}
        onConfirm={confirmDuplicate}
        onCancel={() => {
          setHabitToDuplicate(null)
          setShowDuplicateConfirm(false)
        }}
        variant="success"
      />

      <ConfirmDialog
        open={showSkipConfirm}
        onOpenChange={setShowSkipConfirm}
        title={t(
          isPostponeAction
            ? 'habits.postponeConfirmTitle'
            : 'habits.skipConfirmTitle',
        )}
        description={skipConfirmMessage}
        confirmLabel={t(
          isPostponeAction
            ? 'habits.postponeConfirmButton'
            : 'habits.skipConfirmButton',
        )}
        cancelLabel={t('common.cancel')}
        onConfirm={confirmSkip}
        onCancel={() => {
          setHabitToSkip(null)
          setShowSkipConfirm(false)
        }}
        variant="warning"
      />

      <ConfirmDialog
        open={showForceLogConfirm}
        onOpenChange={setShowForceLogConfirm}
        title={t('habits.forceLogTitle')}
        description={t('habits.forceLogMessage')}
        confirmLabel={t('habits.forceLogConfirm')}
        cancelLabel={t('common.cancel')}
        onConfirm={confirmForceLog}
        onCancel={() => {
          setForceLogHabitId(null)
          setShowForceLogConfirm(false)
        }}
        variant="warning"
      />

      <ConfirmDialog
        open={showAutoLogParent}
        onOpenChange={setShowAutoLogParent}
        title={t('habits.autoLogParentTitle')}
        description={t('habits.autoLogParentMessage', { name: autoLogParentHabit?.title ?? '' })}
        confirmLabel={t('habits.autoLogParentConfirm')}
        cancelLabel={t('common.cancel')}
        onConfirm={confirmAutoLogParent}
        onCancel={() => {
          setAutoLogParentId(null)
          setShowAutoLogParent(false)
        }}
        variant="success"
      />

      <AppOverlay
        open={showMoveParentOverlay}
        onOpenChange={(open) => {
          if (!open) closeMoveParentPicker()
        }}
        dismissible={!isMovingParent}
        title={t('habits.moveParent.title')}
        description={movingHabit ? t('habits.moveParent.description', { name: movingHabit.title }) : undefined}
        footer={
          <div className="flex gap-3">
            <button
              className="flex-1 py-3 rounded-xl border border-[var(--hairline)] text-[var(--fg-1)] font-bold text-sm hover:bg-[var(--bg-elev)]/80 transition-[background-color,border-color,color,opacity,transform] duration-150 disabled:opacity-50"
              disabled={isMovingParent}
              onClick={closeMoveParentPicker}
            >
              {t('common.cancel')}
            </button>
            <button
              className="flex-1 py-3 rounded-xl bg-[var(--primary)] text-white font-bold text-sm hover:bg-[var(--primary-pressed)] transition-[background-color,opacity,transform] duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!canSubmitMoveParent}
              onClick={confirmMoveParent}
            >
              {isMovingParent ? t('habits.moveParent.moving') : t('habits.moveParent.confirm')}
            </button>
          </div>
        }
      >
        {moveParentOptions.length > 0 ? (
          <div className="space-y-2">
            {moveParentOptions.map((option) => (
              <button
                key={option.id ?? '__root__'}
                className={`w-full text-left rounded-lg border px-3 py-2.5 transition-[background-color,border-color,color,opacity] duration-150 ${
                  option.id === selectedMoveParentId
                    ? 'border-[var(--primary)] bg-[var(--bg-sunk)]'
                    : 'border-[var(--hairline)] bg-[var(--bg-elev)] hover:bg-[var(--bg-elev)]/80'
                } ${option.disabled ? 'opacity-50 cursor-not-allowed hover:bg-[var(--bg-elev)]' : ''}`}
                style={option.id === null ? undefined : { paddingLeft: `${0.75 + option.depth * 1.1}rem` }}
                disabled={option.disabled}
                onClick={() => setSelectedMoveParentId(option.id)}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-[var(--fg-1)] truncate">{option.label}</span>
                  {option.id === movingHabit?.parentId && (
                    <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-[var(--fg-3)]">
                      {t('habits.moveParent.currentParent')}
                    </span>
                  )}
                </div>
                {option.reason && (
                  <p className="text-[10px] text-[var(--fg-3)] mt-1">
                    {option.reason}
                  </p>
                )}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--fg-3)] text-center py-4">
            {t('habits.moveParent.noOptions')}
          </p>
        )}
      </AppOverlay>
    </div>
  )
})

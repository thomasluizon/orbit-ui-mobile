'use client'

import { useState, useMemo, useCallback, useRef as useReactRef, forwardRef, useImperativeHandle } from 'react'
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
import { useTranslations } from 'next-intl'
import { useDeviceLocale } from '@/hooks/use-device-locale'
import { useRouter } from 'next/navigation'
import {
  computeHabitReorderPositions,
  collectVisibleHabitTreeIds,
  formatAPIDate,
  formatLocaleDate,
  getHabitEmptyStateKey,
  hasHabitScheduleOnDate,
} from '@orbit/shared/utils'
import { HabitCard } from './habit-card'
import { HabitDetailDrawer } from './habit-detail-drawer'
import { CreateHabitModal } from './create-habit-modal'
import { EditHabitModal } from './edit-habit-modal'
import { LogHabitModal } from './log-habit-modal'
import {
  HabitListDateGroupSection,
  HabitListEmptyState,
  type HabitListDateGroup,
} from './habit-list-sections'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { AppOverlay } from '@/components/ui/app-overlay'
import {
  useHabits,
  useLogHabit,
  useSkipHabit,
  useDeleteHabit,
  useDuplicateHabit,
  useReorderHabits,
  useMoveHabitParent,
} from '@/hooks/use-habits'
import { useProfile } from '@/hooks/use-profile'
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
import { useUIStore } from '@/stores/ui-store'
import type { NormalizedHabit, HabitsFilter } from '@orbit/shared/types/habit'

// ---------------------------------------------------------------------------
// Props & Handle
// ---------------------------------------------------------------------------

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
}

export interface HabitListHandle {
  collapseAll: () => void
  expandAll: () => void
  allCollapsed: boolean
  allLoadedIds: Set<string>
  markRecentlyCompleted: (habitId: string) => void
  checkAndPromptParentLog: (childHabitId: string) => void
}

// ---------------------------------------------------------------------------
// Move parent picker types
// ---------------------------------------------------------------------------

interface MoveParentOption {
  id: string | null
  label: string
  depth: number
  disabled: boolean
  reason: string | null
}

// ---------------------------------------------------------------------------
// Drag item shape
// ---------------------------------------------------------------------------

interface DragItem {
  id: string
  habit: NormalizedHabit
  depth: number
  parentId: string | null
  hasChildren: boolean
  hasSubHabits: boolean
  isLastChild: boolean
}

// ---------------------------------------------------------------------------
// Date group shape
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Pure helpers (outer scope -- no component state dependency)
// ---------------------------------------------------------------------------

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
      isLastChild: false,
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

  // Post-pass: compute isLastChild
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const next = items[i + 1]
    if (item) {
      item.isLastChild = !next || next.depth <= item.depth
    }
  }

  return items
}

// ---------------------------------------------------------------------------
// Loading skeleton (stateless)
// ---------------------------------------------------------------------------

function HabitListSkeleton() {
  return (
    <div className="space-y-3 pt-2">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="habit-card-parent rounded-2xl p-4 sm:p-5 flex items-center gap-4"
        >
          <div className="size-10 sm:size-11 rounded-full bg-surface-elevated animate-pulse" />
          <div className="flex-1 space-y-2.5">
            <div className="h-4 w-3/4 bg-surface-elevated rounded-lg animate-pulse" />
            <div className="h-3 w-2/5 bg-surface-elevated/60 rounded-lg animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sortable wrapper for drag-and-drop items
// ---------------------------------------------------------------------------

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
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="mb-2.5">
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

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
}, ref) {
  const t = useTranslations()
  const router = useRouter()
  const { profile } = useProfile()
  const locale = useDeviceLocale()

  // Queries & mutations
  const habitsQuery = useHabits(filters)
  const logHabit = useLogHabit()
  const skipHabit = useSkipHabit()
  const deleteHabitMut = useDeleteHabit()
  const duplicateHabitMut = useDuplicateHabit()
  const reorderHabitsMut = useReorderHabits()
  const moveHabitParentMut = useMoveHabitParent()

  // Config
  const { config: appConfig } = useConfig()
  const maxHabitDepth = appConfig.limits.maxHabitDepth

  const data = habitsQuery.data
  const habitsById = data?.habitsById ?? new Map()
  const childrenByParent = data?.childrenByParent ?? new Map()
  const topLevelHabits = data?.topLevelHabits ?? []

  // Get children helper
  const getChildren = habitsQuery.getChildren

  // UI store
  const lastCreatedHabitId = useUIStore((s) => s.lastCreatedHabitId)

  // Recently completed for exit animation
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
  }, [])

  // Visibility helpers
  const selectedDateStr = selectedDate ? formatAPIDate(selectedDate) : formatAPIDate(new Date())
  const visibility = useHabitVisibility({
    habitsById,
    childrenByParent,
    selectedDate: selectedDateStr,
    searchQuery,
    showCompleted,
    recentlyCompletedIds,
  })

  // Wrapper for getVisibleChildren that passes the current view
  const getVisibleChildren = useCallback(
    (parentId: string): NormalizedHabit[] => {
      return visibility.getVisibleChildren(parentId, view)
    },
    [visibility, view],
  )

  // Drill navigation
  const drill = useDrillNavigation(habitsById, habitsQuery.dataUpdatedAt)

  // Collapse state
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

  // Collapse / expand all
  const expandableIds = useMemo(() => {
    const ids: string[] = []
    for (const h of habitsById.values()) {
      const childIds = childrenByParent.get(h.id)
      if (childIds && childIds.length > 0) ids.push(h.id)
    }
    return ids
  }, [habitsById, childrenByParent])

  const allCollapsed = expandableIds.length > 0 && expandableIds.every((id) => collapsedIds.has(id))

  const collapseAll = useCallback(() => {
    setCollapsedIds(new Set(expandableIds))
  }, [expandableIds])

  const expandAll = useCallback(() => {
    setCollapsedIds(new Set())
  }, [])

  // Filter habits
  const habits = useMemo(() => {
    if (view === 'general' || view === 'all') {
      return showCompleted
        ? topLevelHabits
        : topLevelHabits.filter(
            (h) => !h.isCompleted || recentlyCompletedIds.has(h.id),
          )
    }
    if (showCompleted) return topLevelHabits
    return topLevelHabits.filter((h) => visibility.hasVisibleContent(h))
  }, [topLevelHabits, view, showCompleted, recentlyCompletedIds, visibility])

  // All loaded/selectable IDs including descendants
  const allLoadedIds = useMemo(() => {
    return collectVisibleHabitTreeIds(habits, getVisibleChildren)
  }, [getVisibleChildren, habits])

  // Children progress -- matches Nuxt computeChildProgress logic
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
        // Not relevant today and not logged -- only count nested
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
    [getChildren, isListView, visibility],
  )

  // Date groups for "all" view
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

  // Flat drag items for rendering
  const dragItems = useMemo<DragItem[]>(() => {
    if (view === 'all') return []
    return buildDragItemsFlat(habits, collapsedIds, visibility.getVisibleChildren, view)
  }, [habits, collapsedIds, visibility, view])

  // -------------------------------------------------------------------------
  // Drag-and-drop state and handlers (matches Nuxt VueDraggable behavior)
  // -------------------------------------------------------------------------

  const [isDragging, setIsDragging] = useState(false)
  const autoCollapsedOnDragRef = useReactRef<string | null>(null)

  // Mutable ref for drag items so onDragEnd always sees latest after collapse
  const dragItemsRef = useReactRef<DragItem[]>(dragItems)
  dragItemsRef.current = dragItems

  // Override drag items during active drag (collapsed descendants removed)
  const [dragOverrideItems, setDragOverrideItems] = useState<DragItem[] | null>(null)
  const activeDragItems = dragOverrideItems ?? dragItems

  // DnD sensors: pointer with 5px distance activation, touch with 300ms delay
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 5 },
  })
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 300, tolerance: 5 },
  })
  const sensors = useSensors(pointerSensor, touchSensor)

  // Enable DnD only in today/general view when not in select mode
  const isDndEnabled = view !== 'all' && !isSelectMode

  function handleDragStart(event: DragStartEvent) {
    setIsDragging(true)
    autoCollapsedOnDragRef.current = null

    const draggedId = String(event.active.id)

    // Find the dragged item in current drag items
    const currentItems = dragItemsRef.current
    const draggedItem = currentItems.find((item) => item.id === draggedId)
    if (!draggedItem) return

    // If dragged item has visible children, collapse them for drag
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

    // Clean up drag state
    setIsDragging(false)
    setDragOverrideItems(null)

    // Re-expand any parent that was auto-collapsed during drag start
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

  // Card selected date (only pass in today view to dim non-due)
  const cardSelectedDate = view === 'today' ? (selectedDate ?? new Date()) : undefined

  // Modal states
  const [showDetailDrawer, setShowDetailDrawer] = useState(false)
  const [selectedHabit, setSelectedHabit] = useState<NormalizedHabit | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [habitToEdit, setHabitToEdit] = useState<NormalizedHabit | null>(null)
  const [showSubHabitModal, setShowSubHabitModal] = useState(false)
  const [subHabitParent, setSubHabitParent] = useState<NormalizedHabit | null>(null)
  const [showLogModal, setShowLogModal] = useState(false)
  const [habitToLog, setHabitToLog] = useState<NormalizedHabit | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [habitToDelete, setHabitToDelete] = useState<string | null>(null)
  const [showDuplicateConfirm, setShowDuplicateConfirm] = useState(false)
  const [habitToDuplicate, setHabitToDuplicate] = useState<NormalizedHabit | null>(null)
  const [showSkipConfirm, setShowSkipConfirm] = useState(false)
  const [habitToSkip, setHabitToSkip] = useState<string | null>(null)
  const [showForceLogConfirm, setShowForceLogConfirm] = useState(false)
  const [forceLogHabitId, setForceLogHabitId] = useState<string | null>(null)

  // Auto-log parent state
  const [showAutoLogParent, setShowAutoLogParent] = useState(false)
  const [autoLogParentId, setAutoLogParentId] = useState<string | null>(null)
  const autoLogParentHabit = autoLogParentId ? habitsById.get(autoLogParentId) ?? null : null

  // Move parent picker state
  const [showMoveParentOverlay, setShowMoveParentOverlay] = useState(false)
  const [movingHabitId, setMovingHabitId] = useState<string | null>(null)
  const [selectedMoveParentId, setSelectedMoveParentId] = useState<string | null>(null)
  const [isMovingParent, setIsMovingParent] = useState(false)
  const movingHabit = movingHabitId ? habitsById.get(movingHabitId) ?? null : null

  // -------------------------------------------------------------------------
  // Auto-log parent when all sub-habits complete
  // -------------------------------------------------------------------------

  function checkAndPromptParentLog(childHabitId: string) {
    const child = habitsById.get(childHabitId)
    if (!child?.parentId) return
    const parent = habitsById.get(child.parentId)
    if (!parent || parent.isCompleted) return

    // Only prompt if the parent itself is due today, overdue, or a general habit
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
      // After logging parent, check if grandparent also needs logging
      checkAndPromptParentLog(parentId)
    } catch {
      // Error handled by mutation
    }
  }

  // -------------------------------------------------------------------------
  // Move parent picker helpers
  // -------------------------------------------------------------------------

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

  const moveParentOptions = useMemo<MoveParentOption[]>(() => {
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

    function addOption(habit: NormalizedHabit, depth: number) {
      const validation = validateMoveTarget(habit.id, movingHabitId!)
      options.push({
        id: habit.id,
        label: habit.title,
        depth,
        disabled: !validation.valid,
        reason: validation.reason,
      })

      const ch = getChildren(habit.id)
      for (const child of ch) {
        addOption(child, depth + 1)
      }
    }

    for (const topLevel of topLevelHabits) {
      addOption(topLevel, 0)
    }

    return options
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movingHabitId, topLevelHabits, habitsById, t, maxHabitDepth])

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

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  function openDetail(habit: NormalizedHabit) {
    setSelectedHabit(habit)
    setShowDetailDrawer(true)
  }

  function promptLog(habit: NormalizedHabit) {
    setHabitToLog(habit)
    setShowLogModal(true)
  }

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

  function handleLogged(habitId: string) {
    markRecentlyCompleted(habitId)
    checkAndPromptParentLog(habitId)
  }

  async function confirmForceLog() {
    if (!forceLogHabitId) return
    markRecentlyCompleted(forceLogHabitId)
    try {
      await logHabit.mutateAsync({ habitId: forceLogHabitId })
    } catch {
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

  // Skip confirm message -- 3 branches: postpone, flexible, regular
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

  // -------------------------------------------------------------------------
  // Expose imperative handle
  // -------------------------------------------------------------------------

  useImperativeHandle(ref, () => ({
    collapseAll,
    expandAll,
    get allCollapsed() { return allCollapsed },
    get allLoadedIds() { return allLoadedIds },
    markRecentlyCompleted,
    checkAndPromptParentLog,
  }))

  // Render a single HabitCard with all handlers
  function renderHabitCard(
    habit: NormalizedHabit,
    depth: number,
    hasChildren: boolean,
    hasSubHabits: boolean,
    options?: { isLastChild?: boolean; isDraggingList?: boolean },
  ) {
    const progress = hasChildren ? getChildrenProgress(habit.id) : { done: 0, total: 0 }

    return (
      <HabitCard
        key={habit.id}
        habit={habit}
        selectedDate={cardSelectedDate}
        searchQuery={searchQuery}
        isJustCreated={lastCreatedHabitId === habit.id}
        depth={depth}
        hasChildren={hasChildren}
        hasSubHabits={hasSubHabits}
        isExpanded={!collapsedIds.has(habit.id)}
        isLastChild={options?.isLastChild}
        isDraggingList={options?.isDraggingList}
        childrenDone={progress.done}
        childrenTotal={progress.total}
        isSelectMode={isSelectMode}
        isSelected={selectedHabitIds?.has(habit.id) ?? false}
        maxHabitDepth={maxHabitDepth}
        showAddSubHabit
        actions={{
          onLog: () => promptLog(habit),
          onUnlog: () => logHabit.mutate({ habitId: habit.id }),
          onForceLogParent: () => {
            setForceLogHabitId(habit.id)
            setShowForceLogConfirm(true)
          },
          onSkip: () => promptSkip(habit.id),
          onDuplicate: () => promptDuplicate(habit.id),
          onEdit: () => {
            setHabitToEdit(habit)
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

  // Loading skeleton
  if (habitsQuery.isLoading && !habitsQuery.data) {
    return <HabitListSkeleton />
  }

  // Render nested children in all-view (avoids depth > 4 nesting)
  function renderAllViewChildren(parentId: string, depth: number): React.ReactNode {
    if (collapsedIds.has(parentId) || depth >= 3) return null
    const children = getVisibleChildren(parentId)
    if (children.length === 0) return null

    return children.map((child) => (
      <div key={child.id} className="mb-1.5">
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

  // Drill-down sub-content (loading / children / empty)
  function renderDrillContent(): React.ReactNode {
    if (drill.drillLoading) {
      return <HabitListSkeleton />
    }

    if (drill.drillChildren.length > 0) {
      return (
        <div className="space-y-2.5 pt-2">
          {drill.drillChildren.map((child) =>
            renderHabitCard(
              child,
              0,
              drill.getDrillChildren(child.id).length > 0,
              child.hasSubHabits || drill.getDrillChildren(child.id).length > 0,
            ),
          )}
          <button
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-border-muted text-text-muted text-sm hover:border-primary hover:text-primary transition-all duration-150"
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
        <p className="text-text-muted text-sm">
          {t('habits.noSubHabits')}
        </p>
        <button
          className="mt-4 flex items-center justify-center gap-2 mx-auto px-6 py-3 rounded-xl border border-dashed border-border-muted text-text-muted text-sm hover:border-primary hover:text-primary transition-all duration-150"
          onClick={() => drill.currentParentId && startAddSubHabit(drill.currentParentId)}
        >
          <Plus className="size-4" />
          {t('habits.form.addSubHabit')}
        </button>
      </div>
    )
  }

  // Main content area (replaces nested ternary chain)
  function renderMainContent(): React.ReactNode {
    // Drill-down view
    if (drill.currentParent) {
      return (
        <>
          <div className="flex items-center gap-3 pb-1">
            <button
              aria-label={t('common.goBack')}
              className="shrink-0 size-8 rounded-full bg-surface flex items-center justify-center hover:bg-surface-elevated/80 transition-all duration-150"
              onClick={drill.drillBack}
            >
              <ArrowLeft className="size-4 text-text-secondary" aria-hidden="true" />
            </button>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-text-primary truncate">
                {drill.currentParent.title}
              </h3>
              <p className="text-[10px] text-text-muted uppercase tracking-wider">
                {drill.drillChildren.filter((c) => c.isCompleted).length}/
                {drill.drillChildren.length} {t('habits.completed')}
              </p>
            </div>
          </div>

          {drill.drillStack.length > 1 && (
            <button
              className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors pb-2"
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

    // Empty: all done today
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

    // Empty: no habits
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

    // ALL VIEW: date-grouped list with nested children
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

    // TODAY / GENERAL VIEW: draggable list (not in select mode)
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
            <div className={isDragging ? 'is-dragging' : undefined}>
              {activeDragItems.map((item) => (
                <SortableHabitItem key={item.id} id={item.id}>
                  {renderHabitCard(
                    item.habit,
                    item.depth,
                    item.hasChildren,
                    item.hasSubHabits,
                    { isLastChild: item.isLastChild, isDraggingList: isDragging },
                  )}
                </SortableHabitItem>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )
    }

    // TODAY / GENERAL VIEW: select mode (no drag)
    return (
      <>
        {dragItems.map((item) => (
          <div key={item.id} className="mb-2.5">
            {renderHabitCard(
              item.habit,
              item.depth,
              item.hasChildren,
              item.hasSubHabits,
              { isLastChild: item.isLastChild },
            )}
          </div>
        ))}
      </>
    )
  }

  return (
    <div className="space-y-2.5" data-tour="tour-habit-list">
      {renderMainContent()}

      {/* Modals */}
      <HabitDetailDrawer
        open={showDetailDrawer}
        onOpenChange={setShowDetailDrawer}
        habit={selectedHabit}
        onLogged={handleLogged}
      />

      <EditHabitModal
        open={showEditModal}
        onOpenChange={setShowEditModal}
        habit={habitToEdit}
      />

      {showSubHabitModal && (
        <CreateHabitModal
          open={showSubHabitModal}
          onOpenChange={setShowSubHabitModal}
          parentHabit={subHabitParent}
        />
      )}

      <LogHabitModal
        open={showLogModal}
        onOpenChange={setShowLogModal}
        habit={habitToLog}
        onLogged={handleLogged}
      />

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

      {/* Auto-log parent when all sub-habits complete */}
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

      {/* Move parent picker */}
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
              className="flex-1 py-3 rounded-xl border border-border text-text-primary font-bold text-sm hover:bg-surface-elevated/80 transition-all duration-150 disabled:opacity-50"
              disabled={isMovingParent}
              onClick={closeMoveParentPicker}
            >
              {t('common.cancel')}
            </button>
            <button
              className="flex-1 py-3 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary/90 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
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
                className={`w-full text-left rounded-lg border px-3 py-2.5 transition-all duration-150 ${
                  option.id === selectedMoveParentId
                    ? 'border-primary bg-primary/10'
                    : 'border-border-muted bg-surface hover:bg-surface-elevated/80'
                } ${option.disabled ? 'opacity-50 cursor-not-allowed hover:bg-surface' : ''}`}
                style={option.id === null ? undefined : { paddingLeft: `${0.75 + option.depth * 1.1}rem` }}
                disabled={option.disabled}
                onClick={() => setSelectedMoveParentId(option.id)}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-text-primary truncate">{option.label}</span>
                  {option.id === movingHabit?.parentId && (
                    <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-text-muted">
                      {t('habits.moveParent.currentParent')}
                    </span>
                  )}
                </div>
                {option.reason && (
                  <p className="text-[10px] text-text-muted mt-1">
                    {option.reason}
                  </p>
                )}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-muted text-center py-4">
            {t('habits.moveParent.noOptions')}
          </p>
        )}
      </AppOverlay>
    </div>
  )
})

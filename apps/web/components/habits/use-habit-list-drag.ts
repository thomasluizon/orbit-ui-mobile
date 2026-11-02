'use client'

import { useMemo, useCallback, useEffect, useRef } from 'react'
import { buildHabitDateBuckets, computeHabitReorderPositions, sortNormalizedHabits } from '@orbit/shared/utils'
import { useHabitInlineDepthLimit } from './use-habit-row-large-text'
import { buildDragItemsFlat, groupDragItemsByPanel, type DragItem, type HabitView } from './habit-list/tree-helpers'
import { PointerSensor, TouchSensor, useSensor, useSensors, type DragStartEvent, type DragEndEvent } from '@dnd-kit/core'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { useAccountScopedState, useResetOnAccountChange } from '@/hooks/use-session-reset'
import { useHabitListScrollAnchor } from '@/hooks/use-habit-list-scroll-anchor'
import type { useHabitListVisibility, useHabitListRoots, useHabitListQueries, useHabitListCollapse } from './use-habit-list-state'

function getListViewPanelStyle(view: HabitView, rootCount: number, isDragging: boolean) {
  return view !== 'today' && rootCount >= 21 && !isDragging
    ? { contentVisibility: 'auto', containIntrinsicSize: 'auto 96px' } as const
    : undefined
}

function withoutDraggedDescendants(items: DragItem[], draggedItem: DragItem): DragItem[] {
  const filtered: DragItem[] = []
  let stripping = false
  for (const item of items) {
    if (item.id === draggedItem.id) { stripping = true; filtered.push({ ...item, hasChildren: true }); continue }
    if (stripping && item.depth > draggedItem.depth) continue
    stripping = false
    filtered.push(item)
  }
  return filtered
}

type HabitListDragInputs = {
  visibilityState: Pick<ReturnType<typeof useHabitListVisibility>, 'drill' | 'visibility'>
  view: HabitView
  roots: Pick<ReturnType<typeof useHabitListRoots>, 'habits'>
  queries: Pick<ReturnType<typeof useHabitListQueries>, 'todayStr' | 'habitsById' | 'getChildren' | 'reorderHabitsMut'>
  collapse: Pick<ReturnType<typeof useHabitListCollapse>, 'collapsedIds' | 'setCollapsedIds'>
  isSelectMode: boolean
}

export function useHabitListDrag({ visibilityState, view, roots, queries, collapse, isSelectMode }: HabitListDragInputs) {
  const { drill, visibility } = visibilityState
  const { habits } = roots
  const { todayStr, habitsById, getChildren, reorderHabitsMut } = queries
  const { collapsedIds, setCollapsedIds } = collapse
  const listContainerRef = useRef<HTMLDivElement>(null)
  const anchorList = useHabitListScrollAnchor(drill.currentParentId)
  const { maxInlineDepth, measureRef } = useHabitInlineDepthLimit()
  const setListContainerRef = useCallback((element: HTMLDivElement | null) => {
    listContainerRef.current = element
    const releaseMeasurement = measureRef(element)
    const releaseAnchor = anchorList(element)
    return () => { releaseMeasurement?.(); releaseAnchor?.() }
  }, [anchorList, measureRef])
  const dragItems = useMemo<DragItem[]>(() => {
    const ordered = view === 'all' ? buildHabitDateBuckets(habits, todayStr).flatMap((bucket) => bucket.habits) : habits
    return buildDragItemsFlat(ordered, collapsedIds, visibility.getVisibleChildren, view, maxInlineDepth)
  }, [habits, collapsedIds, visibility, view, todayStr, maxInlineDepth])

  const [isDragging, setIsDragging] = useAccountScopedState(false)
  const autoCollapsedOnDragRef = useRef<string | null>(null)
  useResetOnAccountChange(() => { autoCollapsedOnDragRef.current = null })

  const dragItemsRef = useRef<DragItem[]>(dragItems)
  useEffect(() => {
    dragItemsRef.current = dragItems
  }, [dragItems])

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
  const sensors = useSensors(pointerSensor, touchSensor)

  const isDndEnabled = view !== 'all' && !isSelectMode
  const listViewPanelStyle = getListViewPanelStyle(view, habits.length, isDragging)
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
      const filtered = withoutDraggedDescendants(currentItems, draggedItem)
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

    restoreAfterDrag()
  }

  function restoreAfterDrag() {
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
  return { isDragging, dragItems, listContainerRef, maxInlineDepth, dragPanels, listViewPanelStyle,
    sensors, activeDragItems, isDndEnabled, activeDragPanels, setListContainerRef, handleDragStart, handleDragEnd, restoreAfterDrag }
}

type HabitListKeyboardReorderInputs = Pick<ReturnType<typeof useHabitListQueries>, 'dndContextId' | 'reorderHabitsMut' | 't' | 'habitsById' | 'getChildren'> & Pick<ReturnType<typeof useHabitListDrag>, 'isDragging' | 'dragItems'>

export function useHabitListKeyboardReorder({ dndContextId, reorderHabitsMut, isDragging, dragItems, t, habitsById, getChildren }: HabitListKeyboardReorderInputs) {
  const reorderInstructionsId = `${dndContextId}-habit-reorder-instructions`
  const [reorderAnnouncements, setReorderAnnouncements] = useAccountScopedState<readonly [string, string]>(['', ''])
  function announceReorder(message: string) {
    setReorderAnnouncements(([first]) => first === '' ? [message, ''] : ['', message])
  }

  function moveHabitByKeyboard(habit: NormalizedHabit, direction: -1 | 1) {
    if (reorderHabitsMut.isPending || isDragging) return
    const siblings = dragItems.filter((sibling) => sibling.parentId === (habit.parentId ?? null))
    const currentIndex = siblings.findIndex((sibling) => sibling.id === habit.id)
    const targetIndex = currentIndex + direction
    if (targetIndex < 0 || targetIndex >= siblings.length) {
      announceReorder(t('habits.reorderBoundary', { title: habit.title, position: currentIndex + 1, total: siblings.length }))
      return
    }
    const storedSiblings = Array.from(habitsById.values())
      .filter((sibling) => (sibling.parentId ?? null) === (habit.parentId ?? null))
      .sort(sortNormalizedHabits)
    const storedIndex = storedSiblings.findIndex((sibling) => sibling.id === habit.id)
    const storedTargetIndex = storedSiblings.findIndex((sibling) => sibling.id === siblings[targetIndex]!.id)
    const positions = computeHabitReorderPositions(storedSiblings, storedIndex, storedTargetIndex, habitsById, getChildren)
    if (positions.length === 0) return
    reorderHabitsMut.mutate({ positions }, {
      onSuccess: () => announceReorder(t('habits.reorderMoved', { title: habit.title, position: targetIndex + 1, total: siblings.length })),
    })
  }
  return { reorderInstructionsId, moveHabitByKeyboard, reorderAnnouncements }
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { computeHabitReorderPositions } from '@orbit/shared/utils'
import type { DragItem } from '../habit-list/tree-helpers'
import type { useHabitListCollapseState, useHabitListItems, useHabitListQueries } from './use-habit-list-state'

type HabitListDragInputs = {
  collapse: Pick<ReturnType<typeof useHabitListCollapseState>, 'collapsedIds' | 'setCollapsedIds'>
  items: Pick<ReturnType<typeof useHabitListItems>, 'flatItems'>
  queries: Pick<ReturnType<typeof useHabitListQueries>, 'habitsById' | 'getChildren' | 'reorderHabitsMutation'>
}

export function useHabitListDrag({ collapse, items, queries }: HabitListDragInputs) {
  const { collapsedIds, setCollapsedIds } = collapse
  const { habitsById, getChildren, reorderHabitsMutation } = queries
  const [isDraggingList, setIsDraggingList] = useState(false)
  const [dragOverrideItems, setDragOverrideItems] = useState<
    DragItem[] | null
  >(null)
  const autoCollapsedOnDragRef = useRef<string | null>(null)

  const restoreCollapsedStateAfterDrag = useCallback(() => {
    setIsDraggingList(false)
    setDragOverrideItems(null)

    const autoCollapsedId = autoCollapsedOnDragRef.current
    if (!autoCollapsedId) return

    setCollapsedIds((prev) => {
      const next = new Set(prev)
      next.delete(autoCollapsedId)
      return next
    })
    autoCollapsedOnDragRef.current = null
  }, [setCollapsedIds, setIsDraggingList])
  const activeDragItems = dragOverrideItems ?? items.flatItems
  const activeDragItemsRef = useRef(activeDragItems)
  useEffect(() => { activeDragItemsRef.current = activeDragItems }, [activeDragItems])
  const prepareDrag = useCallback(
    (item: DragItem, drag: () => void) => {
      setIsDraggingList(true)
      autoCollapsedOnDragRef.current = null

      if (item.hasChildren && !collapsedIds.has(item.id)) {
        autoCollapsedOnDragRef.current = item.id
        const filtered: DragItem[] = []
        let strippingDescendants = false

        for (const candidate of activeDragItemsRef.current) {
          if (candidate.id === item.id) {
            strippingDescendants = true
            filtered.push(candidate)
            continue
          }

          if (strippingDescendants && candidate.depth > item.depth) {
            continue
          }

          strippingDescendants = false
          filtered.push(candidate)
        }

        setCollapsedIds((prev) => new Set(prev).add(item.id))
        setDragOverrideItems(filtered)
        setTimeout(drag, 0)
        return
      }

      drag()
    },
    [activeDragItemsRef, autoCollapsedOnDragRef, collapsedIds, setCollapsedIds, setDragOverrideItems, setIsDraggingList],
  )
  const handleDragEnd = useCallback(
    async ({ from, to }: { from: number; to: number }) => {
      const items = activeDragItemsRef.current

      try {
        if (from === to) return

        const positions = computeHabitReorderPositions(
          items,
          from,
          to,
          habitsById,
          getChildren,
        )

        if (positions.length > 0) {
          await reorderHabitsMutation.mutateAsync({ positions })
        }
      } catch {
      } finally {
        restoreCollapsedStateAfterDrag()
      }
    },
    // react-doctor-disable-next-line exhaustive-deps -- getChildren/habitsById are extracted habitsQuery members already listed; the analyzer wants the qualified paths but the aliases track them https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    [activeDragItemsRef, getChildren, habitsById, reorderHabitsMutation, restoreCollapsedStateAfterDrag],
  )
  return { activeDragItems, isDraggingList, prepareDrag, handleDragEnd }
}

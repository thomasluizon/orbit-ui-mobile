import { useCallback, useRef, useState } from 'react'
import { computeHabitReorderPositions } from '@orbit/shared/utils'
import type { DragItem } from '../habit-list/tree-helpers'
import type { useHabitListCollapseState, useHabitListPresentation, useHabitListQueries } from './use-habit-list-state'

type HabitListDragStateInputs = Pick<ReturnType<typeof useHabitListCollapseState>, 'setIsDraggingList' | 'setCollapsedIds'>

export function useHabitListDragState({ setIsDraggingList, setCollapsedIds }: HabitListDragStateInputs) {
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
  return { dragOverrideItems, autoCollapsedOnDragRef, setDragOverrideItems, restoreCollapsedStateAfterDrag }
}

type HabitListPrepareDragInputs = Pick<ReturnType<typeof useHabitListCollapseState>, 'setIsDraggingList' | 'collapsedIds' | 'setCollapsedIds'> & Pick<ReturnType<typeof useHabitListDragState>, 'autoCollapsedOnDragRef' | 'setDragOverrideItems'> & Pick<ReturnType<typeof useHabitListPresentation>, 'activeDragItemsRef'>

export function useHabitListPrepareDrag({ setIsDraggingList, autoCollapsedOnDragRef, collapsedIds, activeDragItemsRef, setCollapsedIds, setDragOverrideItems }: HabitListPrepareDragInputs) {
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
  return { prepareDrag }
}

type HabitListDragEndInputs = Pick<ReturnType<typeof useHabitListPresentation>, 'activeDragItemsRef'> & Pick<ReturnType<typeof useHabitListQueries>, 'habitsById' | 'getChildren' | 'reorderHabitsMutation'> & Pick<ReturnType<typeof useHabitListDragState>, 'restoreCollapsedStateAfterDrag'>

export function useHabitListDragEnd({ activeDragItemsRef, habitsById, getChildren, reorderHabitsMutation, restoreCollapsedStateAfterDrag }: HabitListDragEndInputs) {
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
  return { handleDragEnd }
}

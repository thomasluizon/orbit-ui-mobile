'use client'

import { useRef, useCallback, useState } from 'react'
import { GoalCard } from './goal-card'
import { useReorderGoals } from '@/hooks/use-goals'
import type { Goal, GoalPositionItem } from '@orbit/shared/types/goal'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GoalListProps {
  goals: Goal[]
}

// ---------------------------------------------------------------------------
// Constants (matching Nuxt SortableJS config)
// ---------------------------------------------------------------------------

/** Delay before touch drag starts (ms) -- matches SortableJS delay: 300 */
const TOUCH_HOLD_DELAY = 300

/** Minimum movement (px) before cancelling hold -- matches touchStartThreshold: 5 */
const TOUCH_MOVE_THRESHOLD = 5

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GoalList({ goals }: GoalListProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const reorderGoals = useReorderGoals()

  // Drag state (shared between mouse and touch)
  const dragItemRef = useRef<number | null>(null)
  const dragOverItemRef = useRef<number | null>(null)

  // Visual state
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  // Touch state
  const touchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const touchStartPos = useRef<{ x: number; y: number } | null>(null)
  const touchDragging = useRef(false)
  const touchItemRef = useRef<HTMLDivElement | null>(null)

  // -------------------------------------------------------------------------
  // Reorder logic (shared)
  // -------------------------------------------------------------------------

  const commitReorder = useCallback(() => {
    if (
      dragItemRef.current === null ||
      dragOverItemRef.current === null ||
      dragItemRef.current === dragOverItemRef.current
    ) {
      dragItemRef.current = null
      dragOverItemRef.current = null
      setDragIndex(null)
      setDragOverIndex(null)
      return
    }

    const reordered = [...goals]
    const [draggedItem] = reordered.splice(dragItemRef.current, 1)
    if (draggedItem) {
      reordered.splice(dragOverItemRef.current, 0, draggedItem)
    }

    const positions: GoalPositionItem[] = reordered.map((g, i) => ({
      id: g.id,
      position: i,
    }))

    reorderGoals.mutate(positions)

    dragItemRef.current = null
    dragOverItemRef.current = null
    setDragIndex(null)
    setDragOverIndex(null)
  }, [goals, reorderGoals])

  // -------------------------------------------------------------------------
  // HTML5 drag handlers (mouse/pointer)
  // -------------------------------------------------------------------------

  const handleDragStart = useCallback((index: number) => {
    dragItemRef.current = index
    setDragIndex(index)
  }, [])

  const handleDragEnter = useCallback((index: number) => {
    dragOverItemRef.current = index
    setDragOverIndex(index)
  }, [])

  const handleDragEnd = useCallback(() => {
    commitReorder()
  }, [commitReorder])

  // -------------------------------------------------------------------------
  // Touch handlers (mobile support with 300ms hold delay)
  // -------------------------------------------------------------------------

  const clearTouchTimer = useCallback(() => {
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current)
      touchTimerRef.current = null
    }
  }, [])

  const getItemIndexFromPoint = useCallback((x: number, y: number): number | null => {
    const list = listRef.current
    if (!list) return null
    const children = Array.from(list.children) as HTMLElement[]
    for (let i = 0; i < children.length; i++) {
      const child = children[i]
      if (!child) continue
      const rect = child.getBoundingClientRect()
      if (y >= rect.top && y <= rect.bottom) {
        return i
      }
    }
    return null
  }, [])

  const handleTouchStart = useCallback(
    (index: number, e: React.TouchEvent<HTMLDivElement>) => {
      const touch = e.touches[0]
      if (!touch) return
      touchStartPos.current = { x: touch.clientX, y: touch.clientY }
      touchItemRef.current = e.currentTarget

      touchTimerRef.current = setTimeout(() => {
        touchDragging.current = true
        dragItemRef.current = index
        setDragIndex(index)
      }, TOUCH_HOLD_DELAY)
    },
    [],
  )

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      const touch = e.touches[0]
      if (!touch) return

      // Cancel hold if moved too far before delay elapsed
      if (!touchDragging.current && touchStartPos.current) {
        const dx = Math.abs(touch.clientX - touchStartPos.current.x)
        const dy = Math.abs(touch.clientY - touchStartPos.current.y)
        if (dx > TOUCH_MOVE_THRESHOLD || dy > TOUCH_MOVE_THRESHOLD) {
          clearTouchTimer()
          return
        }
      }

      if (!touchDragging.current) return

      // Prevent scrolling while dragging
      e.preventDefault()

      const overIndex = getItemIndexFromPoint(touch.clientX, touch.clientY)
      if (overIndex !== null) {
        dragOverItemRef.current = overIndex
        setDragOverIndex(overIndex)
      }
    },
    [clearTouchTimer, getItemIndexFromPoint],
  )

  const handleTouchEnd = useCallback(() => {
    clearTouchTimer()
    if (touchDragging.current) {
      touchDragging.current = false
      commitReorder()
    }
    touchStartPos.current = null
    touchItemRef.current = null
  }, [clearTouchTimer, commitReorder])

  // -------------------------------------------------------------------------
  // CSS class helper
  // -------------------------------------------------------------------------

  const getDragClasses = useCallback(
    (index: number): string => {
      if (dragIndex === null) return ''
      if (index === dragIndex) return 'drag-chosen'
      if (index === dragOverIndex) return 'drag-ghost'
      return ''
    },
    [dragIndex, dragOverIndex],
  )

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div ref={listRef} className="space-y-3">
      {goals.map((goal, index) => (
        <div
          key={goal.id}
          role="group"
          aria-roledescription="draggable item"
          draggable
          className={getDragClasses(index)}
          onDragStart={() => handleDragStart(index)}
          onDragEnter={() => handleDragEnter(index)}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => e.preventDefault()}
          onTouchStart={(e) => handleTouchStart(index, e)}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <GoalCard goal={goal} />
        </div>
      ))}
    </div>
  )
}

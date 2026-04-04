'use client'

import { useRef, useCallback } from 'react'
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
// Component
// ---------------------------------------------------------------------------

export function GoalList({ goals }: GoalListProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const reorderGoals = useReorderGoals()

  // Drag state
  const dragItemRef = useRef<number | null>(null)
  const dragOverItemRef = useRef<number | null>(null)

  const handleDragStart = useCallback((index: number) => {
    dragItemRef.current = index
  }, [])

  const handleDragEnter = useCallback((index: number) => {
    dragOverItemRef.current = index
  }, [])

  const handleDragEnd = useCallback(() => {
    if (
      dragItemRef.current === null ||
      dragOverItemRef.current === null ||
      dragItemRef.current === dragOverItemRef.current
    ) {
      dragItemRef.current = null
      dragOverItemRef.current = null
      return
    }

    // Build reordered list
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
  }, [goals, reorderGoals])

  return (
    <div ref={listRef} className="space-y-3">
      {goals.map((goal, index) => (
        <div
          key={goal.id}
          draggable
          onDragStart={() => handleDragStart(index)}
          onDragEnter={() => handleDragEnter(index)}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => e.preventDefault()}
        >
          <GoalCard goal={goal} />
        </div>
      ))}
    </div>
  )
}

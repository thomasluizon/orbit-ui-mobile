'use client'

import { MouseSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import type { Goal, GoalPositionItem } from '@orbit/shared/types/goal'
import { buildGoalMovePositions } from '@orbit/shared/utils'

export function useGoalDrag(goals: readonly Goal[], enabled: boolean, commit: (positions: GoalPositionItem[]) => void) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 5 } }),
  )
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!enabled || !over) return
    const positions = buildGoalMovePositions(goals, String(active.id), goals.findIndex((goal) => goal.id === over.id))
    if (positions) commit(positions)
  }
  return { sensors, onDragEnd }
}

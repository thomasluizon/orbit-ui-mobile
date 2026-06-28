import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockGoal } from '@orbit/shared/__tests__/factories'
import type { Goal } from '@orbit/shared/types/goal'
import { GoalList } from '@/components/goals/goal-list'

const TestRenderer = require('react-test-renderer')

const reorderMutate = vi.fn()

vi.mock('@/hooks/use-goals', () => ({
  useReorderGoals: () => ({ mutate: reorderMutate }),
}))

vi.mock('@/components/goal-card', () => ({
  GoalCard: (props: Record<string, unknown>) =>
    React.createElement('GoalCard', props),
}))

vi.mock('@/components/goals/goal-detail-drawer', () => ({
  GoalDetailDrawer: () => null,
}))

function renderGoalList(goals: Goal[]) {
  let tree: any
  TestRenderer.act(() => {
    tree = TestRenderer.create(<GoalList goals={goals} />)
  })
  return tree
}

describe('GoalList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('submits sequential goal positions on drag end', () => {
    const first = createMockGoal({ id: 'goal-1', position: 0 })
    const second = createMockGoal({ id: 'goal-2', position: 1 })
    const tree = renderGoalList([first, second])

    const draggableList = tree.root.findByType('DraggableFlatList')

    TestRenderer.act(() => {
      draggableList.props.onDragEnd({ data: [second, first], from: 1, to: 0 })
    })

    expect(reorderMutate).toHaveBeenCalledWith([
      { id: 'goal-2', position: 0 },
      { id: 'goal-1', position: 1 },
    ])
  })

  it('wires a long-press drag handle onto every goal card', () => {
    const tree = renderGoalList([
      createMockGoal({ id: 'goal-1', position: 0 }),
      createMockGoal({ id: 'goal-2', position: 1 }),
    ])

    const cards = tree.root.findAllByType('GoalCard')

    expect(cards).toHaveLength(2)
    for (const card of cards) {
      expect(typeof card.props.onLongPress).toBe('function')
    }
  })
})

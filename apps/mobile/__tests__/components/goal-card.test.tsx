import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Goal } from '@orbit/shared/types/goal'
import { GoalCard } from '@/components/goal-card'

const TestRenderer = require('react-test-renderer')

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
    i18n: { language: 'en-US' },
  }),
}))

vi.mock('@/lib/plural', () => ({
  plural: (text: string) => text,
}))

vi.mock('@/hooks/use-tour-target', () => ({
  useTourTarget: () => {},
}))

vi.mock('@/lib/motion', () => ({
  toAnimatedEasing: () => (value: number) => value,
  usePrefersReducedMotion: () => false,
  useResolvedMotionPreset: () => ({
    reducedMotionEnabled: false,
    exitDuration: 160,
  }),
}))

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: '1',
    title: 'Read 12 books',
    description: null,
    targetValue: 12,
    currentValue: 3,
    unit: 'books',
    status: 'Active',
    deadline: null,
    position: 0,
    createdAtUtc: '2025-01-01T00:00:00Z',
    completedAtUtc: null,
    progressPercentage: 25,
    ...overrides,
  }
}

function collectText(node: unknown): string {
  if (!node) return ''
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(collectText).join('')
  const withChildren = node as { children?: unknown }
  return collectText(withChildren.children ?? [])
}

function renderCard(goal: Goal, onLongPress?: () => void) {
  let tree: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => {
    tree = TestRenderer.create(
      <GoalCard goal={goal} onPress={vi.fn()} onLongPress={onLongPress} />,
    )
  })
  return tree!
}

describe('GoalCard', () => {
  it('shows the due-today badge when the deadline is today', () => {
    const withinToday = new Date(Date.now() + 60_000).toISOString()
    const tree = renderCard(makeGoal({ deadline: withinToday }))
    expect(collectText(tree.toJSON())).toContain('goals.deadline.dueToday')
  })

  it('shows the overdue badge for a past deadline', () => {
    const tree = renderCard(makeGoal({ deadline: '2020-01-01' }))
    expect(collectText(tree.toJSON())).toContain('goals.deadline.overdue')
  })

  it('announces the long-press reorder hint when draggable', () => {
    const tree = renderCard(makeGoal(), vi.fn())
    const card = tree.root.findAll(
      (node: { props: { accessibilityHint?: string } }) =>
        node.props.accessibilityHint === 'goals.reorderHint',
    )
    expect(card.length).toBeGreaterThan(0)
  })

  it('omits the reorder hint when not draggable', () => {
    const tree = renderCard(makeGoal())
    const card = tree.root.findAll(
      (node: { props: { accessibilityHint?: string } }) =>
        node.props.accessibilityHint === 'goals.reorderHint',
    )
    expect(card).toHaveLength(0)
  })

  it('caps the announced percentage at 100 for overflowing progress', () => {
    const tree = renderCard(makeGoal({ progressPercentage: 120 }))
    const bars = tree.root.findAll(
      (node: { props: { accessibilityLabel?: string } }) =>
        node.props.accessibilityLabel === 'goals.progressPercentage:{"pct":100}',
    )
    expect(bars.length).toBeGreaterThan(0)
  })
})

import { describe, it, expect } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import {
  buildDragItemsFlat,
  groupHabitItemsIntoPanels,
  MAX_INLINE_DEPTH,
} from '@/components/habits/habit-list/tree-helpers'

const root = createMockHabit({ id: 'root', title: 'Water', hasSubHabits: true })
const child = createMockHabit({ id: 'child', title: 'Morning', parentId: 'root', hasSubHabits: true })
const grandchild = createMockHabit({ id: 'grandchild', title: 'Glass', parentId: 'child', hasSubHabits: true })
const greatGrandchild = createMockHabit({ id: 'greatGrandchild', title: 'Sip', parentId: 'grandchild' })
const solo = createMockHabit({ id: 'solo', title: 'Run' })

const childrenByParent: Record<string, NormalizedHabit[]> = {
  root: [child],
  child: [grandchild],
  grandchild: [greatGrandchild],
}
const getVisibleChildren = (habitId: string) => childrenByParent[habitId] ?? []

describe('buildDragItemsFlat inline depth cap', () => {
  it('renders three levels inline (parent + two sub-habit levels) and stops before the fourth', () => {
    const items = buildDragItemsFlat([root], new Set(), getVisibleChildren, 'today')
    const ids = items.map((item) => item.id)

    expect(ids).toEqual(['root', 'child', 'grandchild'])
    expect(items.find((item) => item.id === 'greatGrandchild')).toBeUndefined()
  })

  it('flags a capped level-2 node as having children so it can drill in', () => {
    const items = buildDragItemsFlat([root], new Set(), getVisibleChildren, 'today')
    const grandchildItem = items.find((item) => item.id === 'grandchild')

    expect(grandchildItem?.depth).toBe(MAX_INLINE_DEPTH)
    expect(grandchildItem?.hasChildren).toBe(true)
  })

  it('does not descend into a collapsed family', () => {
    const items = buildDragItemsFlat([root], new Set(['root']), getVisibleChildren, 'today')
    expect(items.map((item) => item.id)).toEqual(['root'])
  })
})

describe('groupHabitItemsIntoPanels', () => {
  it('opens a new panel at every top-level habit and absorbs its inline descendants', () => {
    const items = buildDragItemsFlat([root, solo], new Set(), getVisibleChildren, 'today')
    const panels = groupHabitItemsIntoPanels(items)

    expect(panels).toHaveLength(2)
    expect(panels[0]?.rootId).toBe('root')
    expect(panels[0]?.items.map((item) => item.id)).toEqual(['root', 'child', 'grandchild'])
    expect(panels[1]?.rootId).toBe('solo')
    expect(panels[1]?.items.map((item) => item.id)).toEqual(['solo'])
  })
})

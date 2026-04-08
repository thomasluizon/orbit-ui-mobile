import { describe, expect, it } from 'vitest'
import type { HabitDetail, HabitDetailChild } from '../types/habit'
import {
  normalizeDrillDetailChild,
  normalizeHabitDetailForDrill,
} from '../utils/drill-navigation'

function makeDetailChild(overrides: Partial<HabitDetailChild> = {}): HabitDetailChild {
  return {
    id: overrides.id ?? 'child-1',
    title: overrides.title ?? 'Child habit',
    description: overrides.description ?? null,
    frequencyUnit: overrides.frequencyUnit ?? null,
    frequencyQuantity: overrides.frequencyQuantity ?? null,
    isBadHabit: overrides.isBadHabit ?? false,
    isCompleted: overrides.isCompleted ?? false,
    isGeneral: overrides.isGeneral ?? false,
    isFlexible: overrides.isFlexible ?? false,
    days: overrides.days ?? [],
    dueDate: overrides.dueDate ?? '2025-01-01',
    dueTime: overrides.dueTime ?? null,
    dueEndTime: overrides.dueEndTime ?? null,
    endDate: overrides.endDate ?? null,
    position: overrides.position ?? null,
    checklistItems: overrides.checklistItems ?? [],
    children: overrides.children ?? [],
  }
}

function makeDetail(overrides: Partial<HabitDetail> = {}): HabitDetail {
  return {
    id: overrides.id ?? 'parent-1',
    title: overrides.title ?? 'Parent habit',
    description: overrides.description ?? null,
    frequencyUnit: overrides.frequencyUnit ?? null,
    frequencyQuantity: overrides.frequencyQuantity ?? null,
    isBadHabit: overrides.isBadHabit ?? false,
    isCompleted: overrides.isCompleted ?? false,
    isGeneral: overrides.isGeneral ?? false,
    isFlexible: overrides.isFlexible ?? false,
    days: overrides.days ?? [],
    dueDate: overrides.dueDate ?? '2025-01-01',
    dueTime: overrides.dueTime ?? null,
    dueEndTime: overrides.dueEndTime ?? null,
    endDate: overrides.endDate ?? null,
    position: overrides.position ?? 2,
    checklistItems: overrides.checklistItems ?? [],
    createdAtUtc: overrides.createdAtUtc ?? '2025-01-01T00:00:00Z',
    reminderEnabled: overrides.reminderEnabled ?? true,
    reminderTimes: overrides.reminderTimes ?? [540],
    scheduledReminders: overrides.scheduledReminders ?? [],
    children: overrides.children ?? [],
  }
}

describe('drill navigation utils', () => {
  it('normalizes drill detail child with defaults and overdue flag', () => {
    const child = makeDetailChild({
      dueDate: '2025-01-01',
      dueTime: null,
      dueEndTime: null,
      endDate: null,
      position: null,
      children: [makeDetailChild({ id: 'grand-1' })],
    })

    const normalized = normalizeDrillDetailChild(child, 'parent-1', '2025-01-02')

    expect(normalized.parentId).toBe('parent-1')
    expect(normalized.dueTime).toBe('')
    expect(normalized.dueEndTime).toBe('')
    expect(normalized.endDate).toBe('')
    expect(normalized.position).toBe(0)
    expect(normalized.isOverdue).toBe(true)
    expect(normalized.hasSubHabits).toBe(true)
  })

  it('builds parent and child maps for drill navigation', () => {
    const detail = makeDetail({
      id: 'parent-1',
      children: [
        makeDetailChild({
          id: 'child-1',
          children: [makeDetailChild({ id: 'grand-1' })],
        }),
        makeDetailChild({
          id: 'child-2',
          children: [],
        }),
      ],
    })

    const normalized = normalizeHabitDetailForDrill(detail, '2025-01-02')

    expect(normalized.parent.id).toBe('parent-1')
    expect(normalized.parent.parentId).toBeNull()
    expect(normalized.parent.createdAtUtc).toBe('2025-01-01T00:00:00Z')
    expect(normalized.parent.reminderEnabled).toBe(true)
    expect(normalized.parent.position).toBe(2)

    expect(normalized.childrenByParent.get('parent-1')?.map((habit) => habit.id)).toEqual([
      'child-1',
      'child-2',
    ])
    expect(normalized.childrenByParent.get('child-1')?.map((habit) => habit.id)).toEqual([
      'grand-1',
    ])
    expect(normalized.childrenByParent.has('child-2')).toBe(false)
  })
})

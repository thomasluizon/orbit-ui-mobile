import { describe, expect, it } from 'vitest'
import { createMockGoal } from './factories'
import {
  appendTag,
  mapHabitTagReferences,
  removeTagFromList,
  resolveHabitTags,
  setHabitTags,
  updateTagInList,
} from '../utils/tag-cache'
import type { HabitScheduleChild, HabitScheduleItem } from '../types/habit'

function makeHabit(overrides: Partial<HabitScheduleItem> = {}): HabitScheduleItem {
  return {
    id: overrides.id ?? 'habit-1',
    title: overrides.title ?? 'Exercise',
    description: overrides.description ?? null,
    frequencyUnit: overrides.frequencyUnit ?? 'Day',
    frequencyQuantity: overrides.frequencyQuantity ?? 1,
    isBadHabit: overrides.isBadHabit ?? false,
    isCompleted: overrides.isCompleted ?? false,
    isGeneral: overrides.isGeneral ?? false,
    isFlexible: overrides.isFlexible ?? false,
    days: overrides.days ?? [],
    dueDate: overrides.dueDate ?? '2025-01-01',
    dueTime: overrides.dueTime ?? null,
    dueEndTime: overrides.dueEndTime ?? null,
    endDate: overrides.endDate ?? null,
    position: overrides.position ?? 0,
    checklistItems: overrides.checklistItems ?? [],
    createdAtUtc: overrides.createdAtUtc ?? '2025-01-01T00:00:00Z',
    scheduledDates: overrides.scheduledDates ?? ['2025-01-01'],
    isOverdue: overrides.isOverdue ?? false,
    reminderEnabled: overrides.reminderEnabled ?? false,
    reminderTimes: overrides.reminderTimes ?? [],
    scheduledReminders: overrides.scheduledReminders ?? [],
    slipAlertEnabled: overrides.slipAlertEnabled ?? false,
    tags: overrides.tags ?? [{ id: 'tag-1', name: 'Health', color: '#00ff00' }],
    children: overrides.children ?? [],
    hasSubHabits: overrides.hasSubHabits ?? false,
    flexibleTarget: overrides.flexibleTarget ?? null,
    flexibleCompleted: overrides.flexibleCompleted ?? null,
    linkedGoals: overrides.linkedGoals ?? [createMockGoal({ id: 'goal-1' })].map((goal) => ({
      id: goal.id,
      title: goal.title,
    })),
    instances: overrides.instances ?? [],
    searchMatches: overrides.searchMatches,
  }
}

function makeChild(overrides: Partial<HabitScheduleChild> = {}): HabitScheduleChild {
  return {
    id: overrides.id ?? 'child-1',
    title: overrides.title ?? 'Child',
    description: overrides.description ?? null,
    frequencyUnit: overrides.frequencyUnit ?? 'Day',
    frequencyQuantity: overrides.frequencyQuantity ?? 1,
    isBadHabit: overrides.isBadHabit ?? false,
    isCompleted: overrides.isCompleted ?? false,
    isGeneral: overrides.isGeneral ?? false,
    isFlexible: overrides.isFlexible ?? false,
    days: overrides.days ?? [],
    dueDate: overrides.dueDate ?? '2025-01-01',
    dueTime: overrides.dueTime ?? null,
    dueEndTime: overrides.dueEndTime ?? null,
    endDate: overrides.endDate ?? null,
    position: overrides.position ?? 0,
    checklistItems: overrides.checklistItems ?? [],
    tags: overrides.tags ?? [{ id: 'tag-1', name: 'Health', color: '#00ff00' }],
    children: overrides.children ?? [],
    hasSubHabits: overrides.hasSubHabits ?? false,
    isLoggedInRange: overrides.isLoggedInRange ?? false,
    instances: overrides.instances ?? [],
    searchMatches: overrides.searchMatches,
  }
}

describe('tag-cache utils', () => {
  it('appends, updates, and removes tag entries', () => {
    const initial = [{ id: 'tag-1', name: 'Health', color: '#00ff00' }]

    expect(appendTag(initial, { id: 'tag-2', name: 'Focus', color: '#0000ff' })).toEqual([
      { id: 'tag-1', name: 'Health', color: '#00ff00' },
      { id: 'tag-2', name: 'Focus', color: '#0000ff' },
    ])
    expect(updateTagInList(initial, 'tag-1', { name: 'Fitness' })).toEqual([
      { id: 'tag-1', name: 'Fitness', color: '#00ff00' },
    ])
    expect(removeTagFromList(initial, 'tag-1')).toEqual([])
  })

  it('maps tag references across nested habits', () => {
    const habits = [
      makeHabit({
        id: 'parent',
        children: [makeChild({ id: 'child' })],
      }),
    ]

    const next = mapHabitTagReferences(habits, (tags) =>
      tags.map((tag) => (tag.id === 'tag-1' ? { ...tag, name: 'Fitness' } : tag)),
    )

    expect(next?.[0]?.tags[0]?.name).toBe('Fitness')
    expect(next?.[0]?.children[0]?.tags[0]?.name).toBe('Fitness')
  })

  it('sets habit tags on both parent and nested child nodes', () => {
    const habits = [
      makeHabit({
        id: 'parent',
        children: [makeChild({ id: 'child' })],
      }),
    ]
    const nextTags = [{ id: 'tag-2', name: 'Focus', color: '#0000ff' }]

    expect(setHabitTags(habits, 'parent', nextTags)?.[0]?.tags).toEqual(nextTags)
    expect(setHabitTags(habits, 'child', nextTags)?.[0]?.children[0]?.tags).toEqual(nextTags)
  })

  it('resolves selected tag ids into habit tag objects', () => {
    expect(
      resolveHabitTags(
        [
          { id: 'tag-1', name: 'Health', color: '#00ff00' },
          { id: 'tag-2', name: 'Focus', color: '#0000ff' },
        ],
        ['tag-2', 'missing', 'tag-1'],
      ),
    ).toEqual([
      { id: 'tag-2', name: 'Focus', color: '#0000ff' },
      { id: 'tag-1', name: 'Health', color: '#00ff00' },
    ])
  })
})

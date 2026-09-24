import { describe, expect, it, vi } from 'vitest'
import type { HabitDetail, HabitDetailChild, NormalizedHabit } from '../types/habit'
import { createMockHabit } from './factories'
import {
  getVisibleDrillChildren,
  loadDrillChildren,
  mergeDrillChildrenMap,
  normalizeDrillDetailChild,
  normalizeHabitDetailForDrill,
} from '../utils/drill-navigation'

function makeDetailChild(overrides: Partial<HabitDetailChild> = {}): HabitDetailChild {
  return {
    id: overrides.id ?? 'child-1',
    title: overrides.title ?? 'Child habit',
    description: overrides.description ?? null,
    emoji: overrides.emoji ?? null,
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
    isOverdue: overrides.isOverdue,
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

  it('carries the child emoji through so sub-habit rows render the icon, not a letter', () => {
    const child = makeDetailChild({ id: 'child-1', title: 'Floss', emoji: '🦷' })

    const normalized = normalizeDrillDetailChild(child, 'parent-1', '2025-01-02')

    expect(normalized.emoji).toBe('🦷')
  })

  it('maps a missing child emoji to null', () => {
    const child = makeDetailChild({ id: 'child-1', emoji: null })

    const normalized = normalizeDrillDetailChild(child, 'parent-1', '2025-01-02')

    expect(normalized.emoji).toBeNull()
  })

  it('preserves emoji on nested drill children', () => {
    const detail = makeDetail({
      id: 'parent-1',
      children: [makeDetailChild({ id: 'child-1', emoji: '📚' })],
    })

    const normalized = normalizeHabitDetailForDrill(detail, '2025-01-02')

    expect(normalized.childrenByParent.get('parent-1')?.[0]?.emoji).toBe('📚')
  })

  it('prefers API child overdue state when present', () => {
    const child = makeDetailChild({
      dueDate: '2025-01-10',
      isOverdue: true,
    })

    const normalized = normalizeDrillDetailChild(child, 'parent-1', '2025-01-02')

    expect(normalized.isOverdue).toBe(true)
  })

  it('is not overdue via the shared fallback when the due date is in the future', () => {
    const child = makeDetailChild({ dueDate: '2025-01-10' })

    const normalized = normalizeDrillDetailChild(child, 'parent-1', '2025-01-02')

    expect(normalized.isOverdue).toBe(false)
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

describe('loadDrillChildren', () => {
  it('fetches through the injected fetcher and normalizes the detail', async () => {
    const detail = makeDetail({
      id: 'parent-1',
      children: [makeDetailChild({ id: 'child-1' })],
    })
    const fetchHabitDetail = vi.fn().mockResolvedValue(detail)

    const normalized = await loadDrillChildren('parent-1', fetchHabitDetail)

    expect(fetchHabitDetail).toHaveBeenCalledWith('parent-1')
    expect(normalized.parent.id).toBe('parent-1')
    expect(normalized.childrenByParent.get('parent-1')?.map((habit) => habit.id)).toEqual([
      'child-1',
    ])
  })

  it('propagates fetcher failures', async () => {
    const fetchHabitDetail = vi.fn().mockRejectedValue(new Error('fetch failed'))

    await expect(loadDrillChildren('parent-1', fetchHabitDetail)).rejects.toThrow(
      'fetch failed',
    )
  })
})

describe('mergeDrillChildrenMap', () => {
  it('overwrites fetched parents and keeps untouched entries', () => {
    const previousChild = createMockHabit({ id: 'old-child' })
    const keptChild = createMockHabit({ id: 'kept-child' })
    const fetchedChild = createMockHabit({ id: 'new-child' })
    const previous = new Map<string, NormalizedHabit[]>([
      ['parent-1', [previousChild]],
      ['parent-2', [keptChild]],
    ])
    const fetched = new Map<string, NormalizedHabit[]>([['parent-1', [fetchedChild]]])

    const merged = mergeDrillChildrenMap(previous, fetched)

    expect(merged.get('parent-1')).toEqual([fetchedChild])
    expect(merged.get('parent-2')).toEqual([keptChild])
    expect(merged).not.toBe(previous)
    expect(previous.get('parent-1')).toEqual([previousChild])
  })
})

describe('getVisibleDrillChildren', () => {
  it('keeps fresh detail fields while using list date and search metadata', () => {
    const selectedDate = '2025-01-02'
    const detail = normalizeHabitDetailForDrill(makeDetail({ children: [
      makeDetailChild({
        id: 'child-1', title: 'New title', dueDate: '2025-01-10',
        isCompleted: true,
      }),
    ] }), selectedDate)
    const staleListChild = createMockHabit({
      id: 'child-1', parentId: 'parent-1', title: 'Old title',
      dueDate: '2025-01-01', isCompleted: false,
      scheduledDates: [selectedDate], isLoggedInRange: true,
      instances: [{ date: selectedDate, status: 'Completed', logId: 'log-1' }],
      searchMatches: [{ field: 'title', value: 'Old title' }],
    })
    const options = {
      habitsById: new Map([[staleListChild.id, staleListChild]]),
      childrenByParent: new Map([['parent-1', [staleListChild.id]]]),
      selectedDate, searchQuery: 'old', showCompleted: true,
      recentlyCompletedIds: new Set<string>(),
    }

    const [visibleChild] = getVisibleDrillChildren(
      'parent-1', detail.childrenByParent, options, 'today', selectedDate,
    )
    expect(visibleChild).toMatchObject({
      title: 'New title', dueDate: '2025-01-10', isCompleted: true,
      scheduledDates: [selectedDate], isLoggedInRange: true,
      instances: staleListChild.instances, searchMatches: staleListChild.searchMatches,
    })
    expect(getVisibleDrillChildren('parent-1', detail.childrenByParent, {
      ...options, searchQuery: '', showCompleted: false,
    }, 'all', selectedDate)).toEqual([])
  })

  it('ignores current-day overdue on a detail-only child for an earlier selected date', () => {
    const detail = normalizeHabitDetailForDrill(makeDetail({ children: [
      makeDetailChild({ id: 'overdue-child', dueDate: '2025-01-02', isOverdue: true }),
    ] }), '2025-01-03')
    const options = {
      habitsById: new Map<string, NormalizedHabit>(),
      childrenByParent: new Map<string, string[]>(),
      selectedDate: '2025-01-01', searchQuery: '', showCompleted: false,
      recentlyCompletedIds: new Set<string>(),
    }

    expect(getVisibleDrillChildren('parent-1', detail.childrenByParent, options, 'today', '2025-01-03')).toEqual([])
    expect(getVisibleDrillChildren('parent-1', detail.childrenByParent, {
      ...options, selectedDate: '2025-01-03',
    }, 'today', '2025-01-03').map((child) => child.id)).toEqual(['overdue-child'])
    const listChild = createMockHabit({
      id: 'overdue-child', parentId: 'parent-1', dueDate: '2025-01-02',
      isOverdue: true,
    })
    expect(getVisibleDrillChildren('parent-1', detail.childrenByParent, {
      ...options, habitsById: new Map([[listChild.id, listChild]]),
    }, 'today', '2025-01-03').map((child) => child.id)).toEqual(['overdue-child'])
  })

  it('uses the dated list completion for general children on a past selected date', () => {
    const selectedDate = '2025-01-01'
    const today = '2025-01-03'
    const detail = normalizeHabitDetailForDrill(makeDetail({ children: [
      makeDetailChild({ id: 'done-then', isGeneral: true, isCompleted: false }),
      makeDetailChild({ id: 'done-today', isGeneral: true, isCompleted: true }),
    ] }), today)
    const doneThen = createMockHabit({
      id: 'done-then', parentId: 'parent-1', isGeneral: true, isCompleted: true,
    })
    const doneToday = createMockHabit({
      id: 'done-today', parentId: 'parent-1', isGeneral: true, isCompleted: false,
    })
    const options = {
      habitsById: new Map([[doneThen.id, doneThen], [doneToday.id, doneToday]]),
      childrenByParent: new Map([['parent-1', [doneThen.id, doneToday.id]]]),
      selectedDate, searchQuery: '', showCompleted: false,
      recentlyCompletedIds: new Set<string>(),
    }

    for (const view of ['today', 'general'] as const) {
      expect(getVisibleDrillChildren('parent-1', detail.childrenByParent, options, view, today)
        .map((child) => child.id)).toEqual(['done-today'])
    }
  })

  it('uses list completion data for one-time and recurring children on the selected date', () => {
    const date = '2025-01-02'
    const detail = normalizeHabitDetailForDrill(makeDetail({ children: [
      makeDetailChild({ id: 'one-time', isCompleted: true, dueDate: date }),
      makeDetailChild({ id: 'recurring', frequencyUnit: 'Day', isCompleted: true, dueDate: date }),
    ] }), date)
    const oneTime = createMockHabit({
      id: 'one-time', parentId: 'parent-1', frequencyUnit: null,
      isCompleted: true, isLoggedInRange: true, scheduledDates: [date],
    })
    const recurring = createMockHabit({
      id: 'recurring', parentId: 'parent-1', frequencyUnit: 'Day',
      isCompleted: false, isLoggedInRange: true, scheduledDates: [date],
      instances: [{ date, status: 'Completed', logId: 'log-1' }],
    })
    const options = {
      habitsById: new Map([['one-time', oneTime], ['recurring', recurring]]),
      childrenByParent: new Map([['parent-1', ['one-time', 'recurring']]]),
      selectedDate: date, searchQuery: '', showCompleted: false,
      recentlyCompletedIds: new Set<string>(),
    }

    expect(getVisibleDrillChildren('parent-1', detail.childrenByParent, options, 'today', date)).toEqual([])
    expect(getVisibleDrillChildren('parent-1', detail.childrenByParent, {
      ...options, showCompleted: true,
    }, 'today', date).map((child) => child.id)).toEqual(['one-time', 'recurring'])
    expect(getVisibleDrillChildren('parent-1', detail.childrenByParent, {
      ...options, recentlyCompletedIds: new Set(['recurring']),
    }, 'today', date).map((child) => child.id)).toEqual(['recurring'])
  })

  it('applies search and the selected date to fetched drill rows', () => {
    const date = '2025-01-02'
    const child = createMockHabit({
      id: 'recurring', parentId: 'parent-1', frequencyUnit: 'Day',
      isCompleted: false, isLoggedInRange: false, scheduledDates: [date],
      instances: [{ date, status: 'Completed', logId: 'log-1' }],
      searchMatches: [{ field: 'title', value: 'Recurring' }],
    })
    const detail = normalizeHabitDetailForDrill(makeDetail({ children: [
      makeDetailChild({ id: child.id, frequencyUnit: 'Day' }),
    ] }), date)
    const options = {
      habitsById: new Map([[child.id, child]]),
      childrenByParent: new Map([['parent-1', [child.id]]]),
      selectedDate: date, searchQuery: 'recurring', showCompleted: true,
      recentlyCompletedIds: new Set<string>(),
    }
    expect(getVisibleDrillChildren('parent-1', detail.childrenByParent, options, 'today', date)).toHaveLength(1)
    expect(getVisibleDrillChildren('parent-1', detail.childrenByParent, {
      ...options, selectedDate: '2025-01-03',
    }, 'today', date)).toEqual([])
    expect(getVisibleDrillChildren('parent-1', detail.childrenByParent, {
      ...options, searchQuery: 'missing',
      habitsById: new Map([[child.id, { ...child, searchMatches: null }]]),
    }, 'today', date)).toEqual([])
  })
})

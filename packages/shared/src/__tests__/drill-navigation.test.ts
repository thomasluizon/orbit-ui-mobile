import { describe, expect, it, vi } from 'vitest'
import { habitDetailSchema, type HabitDetail, type HabitDetailChild, type NormalizedHabit } from '../types/habit'
import { createMockHabit } from './factories'
import {
  addRecentCompletion,
  canRevealCompletedDrillChildren,
  countCompletedDrillChildren,
  getDrillParent,
  getRecentlyCompletedIdsForDate,
  getVisibleDrillChildren,
  loadDrillChildren,
  mergeDrillChildrenMap,
  normalizeDrillDetailChild,
  normalizeHabitDetailForDrill,
  removeRecentCompletion,
} from '../utils/drill-navigation'

function makeDetailChild(overrides: Partial<HabitDetailChild> = {}): HabitDetailChild {
  return {
    id: overrides.id ?? 'child-1',
    title: overrides.title ?? 'Child habit',
    description: overrides.description ?? null,
    emoji: overrides.emoji ?? null,
    frequencyUnit: overrides.frequencyUnit ?? null,
    frequencyQuantity: overrides.frequencyQuantity ?? null,
    intervalWeeks: 'intervalWeeks' in overrides ? overrides.intervalWeeks : null,
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
    intervalWeeks: 'intervalWeeks' in overrides ? overrides.intervalWeeks : null,
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
  it.each([
    { startDate: '2026-08-28', schedule: 'Recurring' },
    {},
  ])('preserves API creation fields through drill loading: %j', async (fields) => {
    const detail = habitDetailSchema.parse({
      ...makeDetail(),
      ...fields,
      children: [{
        ...makeDetailChild(),
        ...fields,
        children: [{ ...makeDetailChild({ id: 'grand-1' }), ...fields }],
      }],
    })

    const normalized = await loadDrillChildren('parent-1', async () => detail, '2026-08-29')

    for (const habit of [
      normalized.parent,
      normalized.childrenByParent.get('parent-1')?.[0],
      normalized.childrenByParent.get('child-1')?.[0],
    ]) {
      expect(habit).toBeDefined()
      expect(habit?.startDate).toBe(detail.startDate)
      expect(habit?.schedule).toBe(detail.schedule)
    }
  })

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
    expect(normalized.position).toBeNull()
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

  it.each([null, 2] as const)('preserves detail intervalWeeks %s without a schedule fallback', (intervalWeeks) => {
    const detail = makeDetail({
      intervalWeeks,
      children: [makeDetailChild({ intervalWeeks })],
    })

    const normalized = normalizeHabitDetailForDrill(detail, '2025-01-02')

    expect(normalized.parent.intervalWeeks).toBe(intervalWeeks)
    expect(normalized.childrenByParent.get('parent-1')?.[0]?.intervalWeeks).toBe(intervalWeeks)
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

describe('getVisibleDrillChildren', () => {
  it('keeps unpositioned children after the person ordered children', () => {
    const date = '2025-01-02'
    const detail = normalizeHabitDetailForDrill(makeDetail({ children: [
      makeDetailChild({ id: 'ordered', position: 1 }),
      makeDetailChild({ id: 'unpositioned', position: null }),
    ] }), date)
    const options = {
      habitsById: new Map<string, NormalizedHabit>(), childrenByParent: new Map<string, string[]>(),
      selectedDate: date, searchQuery: '', showCompleted: false, recentlyCompletedIds: new Set<string>(),
    }
    expect(getVisibleDrillChildren('parent-1', detail.childrenByParent, options, date)
      .map((child) => child.id)).toEqual(['ordered', 'unpositioned'])
  })

  it.each(['today', 'all', 'general'] as const)('lists all dates and undated children in person order from %s', () => {
    const date = '2025-01-02'
    const detail = normalizeHabitDetailForDrill(makeDetail({ children: [
      makeDetailChild({ id: 'future', dueDate: '2025-02-01', position: 2 }),
      makeDetailChild({ id: 'undated', isGeneral: true, position: 1 }),
      makeDetailChild({ id: 'recurring', frequencyUnit: 'Day', isCompleted: true, position: 3 }),
      makeDetailChild({ id: 'done-once', isCompleted: true, position: 0 }),
    ] }), date)
    const options = {
      habitsById: new Map<string, NormalizedHabit>(), childrenByParent: new Map<string, string[]>(),
      selectedDate: date, searchQuery: 'parent only', showCompleted: false,
      recentlyCompletedIds: new Set(['done-once']),
    }
    expect(getVisibleDrillChildren('parent-1', detail.childrenByParent, options, date)
      .map((child) => child.id)).toEqual(['undated', 'future', 'recurring'])
    expect(getVisibleDrillChildren('parent-1', detail.childrenByParent, { ...options, showCompleted: true }, date)
      .map((child) => child.id)).toEqual(['done-once', 'undated', 'future', 'recurring'])
  })

  it('normalizes every supplied nested level', () => {
    const detail = normalizeHabitDetailForDrill(makeDetail({ children: [makeDetailChild({
      id: 'first', children: [makeDetailChild({ id: 'second', children: [makeDetailChild({ id: 'third' })] })],
    })] }), '2025-01-02')
    expect(detail.childrenByParent.get('second')?.map((child) => child.id)).toEqual(['third'])
  })

  it('keeps each date marker until its own feedback timer expires', () => {
    const onA = addRecentCompletion(new Map(), 'child', '2025-01-01')
    const onBoth = addRecentCompletion(onA, 'child', '2025-01-02')

    expect(getRecentlyCompletedIdsForDate(onBoth, '2025-01-01').has('child')).toBe(true)
    expect(getRecentlyCompletedIdsForDate(onBoth, '2025-01-02').has('child')).toBe(true)
    const afterAExpires = removeRecentCompletion(onBoth, 'child', '2025-01-01')
    expect(getRecentlyCompletedIdsForDate(afterAExpires, '2025-01-01').has('child')).toBe(false)
    expect(getRecentlyCompletedIdsForDate(afterAExpires, '2025-01-02').has('child')).toBe(true)
  })

  it.each(['today', 'general'] as const)('filters a completed general child in %s', () => {
    const date = '2025-01-02'
    const detail = normalizeHabitDetailForDrill(makeDetail({ children: [
      makeDetailChild({ id: 'general-child', isGeneral: true, isCompleted: true }),
    ] }), date)
    const listChild = createMockHabit({
      id: 'general-child', parentId: 'parent-1', isGeneral: true, isCompleted: true,
    })
    const options = {
      habitsById: new Map([[listChild.id, listChild]]),
      childrenByParent: new Map([['parent-1', [listChild.id]]]),
      selectedDate: date, searchQuery: '', showCompleted: false,
      recentlyCompletedIds: new Set<string>(),
    }

    expect(getVisibleDrillChildren('parent-1', detail.childrenByParent, options, date)).toEqual([])
    expect(getVisibleDrillChildren('parent-1', detail.childrenByParent, {
      ...options, showCompleted: true,
    }, date).map((child) => child.id)).toEqual(['general-child'])
  })

  it.each(['today', 'general'] as const)('uses dated list completion when general child detail disagrees in %s', () => {
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

    expect(getVisibleDrillChildren('parent-1', detail.childrenByParent, options, today)
      .map((child) => child.id)).toEqual(['done-today'])
    expect(getVisibleDrillChildren('parent-1', detail.childrenByParent, {
      ...options, showCompleted: true,
    }, today).map((child) => [child.id, child.isCompleted])).toEqual([
      ['done-then', true], ['done-today', false],
    ])
  })

  it('does not infer selected-day completion for a detail-only one-time child', () => {
    const date = '2025-01-02'
    const detail = normalizeHabitDetailForDrill(makeDetail({ children: [
      makeDetailChild({ id: 'detail-only', isCompleted: true, dueDate: '2025-01-01', isOverdue: false }),
    ] }), date)
    const options = {
      habitsById: new Map<string, NormalizedHabit>(),
      childrenByParent: new Map<string, string[]>(),
      selectedDate: date, searchQuery: '', showCompleted: false,
      recentlyCompletedIds: new Set<string>(),
    }

    expect(getVisibleDrillChildren('parent-1', detail.childrenByParent, options, date)).toEqual([])
    expect(canRevealCompletedDrillChildren('parent-1', detail.childrenByParent, options, date)).toBe(true)
    const revealed = getVisibleDrillChildren('parent-1', detail.childrenByParent, {
      ...options, showCompleted: true,
    }, date)
    expect(revealed.map((child) => child.id)).toEqual(['detail-only'])
    expect(countCompletedDrillChildren(revealed, date)).toBe(0)
  })

  it('does not count a one-time container completed on another date when its child is active', () => {
    const selectedDate = '2025-01-02'
    const detail = normalizeHabitDetailForDrill(makeDetail({ children: [
      makeDetailChild({
        id: 'container', isCompleted: true, dueDate: '2025-01-01',
        children: [makeDetailChild({ id: 'active', dueDate: selectedDate })],
      }),
    ] }), selectedDate)
    const container = createMockHabit({
      id: 'container', parentId: 'parent-1', isCompleted: true,
      dueDate: '2025-01-01', scheduledDates: [], isLoggedInRange: false,
    })
    const active = createMockHabit({
      id: 'active', parentId: 'container', dueDate: selectedDate,
      scheduledDates: [selectedDate], isCompleted: false,
    })
    const options = {
      habitsById: new Map([[container.id, container], [active.id, active]]),
      childrenByParent: new Map([['parent-1', [container.id]], [container.id, [active.id]]]),
      selectedDate, searchQuery: '', showCompleted: false,
      recentlyCompletedIds: new Set<string>(),
    }

    const visible = getVisibleDrillChildren('parent-1', detail.childrenByParent, { ...options, showCompleted: true }, selectedDate)
    expect(visible.map((child) => child.id)).toEqual(['container'])
    expect(countCompletedDrillChildren(visible, selectedDate)).toBe(0)
    const recentCompletionDates = new Map([['container', new Set([selectedDate])]])
    expect(countCompletedDrillChildren(visible, selectedDate, recentCompletionDates)).toBe(1)
    expect(countCompletedDrillChildren(visible, '2025-01-03', recentCompletionDates)).toBe(0)
  })

  it('reveals a completed detail-only child before its due date when requested', () => {
    const today = '2025-01-03'
    const selectedDate = '2025-01-01'
    const detail = normalizeHabitDetailForDrill(makeDetail({ children: [
      makeDetailChild({ id: 'completed-later', isCompleted: true, dueDate: today }),
    ] }), today)
    const options = {
      habitsById: new Map<string, NormalizedHabit>(),
      childrenByParent: new Map<string, string[]>(),
      selectedDate, searchQuery: '', showCompleted: true,
      recentlyCompletedIds: new Set<string>(),
    }

    expect(getVisibleDrillChildren('parent-1', detail.childrenByParent, options, today).map((child) => child.id)).toEqual(['completed-later'])
  })

  it('does not infer completion on a past date after a detail-only child was due', () => {
    const today = '2025-01-03'
    const detail = normalizeHabitDetailForDrill(makeDetail({ children: [
      makeDetailChild({ id: 'completed-later', isCompleted: true, dueDate: '2025-01-01' }),
    ] }), today)
    const options = {
      habitsById: new Map<string, NormalizedHabit>(),
      childrenByParent: new Map<string, string[]>(),
      selectedDate: '2025-01-02', searchQuery: '', showCompleted: true,
      recentlyCompletedIds: new Set<string>(),
    }

    expect(getVisibleDrillChildren('parent-1', detail.childrenByParent, options, today).map((child) => child.id)).toEqual(['completed-later'])
  })

  it('hides completed one-time children and keeps logged recurring children', () => {
    const date = '2025-01-02'
    const detail = normalizeHabitDetailForDrill(makeDetail({ children: [
      makeDetailChild({ id: 'one-time', isCompleted: true, dueDate: date }),
      makeDetailChild({ id: 'recurring', frequencyUnit: 'Day', dueDate: date }),
    ] }), date)
    const oneTime = createMockHabit({
      id: 'one-time', parentId: 'parent-1', isCompleted: true,
      scheduledDates: [date], isLoggedInRange: true,
    })
    const recurring = createMockHabit({
      id: 'recurring', parentId: 'parent-1', frequencyUnit: 'Day',
      scheduledDates: [date], isLoggedInRange: true,
      instances: [{ date, status: 'Completed', logId: 'log-1' }],
    })
    const options = {
      habitsById: new Map([[oneTime.id, oneTime], [recurring.id, recurring]]),
      childrenByParent: new Map([['parent-1', [oneTime.id, recurring.id]]]),
      selectedDate: date, searchQuery: '', showCompleted: false,
      recentlyCompletedIds: new Set<string>(),
    }

    expect(getVisibleDrillChildren('parent-1', detail.childrenByParent, options, date).map((child) => child.id)).toEqual(['recurring'])
    expect(getVisibleDrillChildren('parent-1', detail.childrenByParent, {
      ...options, showCompleted: true,
    }, date).map((child) => child.id)).toEqual(['one-time', 'recurring'])
    expect(getVisibleDrillChildren('parent-1', detail.childrenByParent, {
      ...options, recentlyCompletedIds: new Set(['recurring']),
    }, date).map((child) => child.id)).toEqual(['recurring'])
  })

  it('uses search matches and selected-date logs from the list', () => {
    const date = '2025-01-02'
    const listChild = createMockHabit({
      id: 'recurring', parentId: 'parent-1', frequencyUnit: 'Day',
      dueDate: '2025-01-10', scheduledDates: [date],
      isLoggedInRange: true,
      instances: [{ date, status: 'Completed', logId: 'log-1' }],
      searchMatches: [{ field: 'title', value: 'Recurring' }],
    })
    const detail = normalizeHabitDetailForDrill(makeDetail({ children: [
      makeDetailChild({ id: listChild.id, frequencyUnit: 'Day', dueDate: '2025-01-10' }),
    ] }), date)
    const options = {
      habitsById: new Map([[listChild.id, listChild]]),
      childrenByParent: new Map([['parent-1', [listChild.id]]]),
      selectedDate: date, searchQuery: 'recurring', showCompleted: true,
      recentlyCompletedIds: new Set<string>(),
    }

    expect(getVisibleDrillChildren('parent-1', detail.childrenByParent, options, date)).toHaveLength(1)
    expect(getVisibleDrillChildren('parent-1', detail.childrenByParent, {
      ...options, searchQuery: 'missing',
      habitsById: new Map([[listChild.id, { ...listChild, searchMatches: null }]]),
    }, date)).toHaveLength(1)
    expect(getVisibleDrillChildren('parent-1', detail.childrenByParent, {
      ...options, selectedDate: '2025-01-03',
      habitsById: new Map([[listChild.id, { ...listChild, isLoggedInRange: false, instances: [] }]]),
    }, date)).toHaveLength(1)
  })

  it('keeps fresh detail fields and rejects current-day overdue on a past date', () => {
    const today = '2025-01-03'
    const selectedDate = '2025-01-01'
    const detail = normalizeHabitDetailForDrill(makeDetail({ children: [
      makeDetailChild({ id: 'child-1', title: 'New title', dueDate: '2025-01-02', isOverdue: true }),
    ] }), today)
    const options = {
      habitsById: new Map<string, NormalizedHabit>(),
      childrenByParent: new Map<string, string[]>(),
      selectedDate, searchQuery: '', showCompleted: false,
      recentlyCompletedIds: new Set<string>(),
    }
    expect(getVisibleDrillChildren('parent-1', detail.childrenByParent, options, today).map((child) => child.title)).toEqual(['New title'])
    expect(getVisibleDrillChildren('parent-1', detail.childrenByParent, {
      ...options, selectedDate: today,
    }, today).map((child) => child.title)).toEqual(['New title'])

    const listChild = createMockHabit({
      id: 'child-1', parentId: 'parent-1', title: 'Old title',
      dueDate: selectedDate, scheduledDates: [selectedDate], isOverdue: false,
    })
    const [visibleChild] = getVisibleDrillChildren('parent-1', detail.childrenByParent, {
      ...options, habitsById: new Map([[listChild.id, listChild]]),
    }, today)
    expect(visibleChild).toMatchObject({
      title: 'New title', dueDate: '2025-01-02', scheduledDates: [selectedDate],
    })
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

describe('getDrillParent', () => {
  const listed = createMockHabit({ id: 'listed', title: 'Listed parent' })
  const fetched = createMockHabit({ id: 'fetched', title: 'Fetched parent' })
  const nested = createMockHabit({ id: 'nested', title: 'Nested child', parentId: 'fetched' })
  const habitsById = new Map([[listed.id, listed]])
  const fetchedParents = new Map([[fetched.id, fetched]])
  const drillChildrenMap = new Map<string, NormalizedHabit[]>([[fetched.id, [nested]]])

  it('returns null at the drill root', () => {
    expect(getDrillParent(null, habitsById, fetchedParents, drillChildrenMap)).toBeNull()
  })

  it('prefers the list habit, then the fetched parent', () => {
    expect(getDrillParent('listed', habitsById, fetchedParents, drillChildrenMap)).toBe(listed)
    expect(getDrillParent('fetched', habitsById, fetchedParents, drillChildrenMap)).toBe(fetched)
  })

  it('finds a parent that exists only among fetched drill children', () => {
    expect(getDrillParent('nested', habitsById, fetchedParents, drillChildrenMap)).toBe(nested)
  })

  it('returns null for an unknown parent', () => {
    expect(getDrillParent('missing', habitsById, fetchedParents, drillChildrenMap)).toBeNull()
  })
})

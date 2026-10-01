import { describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/query-core'
import { createMockHabit, createMockHabitScheduleItem, createMockHabitScheduleChild } from './factories'
import { habitKeys, type HabitListSnapshots } from '../query/keys'
import {
  applyCachedHabitSkip,
  checkTodayAllDoneOrDefer,
  clearCachedOptimisticSkip,
  deduplicateHabitList,
  getTodayHabitList,
  getTodayHabitListAfterRefetch,
  invalidateHabitDependents,
  restoreCachedHabitLists,
  restoreCachedHabitSkip,
  updateCachedHabitLists,
  updateHabitListsForDate,
} from '../query/habit-cache'
import { buildOptimisticSkipPatch, optimisticPatchHabit, optimisticRemoveHabits, optimisticSkipMarker } from '../utils/habit-optimistic'
import type { HabitScheduleItem } from '../types/habit'

describe('skip undo cache', () => {
  it('retains a refetched completion and a subsequent direct rollback when the row later disappears', () => {
    const client = new QueryClient()
    const key = habitKeys.list({})
    const date = '2026-09-12'
    const laterDate = '2026-09-13'
    const row = createMockHabitScheduleItem({ dueDate: date, scheduledDates: [date, laterDate],
      instances: [date, laterDate].map((instanceDate) => ({ date: instanceDate, status: 'Pending', logId: null })) })
    client.setQueryData(key, [row])
    const snapshot = client.getQueriesData<HabitScheduleItem[]>({ queryKey: habitKeys.lists() })
    applyCachedHabitSkip(client, row.id, date)
    const refreshed = { ...row, title: 'Edited after skip', scheduledDates: [laterDate],
      isLoggedInRange: true, instances: [{ date: laterDate, status: 'Completed' as const, logId: 'later-log' }] }
    client.setQueryData(key, [refreshed])
    client.setQueryData(key, [])
    restoreCachedHabitSkip(client, snapshot, row.id, { date, postponed: false })
    expect(client.getQueryData<HabitScheduleItem[]>(key)?.[0]).toMatchObject({
      title: refreshed.title, isLoggedInRange: true,
      instances: [row.instances[0], ...refreshed.instances],
    })
    const secondSnapshot = client.getQueriesData<HabitScheduleItem[]>({ queryKey: habitKeys.lists() })
    applyCachedHabitSkip(client, row.id, date)
    const rolledBack = { ...refreshed, isLoggedInRange: false, instances: [{ date: laterDate, status: 'Pending' as const, logId: null }] }
    client.setQueryData(key, [rolledBack])
    client.setQueryData(key, [])
    restoreCachedHabitSkip(client, secondSnapshot, row.id, { date, postponed: false })
    expect(client.getQueryData<HabitScheduleItem[]>(key)?.[0]).toMatchObject({
      title: refreshed.title, isLoggedInRange: false,
      instances: [row.instances[0], ...rolledBack.instances],
    })
  })

  it.each([false, true])('reverses a postpone preserving a later log %s', (logged) => {
    const client = new QueryClient()
    const key = habitKeys.list({})
    const date = '2026-09-12'
    const tomorrow = '2026-09-13'
    const row = createMockHabitScheduleItem({ frequencyUnit: null, dueDate: date, scheduledDates: [date],
      instances: [{ date, status: 'Pending', logId: null }] })
    client.setQueryData(key, [row])
    const snapshot = client.getQueriesData<HabitScheduleItem[]>({ queryKey: habitKeys.lists() })
    updateCachedHabitLists(client, (items) => optimisticPatchHabit(items, row.id, buildOptimisticSkipPatch(items[0]!, date)))
    if (logged) updateCachedHabitLists(client, (items) => optimisticPatchHabit(items, row.id, {
      isCompleted: true, isLoggedInRange: true, instances: [{ date: tomorrow, status: 'Completed', logId: 'later-log' }],
    }))

    restoreCachedHabitSkip(client, snapshot, row.id, { date, postponed: true })

    expect(client.getQueryData<HabitScheduleItem[]>(key)?.[0]).toMatchObject({
      dueDate: date, scheduledDates: logged ? [date, tomorrow] : [date],
      isCompleted: logged, isLoggedInRange: logged,
      instances: logged ? [...row.instances, { date: tomorrow, status: 'Completed', logId: 'later-log' }] : row.instances,
    })
  })

  it('leaves flexible totals in lists outside the skipped date unchanged', () => {
    const client = new QueryClient()
    const date = '2026-09-12'
    const otherDate = '2026-09-13'
    const key = habitKeys.list({ dateFrom: otherDate, dateTo: otherDate })
    const row = createMockHabitScheduleItem({ isFlexible: true, flexibleTarget: 2, flexibleCompleted: 0 })
    client.setQueryData(key, [row])
    restoreCachedHabitSkip(client, [[key, [row]]], row.id, { date, postponed: false })
    expect(client.getQueryData(key)).toEqual([row])
  })

  it.each([false, true])('restores offline flexible targets one occurrence at a time after a refetch removes the row %s', (removed) => {
    const client = new QueryClient()
    const key = habitKeys.list({})
    const dates = ['2026-09-12', '2026-09-13']
    const row = createMockHabitScheduleItem({ isFlexible: true, flexibleTarget: 2, flexibleCompleted: 0,
      dueDate: dates[0], scheduledDates: dates })
    client.setQueryData(key, [row])
    const snapshots = dates.map((date) => {
      const snapshot = client.getQueriesData<HabitScheduleItem[]>({ queryKey: habitKeys.lists() })
      applyCachedHabitSkip(client, row.id, date)
      return snapshot
    })
    expect(client.getQueryData<HabitScheduleItem[]>(key)?.[0]?.flexibleTarget).toBe(0)
    if (removed) client.setQueryData(key, [])
    dates.forEach((date, index) => {
      restoreCachedHabitSkip(client, snapshots[index]!, row.id, { date, postponed: false })
      expect(client.getQueryData<HabitScheduleItem[]>(key)?.[0]?.flexibleTarget).toBe(index + 1)
    })
  })

  it.each([false, true])('reverses two offline skips independently with reverse undo order %s', (reverse) => {
    const client = new QueryClient()
    const key = habitKeys.list({})
    const firstDate = '2026-09-12'
    const secondDate = '2026-09-13'
    const row = createMockHabitScheduleItem({ dueDate: firstDate, scheduledDates: [firstDate, secondDate],
      instances: [firstDate, secondDate].map((date) => ({ date, status: 'Pending', logId: null })) })
    client.setQueryData(key, [row])
    const skip = (date: string) => {
      const snapshot = client.getQueriesData<HabitScheduleItem[]>({ queryKey: habitKeys.lists() })
      updateCachedHabitLists(client, (items) => optimisticPatchHabit(items, row.id, buildOptimisticSkipPatch(items[0]!, date)))
      clearCachedOptimisticSkip(client, row.id, date)
      return { snapshot, date }
    }
    const first = skip(firstDate)
    const second = skip(secondDate)
    const [earlierUndo, laterUndo] = reverse ? [second, first] : [first, second]

    restoreCachedHabitSkip(client, earlierUndo.snapshot, row.id, { date: earlierUndo.date, postponed: false })
    expect(client.getQueryData<HabitScheduleItem[]>(key)?.[0]).toMatchObject({
      scheduledDates: [earlierUndo.date],
      instances: [{ date: earlierUndo.date, status: 'Pending', logId: null }],
    })
    restoreCachedHabitSkip(client, laterUndo.snapshot, row.id, { date: laterUndo.date, postponed: false })
    expect(client.getQueryData<HabitScheduleItem[]>(key)?.[0]).toMatchObject({
      scheduledDates: [firstDate, secondDate], instances: row.instances, dueDate: firstDate,
    })
  })

  it.each([0, 1])('restores a flexible target on an existing refetched row preserving %s completions', (completed) => {
    const client = new QueryClient()
    const key = habitKeys.list({})
    const date = '2026-09-12'
    const row = createMockHabitScheduleItem({ isFlexible: true, flexibleTarget: 2, flexibleCompleted: 0,
      dueDate: date, scheduledDates: [date], instances: [{ date, status: 'Pending', logId: null }] })
    const snapshot: HabitListSnapshots = [[key, [row]]]
    client.setQueryData(key, [{ ...row, ...buildOptimisticSkipPatch(row, date),
      flexibleCompleted: completed, isLoggedInRange: completed > 0 }])

    restoreCachedHabitSkip(client, snapshot, row.id, { date, postponed: false })

    expect(client.getQueryData<HabitScheduleItem[]>(key)?.[0]).toMatchObject({
      flexibleTarget: 2, flexibleCompleted: completed, isLoggedInRange: completed > 0,
    })
  })

  it.each([
    { removed: false, restoredIn: 'scheduledDates' },
    { removed: false, restoredIn: 'instances' },
    { removed: true, restoredIn: 'scheduledDates' },
    { removed: true, restoredIn: 'instances' },
  ])('keeps a restored flexible target from $restoredIn after row removal $removed', ({ removed, restoredIn }) => {
    const client = new QueryClient()
    const key = habitKeys.list({})
    const date = '2026-09-12'
    const row = createMockHabitScheduleItem({ isFlexible: true, flexibleTarget: 2, flexibleCompleted: 0,
      dueDate: date, scheduledDates: [date], instances: [{ date, status: 'Pending', logId: null }] })
    client.setQueryData(key, [row])
    const snapshot = client.getQueriesData<HabitScheduleItem[]>({ queryKey: habitKeys.lists() })
    applyCachedHabitSkip(client, row.id, date)
    client.setQueryData(key, [{ ...row, flexibleCompleted: 1, isLoggedInRange: true,
      scheduledDates: restoredIn === 'scheduledDates' ? row.scheduledDates : [],
      instances: restoredIn === 'instances' ? row.instances : [] }])
    if (removed) client.setQueryData(key, [])
    for (let restoration = 0; restoration < 2; restoration++) {
      restoreCachedHabitSkip(client, snapshot, row.id, { date, postponed: false })
      expect(client.getQueryData<HabitScheduleItem[]>(key)?.[0]).toMatchObject({
        flexibleTarget: 2, flexibleCompleted: 1, isLoggedInRange: true,
        scheduledDates: [date], instances: row.instances,
      })
    }
    client.clear()
  })

  it('restores only the skipped schedule while keeping sibling and child changes', () => {
    const client = new QueryClient()
    const key = habitKeys.list({})
    const row = createMockHabitScheduleItem({ id: 'skipped', scheduledDates: ['2026-09-12'], children: [createMockHabitScheduleChild({ id: 'child' })] })
    const sibling = createMockHabitScheduleItem({ id: 'sibling' })
    const snapshot: HabitListSnapshots = [[key, [row, sibling]]]
    client.setQueryData(key, [{ ...row, title: 'Edited title', scheduledDates: [], children: [{ ...row.children[0], title: 'Edited child' }] }, { ...sibling, isCompleted: true }])
    restoreCachedHabitSkip(client, snapshot, row.id, { date: '2026-09-12', postponed: false })
    expect(client.getQueryData<HabitScheduleItem[]>(key)).toMatchObject([
      { title: 'Edited title', scheduledDates: ['2026-09-12'], children: [{ title: 'Edited child' }] },
      { id: sibling.id, isCompleted: true },
    ])
  })

  it('reinserts the skipped child after a refetch removed it without restoring another deleted row', () => {
    const client = new QueryClient()
    const key = habitKeys.list({ completeDay: true, dateFrom: '2026-09-12', dateTo: '2026-09-12' })
    const child = createMockHabitScheduleChild({ id: 'skipped' })
    const sibling = createMockHabitScheduleChild({ id: 'sibling' })
    const parent = createMockHabitScheduleItem({ id: 'parent', hasSubHabits: true, children: [child, sibling] })
    const deleted = createMockHabitScheduleItem({ id: 'deleted' })
    const countKey = habitKeys.listTotalCount({ dateFrom: '2026-09-12', dateTo: '2026-09-12' })
    client.setQueryData(countKey, 1)
    client.setQueryData(key, optimisticRemoveHabits([{ ...parent, title: 'Edited parent', children: [sibling] }], [sibling.id]))
    restoreCachedHabitSkip(client, [[key, [parent, deleted]]], child.id, { date: '2026-09-12', postponed: false })
    expect(client.getQueryData<HabitScheduleItem[]>(key)).toEqual([{ ...parent, title: 'Edited parent', children: [child] }])
    expect(client.getQueryData(countKey)).toBe(1)
    client.setQueryData(key, [])
    client.setQueryData(countKey, 0)
    restoreCachedHabitSkip(client, [[key, [parent, deleted]]], child.id, { date: '2026-09-12', postponed: false })
    expect(client.getQueryData<HabitScheduleItem[]>(key)).toEqual([{ ...parent, children: [child] }])
    expect(client.getQueryData(countKey)).toBe(1)
  })
})

describe('habit list cache targeting', () => {
  it('changes only lists containing the affected date', () => {
    const queryClient = new QueryClient()
    const todayKey = habitKeys.list({ dateFrom: '2025-01-02', dateTo: '2025-01-02' })
    const yesterdayKey = habitKeys.list({ dateFrom: '2025-01-01', dateTo: '2025-01-01' })
    const allKey = habitKeys.list({})
    const habit: HabitScheduleItem = { ...createMockHabit(), children: [], linkedGoals: [] }
    for (const key of [todayKey, yesterdayKey, allKey]) queryClient.setQueryData(key, [habit])

    updateHabitListsForDate(queryClient, '2025-01-02', (items) =>
      items.map((item) => ({ ...item, isCompleted: true })))

    expect(queryClient.getQueryData<HabitScheduleItem[]>(todayKey)?.[0]?.isCompleted).toBe(true)
    expect(queryClient.getQueryData<HabitScheduleItem[]>(allKey)?.[0]?.isCompleted).toBe(true)
    expect(queryClient.getQueryData<HabitScheduleItem[]>(yesterdayKey)?.[0]?.isCompleted).toBe(false)
  })

  it('leaves a list with no data untouched', () => {
    const queryClient = new QueryClient()
    const emptyKey = habitKeys.list({ dateFrom: '2025-01-02', dateTo: '2025-01-02' })
    queryClient.setQueryData(emptyKey, undefined)
    const updater = vi.fn((items: HabitScheduleItem[]) => items)

    updateHabitListsForDate(queryClient, '2025-01-02', updater)

    expect(updater).not.toHaveBeenCalled()
  })

  it('keeps undated lists unchanged for an explicit-date completion', () => {
    const queryClient = new QueryClient()
    const datedKey = habitKeys.list({ dateFrom: '2025-01-02', dateTo: '2025-01-02' })
    const allKey = habitKeys.list({})
    const habit: HabitScheduleItem = { ...createMockHabit(), children: [], linkedGoals: [] }
    queryClient.setQueryData(datedKey, [habit])
    queryClient.setQueryData(allKey, [habit])

    updateHabitListsForDate(queryClient, '2025-01-02',
      (items) => items.map((item) => ({ ...item, isCompleted: true })),
      { includeUnfiltered: false })

    expect(queryClient.getQueryData<HabitScheduleItem[]>(datedKey)?.[0]?.isCompleted).toBe(true)
    expect(queryClient.getQueryData<HabitScheduleItem[]>(allKey)?.[0]?.isCompleted).toBe(false)
  })
})

describe('habit mutation settlement', () => {
  it('refetches every list and the habit dependents, but not the habit count', () => {
    const queryClient = new QueryClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    invalidateHabitDependents(queryClient, 'habit-1')

    for (const queryKey of [
      habitKeys.lists(),
      habitKeys.detail('habit-1'),
      habitKeys.fullDetail('habit-1'),
      habitKeys.logs('habit-1'),
      habitKeys.metrics('habit-1'),
      habitKeys.calendarPrefix(),
      habitKeys.summaryPrefix(),
    ]) expect(invalidate).toHaveBeenCalledWith({ queryKey })
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: habitKeys.count() })
  })
})

describe('optimisticRemoveHabits', () => {
  it('removes selected top-level habits and nested children, keeping the rest', () => {
    const grandchild = { ...createMockHabit({ id: 'grandchild' }), children: [] }
    const child = { ...createMockHabit({ id: 'child' }), children: [grandchild] }
    const keptChild = { ...createMockHabit({ id: 'kept-child' }), children: [] }
    const parent: HabitScheduleItem = { ...createMockHabit({ id: 'parent' }), children: [child, keptChild], linkedGoals: [] } as HabitScheduleItem
    const removed: HabitScheduleItem = { ...createMockHabit({ id: 'removed' }), children: [], linkedGoals: [] }

    const result = optimisticRemoveHabits([parent, removed], ['removed', 'grandchild', 'kept-child'])

    expect(result.map((item) => item.id)).toEqual(['parent'])
    expect(result[0]?.children.map((item) => item.id)).toEqual(['child'])
    expect(result[0]?.children[0]?.children).toEqual([])
  })
})

describe('getTodayHabitList', () => {
  const today = '2025-01-02'
  const todayFilters = { dateFrom: today, dateTo: today, includeOverdue: true, pageSize: 2 }
  const completeFilters = { ...todayFilters, completeDay: true }
  const scheduled = (id: string): HabitScheduleItem => ({ ...createMockHabit({ id }), children: [], linkedGoals: [] })

  it('returns the Today list once every scheduled habit is loaded', () => {
    const queryClient = new QueryClient()
    const items = [scheduled('a'), { ...scheduled('general'), isGeneral: true }, scheduled('b')]
    queryClient.setQueryData(habitKeys.list(completeFilters), items)
    queryClient.setQueryData(habitKeys.listTotalCount(todayFilters), 2)

    expect(getTodayHabitList(queryClient, today)).toBe(items)
  })

  it('uses the base count for a complete-day query key', () => {
    const queryClient = new QueryClient()
    const items = [scheduled('a'), scheduled('b'), scheduled('c')]
    queryClient.setQueryData(habitKeys.list(completeFilters), items)
    queryClient.setQueryData(habitKeys.listTotalCount(todayFilters), 3)

    expect(getTodayHabitList(queryClient, today)).toBe(items)
  })

  it('refuses a Today list that holds only the first page', () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(habitKeys.list(completeFilters), [scheduled('a'), scheduled('b')])
    queryClient.setQueryData(habitKeys.listTotalCount(todayFilters), 5)

    expect(getTodayHabitList(queryClient, today)).toBeUndefined()
  })

  it('treats a list without a total count as complete only below the page size', () => {
    const shortClient = new QueryClient()
    shortClient.setQueryData(habitKeys.list(completeFilters), [scheduled('a')])
    const fullPageClient = new QueryClient()
    fullPageClient.setQueryData(habitKeys.list(completeFilters), [scheduled('a'), scheduled('b')])

    expect(getTodayHabitList(shortClient, today)?.map((item) => item.id)).toEqual(['a'])
    expect(getTodayHabitList(fullPageClient, today)).toBeUndefined()
  })

  it('rejects an ordinary short day list because only complete-day queries load every page', () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(habitKeys.list(todayFilters), [scheduled('a')])

    expect(getTodayHabitList(queryClient, today)).toBeUndefined()
  })

  it('ignores filtered, other-day and overdue-free lists', () => {
    const queryClient = new QueryClient()
    for (const filters of [
      { ...completeFilters, search: 'run' },
      { ...completeFilters, tagIds: ['tag-1'] },
      { ...completeFilters, dateFrom: '2025-01-01', dateTo: '2025-01-01' },
      { ...completeFilters, includeOverdue: false },
      { ...completeFilters, isCompleted: false },
    ]) queryClient.setQueryData(habitKeys.list(filters), [scheduled('a')])

    expect(getTodayHabitList(queryClient, today)).toBeUndefined()
  })

  it('keeps a dated list complete through removal, insertion and rollback', () => {
    const queryClient = new QueryClient()
    const key = habitKeys.list(completeFilters)
    const countKey = habitKeys.listTotalCount(todayFilters)
    const original = [scheduled('a'), scheduled('b')]
    queryClient.setQueryData(key, original)
    queryClient.setQueryData(countKey, 2)

    updateHabitListsForDate(queryClient, today, (items) => optimisticRemoveHabits(items, ['a']))
    expect(queryClient.getQueryData(countKey)).toBe(1)
    expect(getTodayHabitList(queryClient, today)?.map((item) => item.id)).toEqual(['b'])

    updateHabitListsForDate(queryClient, today, () => original)
    expect(queryClient.getQueryData(countKey)).toBe(2)

    updateHabitListsForDate(queryClient, today, (items) => [...items, scheduled('c')])
    expect(queryClient.getQueryData(countKey)).toBe(3)
    expect(getTodayHabitList(queryClient, today)?.map((item) => item.id)).toEqual(['a', 'b', 'c'])
  })

  it('does not use a stale complete list when the retry refetch fails', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const key = habitKeys.list(completeFilters)
    let fetches = 0
    await queryClient.fetchQuery({ queryKey: key, queryFn: async () => {
      fetches += 1
      if (fetches > 1) throw new Error('Refetch failed')
      return [scheduled('a')]
    } })
    queryClient.setQueryData(habitKeys.listTotalCount(todayFilters), 1)

    expect(await getTodayHabitListAfterRefetch(queryClient, today)).toBeUndefined()
    expect(fetches).toBe(2)
  })

  it('replaces a Today fetch that began before the log settled', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const key = habitKeys.list(completeFilters)
    let resolvePreLogFetch: ((items: HabitScheduleItem[]) => void) | undefined
    let fetches = 0
    await queryClient.fetchQuery({ queryKey: key, queryFn: () => {
      fetches += 1
      if (fetches === 2) return new Promise<HabitScheduleItem[]>((resolve) => { resolvePreLogFetch = resolve })
      return Promise.resolve([{ ...scheduled('a'), isCompleted: fetches > 2 }])
    } })
    queryClient.setQueryData(habitKeys.listTotalCount(todayFilters), 1)
    void queryClient.refetchQueries({ queryKey: key })

    const afterLog = getTodayHabitListAfterRefetch(queryClient, today)
    resolvePreLogFetch?.([scheduled('a')])

    expect((await afterLog)?.map((item) => item.isCompleted)).toEqual([true])
    expect(fetches).toBe(3)
  })

  it('keeps every cached list and its count in step with an optimistic change and its rollback', () => {
    const queryClient = new QueryClient()
    const key = habitKeys.list(completeFilters)
    const countKey = habitKeys.listTotalCount(todayFilters)
    const allKey = habitKeys.list({})
    const original = [scheduled('a'), scheduled('b')]
    queryClient.setQueryData(key, original)
    queryClient.setQueryData(countKey, 2)
    queryClient.setQueryData(allKey, original)
    queryClient.setQueryData(habitKeys.list({ search: 'empty' }), undefined)
    const snapshots = queryClient.getQueriesData<HabitScheduleItem[]>({ queryKey: habitKeys.lists() })

    updateCachedHabitLists(queryClient, (items) => optimisticRemoveHabits(items, ['a']))
    expect(queryClient.getQueryData<HabitScheduleItem[]>(allKey)?.map((item) => item.id)).toEqual(['b'])
    expect(queryClient.getQueryData(countKey)).toBe(1)

    queryClient.removeQueries({ queryKey: allKey, exact: true })
    restoreCachedHabitLists(queryClient, snapshots)
    expect(queryClient.getQueryData(key)).toEqual(original)
    expect(queryClient.getQueryData(allKey)).toEqual(original)
    expect(queryClient.getQueryData(countKey)).toBe(2)
  })

  it('checks the complete Today list at once and defers otherwise', async () => {
    const check = vi.fn()
    const queryClient = new QueryClient()
    const items = [{ ...scheduled('a'), isCompleted: true }]

    expect(checkTodayAllDoneOrDefer(queryClient, today, '2025-01-01', false, check)).toBe(false)
    expect(checkTodayAllDoneOrDefer(queryClient, today, undefined, true, check)).toBe(true)
    expect(checkTodayAllDoneOrDefer(queryClient, today, today, false, check)).toBe(true)
    expect(check).not.toHaveBeenCalled()

    queryClient.setQueryData(habitKeys.list(completeFilters), items)
    queryClient.setQueryData(habitKeys.listTotalCount(todayFilters), 1)
    let finishFetch: ((value: HabitScheduleItem[]) => void) | undefined
    const inFlight = queryClient.fetchQuery({
      queryKey: habitKeys.list(completeFilters),
      queryFn: () => new Promise<HabitScheduleItem[]>((resolve) => { finishFetch = resolve }),
      staleTime: 0,
    })
    expect(checkTodayAllDoneOrDefer(queryClient, today, today, false, check)).toBe(true)
    finishFetch?.(items)
    await inFlight

    expect(checkTodayAllDoneOrDefer(queryClient, today, today, false, check)).toBe(false)
    expect(check).toHaveBeenCalledTimes(1)
    expect(check.mock.calls[0]?.[2]).toBe(today)
    expect([...check.mock.calls[0]?.[0].keys()]).toEqual(['a'])
  })
})

describe('deduplicateHabitList', () => {
  it('keeps one row per habit, at its first position, with the latest page data', () => {
    const first = { ...createMockHabit({ id: 'a', title: 'Old' }), children: [], linkedGoals: [] }
    const other = { ...createMockHabit({ id: 'b' }), children: [], linkedGoals: [] }
    const latest = { ...first, title: 'New' }

    const result = deduplicateHabitList([first, other, latest])

    expect(result.map((item) => [item.id, item.title])).toEqual([['a', 'New'], ['b', 'Exercise']])
  })
})

describe('clearCachedOptimisticSkip', () => {
  const marked = (id: string, date: string, children: HabitScheduleItem[] = []): HabitScheduleItem => ({
    ...createMockHabit({ id }), children, linkedGoals: [], [optimisticSkipMarker]: date,
  } as HabitScheduleItem)

  it('clears the settled marker from every cached list, nested rows included, and keeps other dates and lists', () => {
    const queryClient = new QueryClient()
    const completeKey = habitKeys.list({ dateFrom: '2025-01-02', dateTo: '2025-01-02', completeDay: true })
    const ordinaryKey = habitKeys.list({ dateFrom: '2025-01-02', dateTo: '2025-01-02' })
    const otherDateKey = habitKeys.list({ dateFrom: '2025-01-03', dateTo: '2025-01-03' })
    const emptyKey = habitKeys.list({})
    const countKey = habitKeys.listTotalCount({ dateFrom: '2025-01-02', dateTo: '2025-01-02' })
    const child = marked('child', '2025-01-02')
    queryClient.setQueryData(completeKey, [marked('skipped', '2025-01-02'), marked('parent', '2025-01-01', [child])])
    queryClient.setQueryData(ordinaryKey, [marked('skipped', '2025-01-02')])
    const untouched = [marked('skipped', '2025-01-03')]
    queryClient.setQueryData(otherDateKey, untouched)
    queryClient.setQueryData(emptyKey, undefined)
    queryClient.setQueryData(countKey, 2)

    clearCachedOptimisticSkip(queryClient, 'skipped', '2025-01-02')
    clearCachedOptimisticSkip(queryClient, 'child', '2025-01-02')

    const complete = queryClient.getQueryData<HabitScheduleItem[]>(completeKey)
    expect(complete?.[0]).not.toHaveProperty(optimisticSkipMarker)
    expect(complete?.[1]?.children[0]).not.toHaveProperty(optimisticSkipMarker)
    expect(complete?.[1]).toHaveProperty(optimisticSkipMarker, '2025-01-01')
    expect(queryClient.getQueryData<HabitScheduleItem[]>(ordinaryKey)?.[0]).not.toHaveProperty(optimisticSkipMarker)
    expect(queryClient.getQueryData<HabitScheduleItem[]>(otherDateKey)).toBe(untouched)
    expect(queryClient.getQueryData(emptyKey)).toBeUndefined()
    expect(queryClient.getQueryData<number>(countKey)).toBe(2)
  })
})

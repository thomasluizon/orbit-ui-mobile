import { describe, expect, it } from 'vitest'
import { QueryClient, QueryObserver } from '@tanstack/query-core'
import { createMockHabitScheduleChild, createMockHabitScheduleItem } from './factories'
import { habitDetailSchema } from '../types/habit'
import { cachedHabitDeletionIds, isCachedHabitDeleted, removeDeletedHabitQueries, restoreDeletedHabitQueries } from '../query/habit-deletion'
import { habitKeys } from '../query/keys'

const metrics = { currentStreak: 0, longestStreak: 0, weeklyCompletionRate: 0, monthlyCompletionRate: 0, totalCompletions: 0, lastCompletedDate: null }

describe('habit deletion cache lifecycle', () => {
  it('removes cascaded habits from every inventory and resource cache while retaining other habits', async () => {
    const client = new QueryClient()
    const child = createMockHabitScheduleChild({ id: 'child' })
    const habit = createMockHabitScheduleItem({ id: 'deleted', children: [child] })
    const kept = createMockHabitScheduleItem({ id: 'kept' })
    const detail = habitDetailSchema.parse(habit)
    const listKey = habitKeys.list({})
    const searchKey = habitKeys.search({ search: 'read', page: 1 })
    const calendarKey = habitKeys.calendar('2026-09-01', '2026-09-30')
    client.setQueryData(listKey, [habit, kept])
    client.setQueryData(searchKey, { items: [habit, kept], page: 1, pageSize: 20, totalCount: 2, totalPages: 1 })
    client.setQueryData(calendarKey, { habits: [habit, kept], logs: { deleted: [], child: [], kept: [] } })
    client.setQueryData(habitKeys.detail('parent'), habitDetailSchema.parse({ ...kept, id: 'parent', children: [child] }))
    client.setQueryData(habitKeys.fullDetail('parent'), { habit: habitDetailSchema.parse({ ...kept, id: 'parent', children: [child] }), metrics, logs: [] })
    for (const id of ['deleted', 'child', 'kept']) {
      client.setQueryData(habitKeys.detail(id), { ...detail, id })
      client.setQueryData(habitKeys.fullDetail(id), { habit: { ...detail, id }, metrics, logs: [] })
      client.setQueryData(habitKeys.metrics(id), metrics)
      client.setQueryData(habitKeys.logs(id), [])
      client.setQueryData(habitKeys.rescheduleSuggestion(id), { date: null })
    }
    await removeDeletedHabitQueries(client, habit.id)
    expect(client.getQueryData(listKey)).toEqual([kept])
    expect(client.getQueryData(searchKey)).toMatchObject({ items: [kept], totalCount: 1 })
    expect(client.getQueryData(calendarKey)).toEqual({ habits: [kept], logs: { kept: [] } })
    expect(client.getQueryData(habitKeys.detail('parent'))).toMatchObject({ children: [] })
    expect(client.getQueryData(habitKeys.fullDetail('parent'))).toMatchObject({ habit: { children: [] } })
    for (const id of ['deleted', 'child']) {
      expect(isCachedHabitDeleted(client, id)).toBe(true)
      for (const key of [habitKeys.detail(id), habitKeys.fullDetail(id), habitKeys.logs(id), habitKeys.metrics(id), habitKeys.rescheduleSuggestion(id)]) {
        expect(client.getQueryData(key)).toBeUndefined()
      }
    }
    expect(isCachedHabitDeleted(client, 'kept')).toBe(false)
    expect(client.getQueryData(habitKeys.detail('kept'))).toBeDefined()
    client.clear()
  })

  it('cancels the underlying active request before invalidation can refetch it', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    let requestSignal: AbortSignal | undefined
    const observer = new QueryObserver(client, {
      queryKey: habitKeys.detail('deleted'),
      queryFn: ({ signal }) => { requestSignal = signal; return new Promise<never>(() => {}) },
    })
    const unsubscribe = observer.subscribe(() => {})
    await removeDeletedHabitQueries(client, 'deleted')
    expect(requestSignal?.aborted).toBe(true)
    expect(client.getQueryState(habitKeys.detail('deleted'))).toBeUndefined()
    unsubscribe()
    client.clear()
  })

  it('clears descendant markers for Undo even when a selection also deleted the child', async () => {
    const client = new QueryClient()
    const habit = createMockHabitScheduleItem({ id: 'parent', children: [createMockHabitScheduleChild({ id: 'child' })] })
    const deletedIds = cachedHabitDeletionIds(client, ['parent'], [habit])
    await removeDeletedHabitQueries(client, 'parent', deletedIds)
    await removeDeletedHabitQueries(client, 'child')
    restoreDeletedHabitQueries(client, 'parent')
    expect(isCachedHabitDeleted(client, 'parent')).toBe(false)
    expect(isCachedHabitDeleted(client, 'child')).toBe(false)
    client.clear()
  })

  it('keeps another client deletion unmarked and clears account markers with the cache', async () => {
    const client = new QueryClient()
    await removeDeletedHabitQueries(client, 'local')
    expect(isCachedHabitDeleted(client, 'remote')).toBe(false)
    client.clear()
    expect(isCachedHabitDeleted(client, 'local')).toBe(false)
  })
})

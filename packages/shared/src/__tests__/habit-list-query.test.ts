import { CancelledError, QueryClient, QueryObserver } from '@tanstack/query-core'
import { afterEach, describe, expect, it } from 'vitest'
import { habitListQueryOptions } from '../query/habit-list'
import { habitKeys } from '../query/keys'
import type { HabitsFilter, HabitScheduleItem, PaginatedResponse } from '../types/habit'
import { createMockHabitScheduleItem } from './factories'

const clients: QueryClient[] = []
const day = { dateFrom: '2026-09-12', dateTo: '2026-09-12' }

function createClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  clients.push(client)
  return client
}

function page(items: HabitScheduleItem[], current = 1, totalPages = 1): PaginatedResponse<HabitScheduleItem> {
  return { items, page: current, pageSize: 2, totalPages, totalCount: totalPages * 2 }
}

afterEach(() => { clients.splice(0).forEach(client => client.clear()) })

describe('habit list requests', () => {
  it.each([true, false])('loads complete inventories with completeDay=%s and deduplicates every page', async completeDay => {
    const client = createClient()
    const filters: HabitsFilter[] = []
    const item = createMockHabitScheduleItem({ id: 'first' })
    const result = await client.fetchQuery(habitListQueryOptions({}, { completeDay }, client, {
      getAccountGeneration: () => 0,
      readPage: async request => {
        filters.push(request)
        return page(request.page === 2 ? [item, createMockHabitScheduleItem({ id: 'second' })] : [item], request.page ?? 1, 2)
      },
    }))
    expect(result.map(habit => habit.id)).toEqual(['first', 'second'])
    expect(filters).toEqual([{ pageSize: 200 }, { pageSize: 200, page: 2 }])
    expect(client.getQueryData(habitKeys.listTotalCount({}))).toBe(4)
    expect(client.getQueryCache().hasListeners()).toBe(false)
  })

  it.each([true, false])('respects day pagination with completeDay=%s', async completeDay => {
    const client = createClient()
    const requested: HabitsFilter[] = []
    const result = await client.fetchQuery(habitListQueryOptions(day, { completeDay }, client, {
      getAccountGeneration: () => 0,
      readPage: async filters => {
        requested.push(filters)
        return page([createMockHabitScheduleItem({ id: `page-${filters.page ?? 1}` })], filters.page ?? 1, 2)
      },
    }))
    expect(result.map(habit => habit.id)).toEqual(completeDay ? ['page-1', 'page-2'] : ['page-1'])
    expect(requested).toEqual(completeDay ? [day, { ...day, page: 2 }] : [day])
  })

  it('preserves explicit page sizes and merges the selected schedule into inventory rows', async () => {
    const client = createClient()
    const requested: HabitsFilter[] = []
    const item = createMockHabitScheduleItem({ isCompleted: false })
    const filters = { pageSize: 25 }
    const result = await client.fetchQuery(habitListQueryOptions(filters, { scheduleDate: day.dateFrom }, client, {
      getAccountGeneration: () => 0,
      readPage: async request => {
        requested.push(request)
        return page([{ ...item, isCompleted: !!request.dateFrom }])
      },
    }))
    expect(result[0]?.isCompleted).toBe(true)
    expect(requested).toEqual([filters, { ...day, page: 1, pageSize: 200, includeOverdue: true }])
    expect(client.getQueryData(habitKeys.list({ ...filters, scheduleDate: day.dateFrom }))).toEqual(result)
  })

  it('rejects a page captured under a previous account without publishing rows or totals', async () => {
    const client = createClient()
    let generation = 0
    const request = client.fetchQuery(habitListQueryOptions(day, {}, client, {
      getAccountGeneration: () => generation,
      readPage: async () => { generation++; return page([createMockHabitScheduleItem()]) },
    }))
    await expect(request).rejects.toBeInstanceOf(CancelledError)
    expect(client.getQueryData(habitKeys.list(day))).toBeUndefined()
    expect(client.getQueryData(habitKeys.listTotalCount(day))).toBeUndefined()
    expect(client.getQueryCache().hasListeners()).toBe(false)
  })

  it('propagates a failed page and releases its invalidation listener', async () => {
    const client = createClient()
    const failure = new Error('page unavailable')
    await expect(client.fetchQuery(habitListQueryOptions(day, {}, client, {
      getAccountGeneration: () => 0,
      readPage: async () => { throw failure },
    }))).rejects.toBe(failure)
    expect(client.getQueryData(habitKeys.listTotalCount(day))).toBeUndefined()
    expect(client.getQueryCache().hasListeners()).toBe(false)
  })

  it.each([true, false])('keeps an invalidated inactive snapshot stale with cached rows=%s', async cached => {
    const client = createClient()
    const key = habitKeys.list(day)
    if (cached) client.setQueryData(key, [])
    let release!: (result: PaginatedResponse<HabitScheduleItem>) => void
    const options = habitListQueryOptions(day, {}, client, {
      getAccountGeneration: () => 0,
      readPage: () => new Promise(resolve => { release = resolve }),
    })
    const pending = client.fetchQuery({ ...options, staleTime: 0 })
    const settled = pending.catch(error => error)
    await client.invalidateQueries({ queryKey: habitKeys.lists() })
    release(page([createMockHabitScheduleItem({ id: 'obsolete' })]))
    await settled
    expect(client.getQueryState(key)?.isInvalidated).toBe(true)
    expect(client.getQueryData(key)).toEqual(cached ? [] : undefined)
    expect(client.getQueryData(habitKeys.listTotalCount(day))).toBeUndefined()
    const fresh = await client.fetchQuery({ ...options, queryFn: async () => [createMockHabitScheduleItem({ id: 'fresh' })] })
    expect(fresh.map(habit => habit.id)).toEqual(['fresh'])
    expect(client.getQueryCache().hasListeners()).toBe(false)
  })

  it('restarts an active request without cached rows on each invalidation', async () => {
    const client = createClient()
    const releases: ((result: PaginatedResponse<HabitScheduleItem>) => void)[] = []
    const options = habitListQueryOptions(day, {}, client, {
      getAccountGeneration: () => 0,
      readPage: () => new Promise(resolve => { releases.push(resolve) }),
    })
    const observer = new QueryObserver(client, options)
    const unsubscribe = observer.subscribe(() => {})
    expect(releases).toHaveLength(1)
    const firstInvalidation = client.invalidateQueries({ queryKey: habitKeys.all })
    expect(releases).toHaveLength(2)
    const secondInvalidation = client.invalidateQueries({ queryKey: habitKeys.all })
    expect(releases).toHaveLength(3)
    releases[0]!(page([createMockHabitScheduleItem({ id: 'obsolete' })]))
    releases[1]!(page([createMockHabitScheduleItem({ id: 'also-obsolete' })]))
    releases[2]!(page([createMockHabitScheduleItem({ id: 'newest' })]))
    await Promise.all([firstInvalidation, secondInvalidation])
    expect(observer.getCurrentResult().data?.map(habit => habit.id)).toEqual(['newest'])
    unsubscribe()
    expect(client.getQueryCache().hasListeners()).toBe(false)
  })

  it('does not publish an old total when invalidation lands between page resolution and list assembly', async () => {
    const client = createClient()
    const pending = client.fetchQuery(habitListQueryOptions(day, {}, client, {
      getAccountGeneration: () => 0,
      readPage: async () => {
        queueMicrotask(() => queueMicrotask(() => { void client.invalidateQueries({ queryKey: habitKeys.lists() }) }))
        return page([createMockHabitScheduleItem({ id: 'obsolete' })])
      },
    })).catch(error => error)
    await pending
    expect(client.getQueryData(habitKeys.listTotalCount(day))).toBeUndefined()
    expect(client.getQueryData(habitKeys.list(day))).toBeUndefined()
  })
})

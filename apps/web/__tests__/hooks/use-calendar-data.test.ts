import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useCalendarData, useCalendarRangeChunked } from '@/hooks/use-calendar-data'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

describe('useCalendarData', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('fetches calendar data and builds dayMap', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          habits: [
            {
              id: 'h-1',
              title: 'Exercise',
              isBadHabit: false,
              dueTime: '09:00',
              frequencyUnit: 'Day',
              frequencyQuantity: 1,
              scheduledDates: ['2025-01-15', '2025-01-16'],
              instances: null,
              isCompleted: false,
              isGeneral: false,
              isFlexible: false,
              days: [],
              dueDate: '2025-01-15',
              dueEndTime: null,
              endDate: null,
              position: 0,
              checklistItems: [],
              createdAtUtc: '2025-01-01T00:00:00Z',
              isOverdue: false,
              reminderEnabled: false,
              reminderTimes: [],
              scheduledReminders: [],
              slipAlertEnabled: false,
              tags: [],
              children: [],
              hasSubHabits: false,
              description: null,
              flexibleTarget: null,
              flexibleCompleted: null,
            },
          ],
          logs: {
            'h-1': [{ id: 'log-1', date: '2025-01-15', value: 1, createdAtUtc: '2025-01-15T10:00:00Z' }],
          },
        }),
    })

    const currentMonth = new Date(2025, 0, 1)
    const { result } = renderHook(() => useCalendarData(currentMonth), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.dayMap.size).toBeGreaterThan(0)

    const jan15 = result.current.dayMap.get('2025-01-15')
    expect(jan15).toBeDefined()
    expect(jan15![0]!.status).toBe('completed')
    expect(jan15![0]!.habitId).toBe('h-1')
    expect(jan15![0]!.title).toBe('Exercise')
  })

  it('keeps only the requested month in the dayMap', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          habits: [
            {
              id: 'h-1',
              title: 'Exercise',
              isBadHabit: false,
              dueTime: null,
              frequencyUnit: 'Week',
              frequencyQuantity: 1,
              scheduledDates: ['2025-01-03'],
              instances: [
                { date: '2024-12-27', status: 'Overdue', logId: null },
                { date: '2025-01-03', status: 'Overdue', logId: null },
              ],
              isCompleted: false,
              isGeneral: false,
              isFlexible: false,
              days: [],
              dueDate: '2024-12-27',
              dueEndTime: null,
              endDate: null,
              position: 0,
              checklistItems: [],
              createdAtUtc: '2024-12-01T00:00:00Z',
              isOverdue: true,
              reminderEnabled: false,
              reminderTimes: [],
              scheduledReminders: [],
              slipAlertEnabled: false,
              tags: [],
              children: [],
              hasSubHabits: false,
              description: null,
              flexibleTarget: null,
              flexibleCompleted: null,
            },
          ],
          logs: { 'h-1': [] },
        }),
    })

    const { result } = renderHook(() => useCalendarData(new Date(2025, 0, 1)), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect([...result.current.dayMap.keys()]).toEqual(['2025-01-03'])
  })

  it('returns empty dayMap when no data', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ habits: [], logs: {} }),
    })

    const currentMonth = new Date(2025, 0, 1)
    const { result } = renderHook(() => useCalendarData(currentMonth), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.dayMap.size).toBe(0)
  })

  it('handles fetch error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Internal server error' }),
    })

    const currentMonth = new Date(2025, 0, 1)
    const { result } = renderHook(() => useCalendarData(currentMonth), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.error).toBeTruthy())
    expect(result.current.error).toContain('Internal server error')
  })

  it('marks unlogged past dates as missed', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          habits: [
            {
              id: 'h-1',
              title: 'Read',
              isBadHabit: false,
              dueTime: null,
              frequencyUnit: 'Day',
              frequencyQuantity: 1,
              scheduledDates: ['2020-06-15'],
              instances: null,
              isCompleted: false,
              isGeneral: false,
              isFlexible: false,
              days: [],
              dueDate: '2020-06-15',
              dueEndTime: null,
              endDate: null,
              position: 0,
              checklistItems: [],
              createdAtUtc: '2020-01-01T00:00:00Z',
              isOverdue: false,
              reminderEnabled: false,
              reminderTimes: [],
              scheduledReminders: [],
              slipAlertEnabled: false,
              tags: [],
              children: [],
              hasSubHabits: false,
              description: null,
              flexibleTarget: null,
              flexibleCompleted: null,
            },
          ],
          logs: {},
        }),
    })

    const currentMonth = new Date(2020, 5, 1)
    const { result } = renderHook(() => useCalendarData(currentMonth), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const jun15 = result.current.dayMap.get('2020-06-15')
    expect(jun15).toBeDefined()
    expect(jun15![0]!.status).toBe('missed')
  })

  it('detects one-time habits (no frequencyUnit)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          habits: [
            {
              id: 'h-one',
              title: 'One-time task',
              isBadHabit: false,
              dueTime: null,
              frequencyUnit: null,
              frequencyQuantity: null,
              scheduledDates: ['2020-03-10'],
              instances: null,
              isCompleted: false,
              isGeneral: false,
              isFlexible: false,
              days: [],
              dueDate: '2020-03-10',
              dueEndTime: null,
              endDate: null,
              position: 0,
              checklistItems: [],
              createdAtUtc: '2020-01-01T00:00:00Z',
              isOverdue: false,
              reminderEnabled: false,
              reminderTimes: [],
              scheduledReminders: [],
              slipAlertEnabled: false,
              tags: [],
              children: [],
              hasSubHabits: false,
              description: null,
              flexibleTarget: null,
              flexibleCompleted: null,
            },
          ],
          logs: {},
        }),
    })

    const currentMonth = new Date(2020, 2, 1)
    const { result } = renderHook(() => useCalendarData(currentMonth), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const entry = result.current.dayMap.get('2020-03-10')
    expect(entry).toBeDefined()
    expect(entry![0]!.isOneTime).toBe(true)
  })
})

describe('useCalendarRangeChunked', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  function habitScheduledOn(id: string, date: string) {
    return {
      id,
      title: 'Chunked',
      isBadHabit: false,
      dueTime: null,
      frequencyUnit: 'Day',
      frequencyQuantity: 1,
      scheduledDates: [date],
      instances: null,
      isCompleted: false,
      isGeneral: false,
      isFlexible: false,
      days: [],
      dueDate: date,
      dueEndTime: null,
      endDate: null,
      position: 0,
      checklistItems: [],
      createdAtUtc: '2025-01-01T00:00:00Z',
      isOverdue: false,
      reminderEnabled: false,
      reminderTimes: [],
      scheduledReminders: [],
      slipAlertEnabled: false,
      tags: [],
      children: [],
      hasSubHabits: false,
      description: null,
      flexibleTarget: null,
      flexibleCompleted: null,
    }
  }

  it('splits a beyond-cap range into chunked requests and merges the day maps', async () => {
    mockFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : String(input)
      const from = new URL(url, 'http://localhost').searchParams.get('dateFrom') ?? '2025-01-01'
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ habits: [habitScheduledOn('h-' + from, from)], logs: {} }),
      })
    })

    const { result } = renderHook(
      () => useCalendarRangeChunked(new Date(2025, 0, 1), new Date(2025, 5, 30)),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(mockFetch.mock.calls.length).toBeGreaterThan(1)
    for (const call of mockFetch.mock.calls) {
      const url = new URL(String(call[0]), 'http://localhost')
      const from = new Date(url.searchParams.get('dateFrom') + 'T00:00:00Z')
      const to = new Date(url.searchParams.get('dateTo') + 'T00:00:00Z')
      const diffDays = (to.getTime() - from.getTime()) / 86_400_000
      expect(diffDays).toBeLessThanOrEqual(62)
    }

    expect(result.current.dayMap.size).toBe(mockFetch.mock.calls.length)
    expect(result.current.error).toBeNull()
  })

  it('keeps a complete chunk day when the next chunk returns lookback instances for it', async () => {
    const chunkBoundary = '2025-03-04'
    const completeDay = {
      ...habitScheduledOn('h-complete', chunkBoundary),
      title: 'Complete',
    }
    const lookbackParent = {
      ...habitScheduledOn('h-lookback', '2025-03-05'),
      title: 'Lookback',
      dueDate: '2025-03-01',
      instances: [
        { date: '2025-03-01', status: 'Overdue', logId: null },
        { date: chunkBoundary, status: 'Overdue', logId: null },
        { date: '2025-03-05', status: 'Pending', logId: null },
      ],
      children: [
        {
          ...habitScheduledOn('h-lookback-child', '2025-03-05'),
          title: 'Lookback child',
          dueDate: '2025-03-01',
          isLoggedInRange: false,
          instances: [{ date: chunkBoundary, status: 'Completed', logId: 'lookback-log' }],
        },
      ],
      hasSubHabits: true,
    }
    mockFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : String(input)
      const from = new URL(url, 'http://localhost').searchParams.get('dateFrom')
      let body: unknown = { habits: [], logs: {} }
      if (from === '2025-01-01') {
        body = {
          habits: [completeDay],
          logs: {
            'h-complete': [
              { id: 'log-complete', date: chunkBoundary, value: 1, createdAtUtc: '2025-03-04T08:00:00Z' },
            ],
          },
        }
      } else if (from === '2025-03-05') {
        body = { habits: [lookbackParent], logs: { 'h-lookback': [] } }
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(body) })
    })

    const { result } = renderHook(
      () => useCalendarRangeChunked(new Date(2025, 0, 1), new Date(2025, 5, 30)),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.dayMap.get(chunkBoundary)).toEqual([
      {
        habitId: 'h-complete',
        title: 'Complete',
        status: 'completed',
        isBadHabit: false,
        dueTime: null,
        isOneTime: false,
      },
    ])
    expect(result.current.dayMap.has('2025-03-01')).toBe(false)
  })

  it('surfaces a chunk failure as the aggregate error', async () => {
    let callCount = 0
    mockFetch.mockImplementation(() => {
      callCount += 1
      if (callCount === 1) {
        return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ habits: [], logs: {} }) })
    })

    const { result } = renderHook(
      () => useCalendarRangeChunked(new Date(2025, 0, 1), new Date(2025, 5, 30)),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).not.toBeNull()
  })
})

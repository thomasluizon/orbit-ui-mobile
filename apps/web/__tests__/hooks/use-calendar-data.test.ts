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
      const url = String(input)
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

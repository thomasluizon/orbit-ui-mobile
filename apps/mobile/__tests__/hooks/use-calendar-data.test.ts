import reminderWire from '@orbit/shared/test-support/fixtures/habit-reminder-wire.json'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { habitKeys } from '@orbit/shared/query'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import type { CalendarMonthResponse } from '@orbit/shared/types/habit'

import { useCalendarData, useCalendarRange } from '@/hooks/use-calendar-data'

const TestRenderer = require('react-test-renderer')

interface CapturedQuery {
  queryKey: readonly unknown[]
  queryFn: () => unknown
}

const mocks = vi.hoisted(() => ({
  captured: [] as CapturedQuery[],
  apiClient: vi.fn(),
  useRealQueries: false,
  data: undefined as CalendarMonthResponse | undefined,
  isLoading: false,
  error: null as Error | null,
  useQuery: vi.fn((options: CapturedQuery) => {
    mocks.captured.push(options)
    return {
      data: mocks.data,
      isLoading: mocks.isLoading,
      isFetching: false,
      error: mocks.error,
      refetch: vi.fn(),
    }
  }),
}))

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  const client = new actual.QueryClient()
  return {
    ...actual,
    useQuery: (options: CapturedQuery) => mocks.useRealQueries ? actual.useQuery(options) : mocks.useQuery(options),
    useQueryClient: () => mocks.useRealQueries ? actual.useQueryClient() : client,
  }
})

vi.mock('@/lib/api-client', () => ({
  apiClient: (...args: unknown[]) => mocks.apiClient(...args),
}))

type CalendarDataResult = ReturnType<typeof useCalendarData>

function renderCalendarData(currentMonth: Date): CalendarDataResult {
  const capturedHolder: { current: CalendarDataResult | null } = { current: null }
  function Probe() {
    capturedHolder.current = useCalendarData(currentMonth)
    return null
  }
  TestRenderer.act(() => {
    TestRenderer.create(React.createElement(Probe))
  })
  if (!capturedHolder.current) throw new Error('hook did not render')
  return capturedHolder.current
}

function buildHabit(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  }
}

beforeEach(() => {
  mocks.captured = []
  mocks.apiClient.mockReset()
  mocks.useQuery.mockClear()
  mocks.data = undefined
  mocks.isLoading = false
  mocks.error = null
  mocks.useRealQueries = false
})

describe('useCalendarData (mobile)', () => {
  it('keys the query on the month range and fetches via apiClient', async () => {
    renderCalendarData(new Date(2025, 0, 1))

    const query = mocks.captured.at(-1)!
    expect(query.queryKey).toEqual(habitKeys.calendar('2025-01-01', '2025-01-31'))

    mocks.apiClient.mockResolvedValue({ habits: [], logs: {} })
    await query.queryFn()
    expect(mocks.apiClient).toHaveBeenCalledWith(
      expect.stringContaining('dateFrom=2025-01-01&dateTo=2025-01-31'),
    )
  })

  it('rejects a malformed calendar response at the query boundary', async () => {
    renderCalendarData(new Date(2025, 0, 1))
    mocks.apiClient.mockResolvedValue({})
    await expect(mocks.captured.at(-1)!.queryFn()).rejects.toMatchObject({ name: 'ZodError' })
  })

  it('builds a dayMap with completed status from logs', () => {
    mocks.data = {
      habits: [buildHabit()],
      logs: {
        'h-1': [
          { id: 'log-1', date: '2025-01-15', value: 1, createdAtUtc: '2025-01-15T10:00:00Z' },
        ],
      },
    } as unknown as CalendarMonthResponse

    const result = renderCalendarData(new Date(2025, 0, 1))

    expect(result.dayMap.size).toBeGreaterThan(0)
    const jan15 = result.dayMap.get('2025-01-15')
    expect(jan15).toBeDefined()
    expect(jan15![0]!.status).toBe('completed')
    expect(jan15![0]!.title).toBe('Exercise')
  })

  it('keeps only the requested month in the dayMap', () => {
    mocks.data = {
      habits: [
        buildHabit({
          dueTime: null,
          frequencyUnit: 'Week',
          scheduledDates: ['2025-01-03'],
          instances: [
            { date: '2024-12-27', status: 'Overdue', logId: null },
            { date: '2025-01-03', status: 'Overdue', logId: null },
          ],
          dueDate: '2024-12-27',
          createdAtUtc: '2024-12-01T00:00:00Z',
          isOverdue: true,
        }),
      ],
      logs: { 'h-1': [] },
    } as unknown as CalendarMonthResponse

    const result = renderCalendarData(new Date(2025, 0, 1))

    expect([...result.dayMap.keys()]).toEqual(['2025-01-03'])
  })

  it('returns an empty dayMap when there is no data', () => {
    mocks.data = undefined
    const result = renderCalendarData(new Date(2025, 0, 1))
    expect(result.dayMap.size).toBe(0)
  })

  it('surfaces the query error message', () => {
    mocks.error = new Error('Internal server error')
    const result = renderCalendarData(new Date(2025, 0, 1))
    expect(result.error).toBe('Internal server error')
  })

  it('marks unlogged past dates as missed', () => {
    mocks.data = {
      habits: [
        buildHabit({
          title: 'Read',
          dueTime: null,
          scheduledDates: ['2020-06-15'],
          dueDate: '2020-06-15',
          createdAtUtc: '2020-01-01T00:00:00Z',
        }),
      ],
      logs: {},
    } as unknown as CalendarMonthResponse

    const result = renderCalendarData(new Date(2020, 5, 1))

    const jun15 = result.dayMap.get('2020-06-15')
    expect(jun15).toBeDefined()
    expect(jun15![0]!.status).toBe('missed')
  })

  it('detects one-time habits (no frequencyUnit)', () => {
    mocks.data = {
      habits: [
        buildHabit({
          id: 'h-one',
          title: 'One-time task',
          dueTime: null,
          frequencyUnit: null,
          frequencyQuantity: null,
          scheduledDates: ['2020-03-10'],
          dueDate: '2020-03-10',
          createdAtUtc: '2020-01-01T00:00:00Z',
        }),
      ],
      logs: {},
    } as unknown as CalendarMonthResponse

    const result = renderCalendarData(new Date(2020, 2, 1))

    const entry = result.dayMap.get('2020-03-10')
    expect(entry).toBeDefined()
    expect(entry![0]!.isOneTime).toBe(true)
  })

  it.each(['month', 'week'] as const)('keeps cached completion out of pending %s data until the range logs arrive', async (view) => {
    const day = '2026-09-04'
    const habit = makeHabitScheduleItem({ id: 'completed-habit', title: 'Already logged habit', children: [], hasSubHabits: false, dueDate: day, scheduledDates: [day], isCompleted: true, instances: [{ date: day, status: 'Completed', logId: 'completed-log' }] })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(habitKeys.list({ dateFrom: day, dateTo: day, completeDay: true, includeOverdue: true }), [habit])
    let release!: (response: CalendarMonthResponse) => void
    mocks.apiClient.mockReturnValueOnce(new Promise((resolve) => { release = resolve }))
    mocks.useRealQueries = true
    let result!: ReturnType<typeof useCalendarData> | ReturnType<typeof useCalendarRange>
    function MonthProbe() {
      result = useCalendarData(new Date(2026, 8, 1))
      return null
    }
    function WeekProbe() {
      result = useCalendarRange(new Date(2026, 7, 31), new Date(2026, 8, 6))
      return null
    }
    mocks.apiClient.mockImplementation(() => new Promise(() => {}))
    let tree!: import('react-test-renderer').ReactTestRenderer
    TestRenderer.act(() => { tree = TestRenderer.create(React.createElement(QueryClientProvider, { client }, React.createElement(view === 'month' ? MonthProbe : WeekProbe))) })
    try {
      expect(result.isLoading).toBe(true)
      expect(result.dayMap.size).toBe(0)
      if (view === 'month') expect((result as ReturnType<typeof useCalendarData>).loadingDayMap?.get(day)).toHaveLength(1)
      else expect('loadingDayMap' in result).toBe(false)
      await TestRenderer.act(() => { release({ habits: [habit], logs: { [habit.id]: [{ id: 'completed-log', date: day, value: 1, createdAtUtc: `${day}T09:00:00Z` }] } }) })
      await vi.waitFor(async () => {
        await TestRenderer.act(async () => {})
        expect(result.isLoading).toBe(false)
      })
      expect(result.dayMap.get(day)).toEqual([expect.objectContaining({ habitId: habit.id, status: 'completed' })])
    } finally {
      TestRenderer.act(() => tree.update(React.createElement(React.Fragment)))
      client.clear()
      mocks.useRealQueries = false
    }
  })
})


it('decodes source-serialized clock reminders in the calendar query', async () => {
  mocks.apiClient.mockResolvedValue(reminderWire.CalendarMonthResponse)
  renderCalendarData(new Date(2026, 9, 1))
  await expect(mocks.captured.at(-1)!.queryFn()).resolves.toMatchObject({ habits: [{
    scheduledReminders: [{ when: 'same_day' }, { when: 'day_before' }],
    relativeReminders: [{ when: 'same_day' }, { when: 'day_before' }],
  }] })
})

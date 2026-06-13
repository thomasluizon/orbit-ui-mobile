import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { habitKeys } from '@orbit/shared/query'
import type { CalendarMonthResponse } from '@orbit/shared/types/habit'

import { useCalendarData } from '@/hooks/use-calendar-data'

const TestRenderer = require('react-test-renderer')

interface CapturedQuery {
  queryKey: readonly unknown[]
  queryFn: () => unknown
}

const mocks = vi.hoisted(() => ({
  captured: [] as CapturedQuery[],
  apiClient: vi.fn(),
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

vi.mock('@tanstack/react-query', () => ({
  useQuery: mocks.useQuery,
}))

vi.mock('@/lib/api-client', () => ({
  apiClient: (...args: unknown[]) => mocks.apiClient(...args),
}))

type CalendarDataResult = ReturnType<typeof useCalendarData>

function renderCalendarData(currentMonth: Date): CalendarDataResult {
  let captured: CalendarDataResult | null = null
  function Probe() {
    captured = useCalendarData(currentMonth)
    return null
  }
  TestRenderer.act(() => {
    TestRenderer.create(React.createElement(Probe))
  })
  if (!captured) throw new Error('hook did not render')
  return captured
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
})

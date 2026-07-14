import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { habitKeys } from '@orbit/shared/query'
import { formatAPIDate } from '@orbit/shared/utils'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import { useAgendaDay } from '@/components/calendar/use-agenda-day'

const rangeReturn = vi.hoisted(() => ({
  value: {} as {
    dayMap: Map<string, CalendarDayEntry[]>
    isLoading: boolean
    isFetching: boolean
    error: string | null
    refresh: () => void
  },
}))

const refreshRange = vi.fn()

vi.mock('@/hooks/use-calendar-data', () => ({
  useCalendarRange: () => rangeReturn.value,
}))

const date = new Date(2026, 0, 15)
const dateStr = formatAPIDate(date)

function dayEntry(overrides: Partial<CalendarDayEntry> = {}): CalendarDayEntry {
  return {
    habitId: 'h-1',
    title: 'Read',
    status: 'upcoming',
    isBadHabit: false,
    dueTime: '09:00',
    isOneTime: false,
    ...overrides,
  }
}

function scheduleItem(id: string, dueEndTime: string | null) {
  return {
    id,
    title: 'Read',
    isBadHabit: false,
    dueTime: '09:00',
    frequencyUnit: 'Day',
    frequencyQuantity: 1,
    scheduledDates: [dateStr],
    instances: null,
    isCompleted: false,
    isGeneral: false,
    isFlexible: false,
    days: [],
    dueDate: dateStr,
    dueEndTime,
    endDate: null,
    position: 0,
    checklistItems: [],
    createdAtUtc: '2026-01-01T00:00:00Z',
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

function createHarness() {
  const queryClient = new QueryClient()
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
  return { queryClient, wrapper }
}

describe('useAgendaDay', () => {
  beforeEach(() => {
    refreshRange.mockReset()
    rangeReturn.value = {
      dayMap: new Map([[dateStr, [dayEntry()]]]),
      isLoading: false,
      isFetching: false,
      error: null,
      refresh: refreshRange,
    }
  })

  it('enriches the day entries with the habit end time from the cached schedule', () => {
    const { queryClient, wrapper } = createHarness()
    queryClient.setQueryData(habitKeys.calendar(dateStr, dateStr), {
      habits: [scheduleItem('h-1', '10:30')],
      logs: {},
    })

    const { result } = renderHook(() => useAgendaDay(date, true), { wrapper })

    expect(result.current.entries).toHaveLength(1)
    expect(result.current.entries[0]!.dueEndTime).toBe('10:30')
    expect(result.current.habitsById.size).toBe(1)
    expect(result.current.isLoading).toBe(false)
  })

  it('defaults the end time to null when no matching schedule item is cached', () => {
    const { wrapper } = createHarness()
    const { result } = renderHook(() => useAgendaDay(date, true), { wrapper })

    expect(result.current.entries[0]!.dueEndTime).toBeNull()
    expect(result.current.habitsById.size).toBe(0)
  })

  it('returns no entries when the day has none', () => {
    rangeReturn.value = { ...rangeReturn.value, dayMap: new Map() }
    const { wrapper } = createHarness()
    const { result } = renderHook(() => useAgendaDay(date, true), { wrapper })
    expect(result.current.entries).toEqual([])
  })

  it('delegates refresh to the shared calendar range query', () => {
    const { wrapper } = createHarness()
    const { result } = renderHook(() => useAgendaDay(date, true), { wrapper })
    result.current.refresh()
    expect(refreshRange).toHaveBeenCalledTimes(1)
  })
})

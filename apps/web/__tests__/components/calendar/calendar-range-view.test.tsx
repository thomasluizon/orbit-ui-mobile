import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { enUS } from 'date-fns/locale'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`
    return key
  },
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { weekStartDay: 1 } }),
}))

vi.mock('@/hooks/use-date-format', () => ({
  useDateFormat: () => ({
    displayWeekdayDate: (date: Date) => date.toDateString(),
  }),
}))

import { CalendarRangeView } from '@/components/calendar/calendar-range-view'
import type { TimeGridColumn } from '@/components/calendar/calendar-time-grid'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'

function column(year: number, month: number, day: number): TimeGridColumn {
  const date = new Date(year, month, day)
  return {
    date,
    dateStr: `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    isToday: false,
  }
}

interface RenderOverrides {
  isClamped?: boolean
  isAwaitingEnd?: boolean
}

function renderRange({ isClamped = false, isAwaitingEnd = false }: RenderOverrides = {}) {
  return render(
    <CalendarRangeView
      currentMonth={new Date(2025, 5, 1)}
      monthDayMap={new Map<string, CalendarDayEntry[]>()}
      rangeStart="2025-06-10"
      rangeEnd="2025-06-12"
      onPickDay={vi.fn()}
      columns={[column(2025, 5, 10), column(2025, 5, 11), column(2025, 5, 12)]}
      rangeDayMap={new Map<string, CalendarDayEntry[]>()}
      hint="pick-start-hint"
      endHint="pick-end-hint"
      clampedNotice="clamped-notice"
      isClamped={isClamped}
      isAwaitingEnd={isAwaitingEnd}
      onSelectDay={vi.fn()}
      displayTime={(time) => time}
      dateFnsLocale={enUS}
      allDayLabel="All-day"
      nowLabel="Now"
      showRecurring
      onShowRecurringChange={vi.fn()}
    />,
  )
}

describe('CalendarRangeView', () => {
  it('shows the start hint before any pick', () => {
    renderRange()

    expect(screen.getByText('pick-start-hint')).toBeInTheDocument()
    expect(screen.queryByText('pick-end-hint')).toBeNull()
  })

  it('asks for the end day while awaiting the second tap', () => {
    renderRange({ isAwaitingEnd: true })

    expect(screen.getByText('pick-end-hint')).toBeInTheDocument()
    expect(screen.queryByText('pick-start-hint')).toBeNull()
  })

  it('shows the clamped notice once a picked range was clamped', () => {
    renderRange({ isClamped: true })

    expect(screen.getByText('clamped-notice')).toBeInTheDocument()
    expect(screen.queryByText('pick-start-hint')).toBeNull()
  })
})

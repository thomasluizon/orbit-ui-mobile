import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HabitCalendar } from '@/components/habits/habit-calendar'

const TestRenderer = require('react-test-renderer')

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }),
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { weekStartDay: 1 } }),
}))

vi.mock('@/hooks/use-habits', () => ({
  useHabitLogs: () => ({ data: [] }),
}))

vi.mock('@/hooks/use-date-format', () => ({
  useDateFormat: () => ({
    displayMonthYear: () => 'August 2026',
    displayDate: (date: Date) => date.toISOString().slice(0, 10),
  }),
}))

vi.mock('@/hooks/use-time-format', () => ({
  useTimeFormat: () => ({ displayTime: (time: string) => time }),
}))

vi.mock('@/components/ui/icons', () => ({
  ChevronLeft: () => null,
  ChevronRight: () => null,
  X: () => null,
}))

vi.mock('@/components/dates/month-grid', () => ({
  MonthGrid: ({ children }: { children: React.ReactNode }) => React.createElement('MonthGrid', null, children),
}))

vi.mock('@/components/dates/day-cell', () => ({
  DayCell: (props: Record<string, unknown>) => React.createElement('DayCell', {
    ...props,
    testID: props.loggable ? `habit-calendar-completed-day-${String(props.day)}` : undefined,
  }),
}))

describe('HabitCalendar', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-29T12:00:00'))
  })

  afterEach(() => vi.useRealTimers())

  it('exposes the selected state on the completed-day pressable', () => {
    let tree!: import('react-test-renderer').ReactTestRenderer
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <HabitCalendar
          habitId="habit-1"
          logs={[{
            id: 'log-1',
            date: '2026-08-26',
            value: 1,
            createdAtUtc: '2026-08-26T12:00:00Z',
          }]}
        />,
      )
    })

    const completedDay = tree.root.findAll(
      (node) => node.props.testID === 'habit-calendar-completed-day-26',
    )[0]
    expect(completedDay?.props.accessibilityState).toEqual({ selected: false })

    TestRenderer.act(() => (completedDay?.props.onPress as () => void)())

    const selectedDay = tree.root.findAll(
      (node) => node.props.testID === 'habit-calendar-completed-day-26',
    )[0]
    expect(selectedDay?.props.accessibilityState).toEqual({ selected: true })
  })
})

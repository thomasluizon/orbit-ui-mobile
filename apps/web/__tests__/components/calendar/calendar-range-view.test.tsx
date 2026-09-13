import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { buildCalendarRangeModel, parseAPIDate } from '@orbit/shared/utils'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/hooks/use-date-format', () => ({
  useDateFormat: () => ({
    displayWeekdayDate: (date: Date) => date.toDateString(),
  }),
}))

import { CalendarRangeView } from '@/components/calendar/calendar-range-view'

function entry(status: CalendarDayEntry['status'], habitId = 'habit'): CalendarDayEntry {
  return { habitId, title: 'Habit', status, isBadHabit: false, dueTime: null, isOneTime: false }
}

function renderRange(isLoading = false) {
  const onPreviousRange = vi.fn()
  const onNextRange = vi.fn()
  const model = buildCalendarRangeModel(
    parseAPIDate('2026-06-14'),
    new Map([
      ['2026-06-01', [entry('completed')]],
      ['2026-06-02', [entry('completed')]],
      ['2026-06-03', [entry('completed'), entry('completed', 'second'), entry('missed', 'missed')]],
    ]),
    1,
    '2026-06-14',
  )

  const view = render(
    <CalendarRangeView
      model={model}
      weekdayLabels={['M', 'T', 'W', 'T', 'F', 'S', 'S']}
      rangeLabel="Jun 1 to Jun 14"
      previousRangeLabel="Previous range"
      nextRangeLabel="Next range"
      onPreviousRange={onPreviousRange}
      onNextRange={onNextRange}
      nextRangeDisabled={false}
      isLoading={isLoading}
      loadingLabel="Loading range"
      stats={[
        { key: 'bestStreak', emoji: '🔥', value: model.stats.bestStreak, label: 'Best streak' },
        { key: 'totalLogs', emoji: '✅', value: model.stats.totalLogs, label: 'Logs' },
        { key: 'missed', emoji: '⚠️', value: model.stats.missed, label: 'Missed' },
      ]}
    />,
  )
  return { onPreviousRange, onNextRange, ...view }
}

describe('CalendarRangeView', () => {
  it('states both span dates and pages through range controls', () => {
    const callbacks = renderRange()

    expect(screen.getByText('Jun 1 to Jun 14')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Previous range' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next range' }))
    expect(callbacks.onPreviousRange).toHaveBeenCalledOnce()
    expect(callbacks.onNextRange).toHaveBeenCalledOnce()
  })

  it('renders fourteen range days as read-only images and shows span figures', () => {
    renderRange()

    expect(screen.getAllByRole('img')).toHaveLength(14)
    expect(screen.getAllByRole('button')).toHaveLength(2)
    expect(screen.getByText('Logs').previousSibling).toHaveTextContent('4')
    expect(screen.getByText('Missed').previousSibling).toHaveTextContent('1')
    expect(screen.getByText('Best streak').previousSibling).toHaveTextContent('3')
  })

  it('keeps the range geometry busy without announcing empty outcomes, then reveals the resolved span', () => {
    const view = renderRange(true)

    expect(screen.getByRole('region', { name: 'Jun 1 to Jun 14' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('progressbar', { name: 'Loading range' })).toBeInTheDocument()
    expect(screen.getByTestId('month-grid-days').children).toHaveLength(14)
    expect(screen.getByTestId('month-grid-days')).toHaveStyle({ gap: '4px' })
    expect(screen.queryAllByRole('img')).toHaveLength(0)
    expect(screen.queryByText('Logs')).not.toBeInTheDocument()

    view.rerender(
      <CalendarRangeView
        model={buildCalendarRangeModel(
          parseAPIDate('2026-06-14'),
          new Map([['2026-06-01', [entry('completed')]]]),
          1,
          '2026-06-14',
        )}
        weekdayLabels={['M', 'T', 'W', 'T', 'F', 'S', 'S']}
        rangeLabel="Jun 1 to Jun 14"
        previousRangeLabel="Previous range"
        nextRangeLabel="Next range"
        onPreviousRange={vi.fn()}
        onNextRange={vi.fn()}
        nextRangeDisabled={false}
        isLoading={false}
        loadingLabel="Loading range"
        stats={[
          { key: 'bestStreak', emoji: '🔥', value: 1, label: 'Best streak' },
          { key: 'totalLogs', emoji: '✅', value: 1, label: 'Logs' },
          { key: 'missed', emoji: '⚠️', value: 0, label: 'Missed' },
        ]}
      />,
    )

    expect(screen.getByRole('region', { name: 'Jun 1 to Jun 14' })).toHaveAttribute('aria-busy', 'false')
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.getAllByRole('img')).toHaveLength(14)
    expect(screen.getByText('Logs').previousSibling).toHaveTextContent('1')
  })
})

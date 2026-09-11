import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DayCellWords } from '@orbit/shared/contracts/dates'
import { DayCell } from '@/components/dates/day-cell'
import { DayStrip } from '@/components/dates/day-strip'
import { EventRow } from '@/components/dates/event-row'
import { MonthGrid } from '@/components/dates/month-grid'

const cellWords: DayCellWords = {
  none: 'none',
  partial: 'partial',
  full: 'full',
  notScheduled: 'not scheduled',
  of: 'of',
  today: 'today',
  readOnly: 'read only',
}

describe('DayStrip', () => {
  it('renders habit entries in order with the caller vocabulary and strip label', () => {
    const { container } = render(
      <DayStrip
        scope="habit"
        days={['done', 'missed', 'not-scheduled']}
        labels={['Mon 1', 'Tue 2', 'Wed 3']}
        words={{ done: 'complete', missed: 'missed', notScheduled: 'rest' }}
        label="Habit history"
      />,
    )

    expect(screen.getByRole('group', { name: 'Habit history' })).toBeInTheDocument()
    expect([...container.querySelectorAll('[data-state]')].map((node) => node.getAttribute('data-state'))).toEqual([
      'done',
      'missed',
      'not-scheduled',
    ])
    expect(screen.getByRole('img', { name: 'Mon 1, complete' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Wed 3, rest' })).toBeInTheDocument()
  })

  it('marks only the account today entry as current', () => {
    const { container } = render(
      <DayStrip
        scope="account"
        days={['active', 'frozen', 'missed', 'today']}
        words={{ active: 'active', frozen: 'protected', missed: 'missed', today: 'today' }}
        label="Account streak"
      />,
    )

    expect(container.querySelectorAll('[aria-current="date"]')).toHaveLength(1)
    expect(container.querySelector('[aria-current="date"]')).toHaveAttribute('data-state', 'today')
    expect(container.querySelector('[data-state="frozen"]')).toHaveStyle({
      background: 'var(--status-frozen)',
    })
  })
})

describe('DayCell', () => {
  it('renders a loggable button and presses once', () => {
    const onPress = vi.fn()
    render(<DayCell day={12} label="March 12" loggable words={cellWords} scheduled={4} done={1} onPress={onPress} />)

    const button = screen.getByRole('button', { name: 'March 12, partial 1 of 4' })
    fireEvent.click(button)
    expect(onPress).toHaveBeenCalledTimes(1)
    expect(button).toHaveAttribute('data-outcome', 'partial')
  })

  it('renders read-only, unscheduled, and outside outcomes from counts', () => {
    const { container, rerender } = render(<DayCell day={14} label="March 14" words={cellWords} done={0} scheduled={0} />)
    const unscheduled = screen.getByRole('img', { name: 'March 14, not scheduled, read only' })
    expect(unscheduled).toHaveAttribute(
      'data-outcome',
      'not-scheduled',
    )
    expect(unscheduled.firstElementChild).toHaveStyle({ background: 'transparent' })

    rerender(<DayCell day={30} label="April 30" words={cellWords} outsideMonth />)
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
    expect(container.firstElementChild).toHaveAttribute('data-outside-month')
  })

  it('draws the partial arc from the exact completion fraction', () => {
    const { container, rerender } = render(
      <DayCell day={15} label="March 15" words={cellWords} scheduled={3} done={1} />,
    )
    expect(container.querySelectorAll('circle')[1]).toHaveAttribute('stroke-dasharray', `${(1 / 3) * 100} 100`)

    rerender(<DayCell day={15} label="March 15" words={cellWords} scheduled={3} done={2} />)
    expect(container.querySelectorAll('circle')[1]).toHaveAttribute('stroke-dasharray', `${(2 / 3) * 100} 100`)
  })

  it('uses the quiet habit-history treatment for completed, missed, and unscheduled days', () => {
    const { container, rerender } = render(
      <DayCell day={15} label="March 15" words={cellWords} done={1} scheduled={1} habitHistory />,
    )
    expect(container.querySelector('[data-outcome="full"] span span')).toHaveStyle({ color: 'var(--bg)' })
    expect(container.querySelector('span[style*="width: 3px"]')).toBeNull()

    rerender(<DayCell day={16} label="March 16" words={cellWords} done={0} scheduled={1} habitHistory />)
    expect(container.querySelector('span[style*="width: 3px"]')).toBeInTheDocument()

    rerender(<DayCell day={17} label="March 17" words={cellWords} done={0} scheduled={0} habitHistory />)
    expect(container.querySelector('[data-outcome="not-scheduled"] span')).toHaveStyle({ opacity: '0.4' })
  })
})

describe('MonthGrid', () => {
  it('takes its columns from the weekday labels and renders children in order', () => {
    const { rerender } = render(
      <MonthGrid weekdayLabels={['M', 'T', 'W', 'T', 'F']} label="Work week">
        <span>one</span><span>two</span>
      </MonthGrid>,
    )
    expect(screen.getByRole('group', { name: 'Work week' })).toHaveAttribute('data-columns', '5')
    expect(screen.getByTestId('month-grid-days')).toHaveTextContent('onetwo')

    rerender(<MonthGrid weekdayLabels={['S', 'M', 'T', 'W', 'T', 'F', 'S']}><span>day</span></MonthGrid>)
    expect(screen.getByTestId('month-grid-days').parentElement).toHaveAttribute('data-columns', '7')
  })

  it('renders no header for an empty label list and keeps the children', () => {
    render(<MonthGrid weekdayLabels={[]}><span>day</span></MonthGrid>)
    expect(screen.queryByTestId('month-grid-header')).not.toBeInTheDocument()
    expect(screen.getByTestId('month-grid-days')).toHaveTextContent('day')
  })
})

describe('EventRow', () => {
  it('renders timed and all-day events as read-only rows', () => {
    const { rerender } = render(<EventRow time="09:00" title="Standup" source="Work" />)
    expect(screen.getByRole('img', { name: '09:00, Standup, Work' })).toHaveTextContent('09:00StandupWork')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()

    rerender(<EventRow allDayLabel="All day" title="Holiday" source="Personal" />)
    expect(screen.getByRole('img', { name: 'All day, Holiday, Personal' })).toHaveAttribute('data-all-day')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

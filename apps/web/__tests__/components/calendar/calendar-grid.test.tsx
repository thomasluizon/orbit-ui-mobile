import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useState, type ComponentProps } from 'react'
import userEvent from '@testing-library/user-event'

const todaySource = vi.hoisted(() => ({ value: '2025-06-15', locale: 'en' }))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => todaySource.locale,
}))

vi.mock('@orbit/shared/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@orbit/shared/utils')>()
  return {
    ...actual,
    formatAPIDate: (d: Date) => d.toISOString().split('T')[0],
  }
})

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { weekStartDay: 1 } }),
}))

vi.mock('@/app/(app)/today-provider', () => ({
  useToday: () => todaySource.value,
}))

import { CalendarGrid as CalendarGridComponent } from '@/components/calendar/calendar-grid'
import { useToday } from '@/app/(app)/today-provider'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'

function CalendarGrid(props: Omit<ComponentProps<typeof CalendarGridComponent>, 'todayKey' | 'weekStartsOn'>) {
  return <CalendarGridComponent {...props} todayKey={useToday()} weekStartsOn={1} />
}

function SelectableCalendarGrid() {
  const [selectedDateStr, setSelectedDateStr] = useState('2025-06-15')
  return <CalendarGrid currentMonth={new Date(2025, 5, 1)} dayMap={new Map()} onSelectDay={setSelectedDateStr} selectedDateStr={selectedDateStr} />
}

describe('CalendarGrid', () => {
  const currentMonth = new Date(2025, 5, 1)
  const emptyMap = new Map<string, CalendarDayEntry[]>()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2025, 5, 15))
    todaySource.value = '2025-06-15'
    todaySource.locale = 'en'
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it.each([
    ['en', 1, ['M', 'T', 'W', 'T', 'F', 'S', 'S']],
    ['en', 0, ['S', 'M', 'T', 'W', 'T', 'F', 'S']],
    ['pt-BR', 1, ['S', 'T', 'Q', 'Q', 'S', 'S', 'D']],
    ['pt-BR', 0, ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']],
  ] as const)('renders drawn weekday letters in %s starting on %i', (locale, weekStartsOn, labels) => {
    todaySource.locale = locale
    render(
      <CalendarGridComponent
        currentMonth={currentMonth}
        dayMap={emptyMap}
        onSelectDay={vi.fn()}
        todayKey={todaySource.value}
        weekStartsOn={weekStartsOn}
      />,
    )
    expect(Array.from(screen.getByTestId('month-grid-header').children, (child) => child.textContent)).toEqual(labels)
  })

  it.each([
    ['2025-06-20', new Date(2025, 5, 1), '2025-06-20'],
    [null, new Date(2025, 5, 1), '2025-06-15'],
    ['2025-05-20', new Date(2025, 5, 1), '2025-06-15'],
    ['2025-06-15', new Date(2025, 6, 1), '2025-07-01'],
  ])('has one tab stop for selection %s in %s', (selectedDateStr, month, expectedDate) => {
    render(<CalendarGrid currentMonth={month} dayMap={emptyMap} onSelectDay={vi.fn()} selectedDateStr={selectedDateStr} />)
    const buttons = screen.getByTestId('month-grid-days').querySelectorAll('button')
    expect([...buttons].filter((button) => button.tabIndex === 0)).toEqual([screen.getByTestId(`calendar-day-select-${expectedDate}`)])
    expect([...buttons].filter((button) => button.tabIndex === -1)).toHaveLength(buttons.length - 1)
  })

  it('tabs into the selected day and then out of the month grid', async () => {
    vi.useRealTimers()
    const user = userEvent.setup()
    render(<><button type="button">Before</button><SelectableCalendarGrid /><button type="button">After</button></>)
    screen.getByRole('button', { name: 'Before' }).focus()
    await user.tab()
    expect(screen.getByTestId('calendar-day-select-2025-06-15')).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'After' })).toHaveFocus()
    await user.tab({ shift: true })
    expect(screen.getByTestId('calendar-day-select-2025-06-15')).toHaveFocus()
  })

  it.each([0, 1] as const)('moves focus within weeks starting on %i without selecting', (weekStartsOn) => {
    const onSelectDay = vi.fn()
    render(<CalendarGridComponent currentMonth={currentMonth} dayMap={emptyMap} onSelectDay={onSelectDay} selectedDateStr="2025-06-15" weekStartsOn={weekStartsOn} todayKey={todaySource.value} />)
    screen.getByTestId('calendar-day-select-2025-06-15').focus()
    const steps = [
      ['ArrowRight', '2025-06-16'],
      ['ArrowDown', '2025-06-23'],
      ['Home', weekStartsOn === 1 ? '2025-06-23' : '2025-06-22'],
      ['End', weekStartsOn === 1 ? '2025-06-29' : '2025-06-28'],
      ['ArrowLeft', weekStartsOn === 1 ? '2025-06-28' : '2025-06-27'],
      ['ArrowUp', weekStartsOn === 1 ? '2025-06-21' : '2025-06-20'],
    ]
    for (const [key, date] of steps) {
      fireEvent.keyDown(document.activeElement!, { key })
      expect(screen.getByTestId(`calendar-day-select-${date}`)).toHaveFocus()
      expect(screen.getByTestId(`calendar-day-select-${date}`)).toHaveAttribute('tabindex', '0')
    }
    expect(onSelectDay).not.toHaveBeenCalled()
    expect(screen.getByTestId('calendar-day-select-2025-06-15')).toHaveAttribute('aria-pressed', 'true')
  })

  it.each([
    ['2025-06-01', ['ArrowLeft', 'ArrowUp', 'Home']],
    ['2025-06-30', ['ArrowRight', 'ArrowDown', 'End']],
  ])('stops keyboard movement at %s', (date, keys) => {
    const onSelectDay = vi.fn()
    render(<CalendarGrid currentMonth={currentMonth} dayMap={emptyMap} onSelectDay={onSelectDay} selectedDateStr={date} />)
    const edge = screen.getByTestId(`calendar-day-select-${date}`)
    edge.focus()
    for (const key of keys) {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
      fireEvent(edge, event)
      expect(event.defaultPrevented).toBe(true)
      expect(edge).toHaveFocus()
    }
    expect(onSelectDay).not.toHaveBeenCalled()
  })

  it('selects focused read-only and future days with Enter and Space', async () => {
    vi.useRealTimers()
    const user = userEvent.setup()
    render(<SelectableCalendarGrid />)
    const selected = screen.getByTestId('calendar-day-select-2025-06-15')
    selected.focus()
    await user.keyboard('{ArrowUp}{ArrowLeft}')
    const readOnly = screen.getByTestId('calendar-day-select-2025-06-07')
    expect(readOnly).toHaveFocus()
    expect(readOnly).toHaveAccessibleName(/calendar\.dayCell\.readOnly/)
    expect(selected).toHaveAttribute('aria-pressed', 'true')
    await user.keyboard('{Enter}')
    expect(readOnly).toHaveAttribute('aria-pressed', 'true')
    expect(readOnly).toHaveAttribute('tabindex', '0')
    await user.keyboard('{ArrowDown}{ArrowDown} ')
    const future = screen.getByTestId('calendar-day-select-2025-06-21')
    expect(future).toHaveFocus()
    expect(future).toHaveAttribute('aria-pressed', 'true')
    expect(future).toHaveAttribute('tabindex', '0')
    expect(future).toHaveAccessibleName(/calendar\.dayCell\.future/)
  })

  it('follows pointer selection, external selection and month changes', () => {
    const onSelectDay = vi.fn()
    const { rerender } = render(<CalendarGrid currentMonth={currentMonth} dayMap={emptyMap} onSelectDay={onSelectDay} selectedDateStr="2025-06-15" />)
    fireEvent.click(screen.getByTestId('calendar-day-select-2025-06-07'))
    expect(screen.getByTestId('calendar-day-select-2025-06-07')).toHaveAttribute('tabindex', '0')
    rerender(<CalendarGrid currentMonth={currentMonth} dayMap={emptyMap} onSelectDay={onSelectDay} selectedDateStr="2025-06-20" />)
    expect(screen.getByTestId('calendar-day-select-2025-06-20')).toHaveAttribute('tabindex', '0')
    rerender(<CalendarGrid currentMonth={new Date(2025, 6, 1)} dayMap={emptyMap} onSelectDay={onSelectDay} selectedDateStr="2025-06-20" />)
    expect(screen.getByTestId('calendar-day-select-2025-07-01')).toHaveAttribute('tabindex', '0')
    rerender(<CalendarGrid currentMonth={currentMonth} dayMap={emptyMap} onSelectDay={onSelectDay} selectedDateStr="2025-06-20" />)
    expect(screen.getByTestId('calendar-day-select-2025-06-20')).toHaveAttribute('tabindex', '0')
  })

  it('renders day cells', () => {
    render(
      <CalendarGrid
        currentMonth={currentMonth}
        dayMap={emptyMap}
        onSelectDay={vi.fn()}
      />,
    )
    expect(document.querySelectorAll('[data-outcome]')).toHaveLength(27)
    expect(screen.getAllByRole('button')).toHaveLength(30)
  })

  it('calls onSelectDay when a day is clicked', () => {
    const onSelectDay = vi.fn()
    render(
      <CalendarGrid
        currentMonth={currentMonth}
        dayMap={emptyMap}
        onSelectDay={onSelectDay}
      />,
    )
    const juneDay = document.querySelector('[data-calendar-date="2025-06-15"]')
    expect(juneDay).toBeDefined()
    fireEvent.click(juneDay!.querySelector('button')!)
    expect(onSelectDay).toHaveBeenCalledWith('2025-06-15')
  })

  it('keeps read-only dates selectable without making their DayCell writable', () => {
    const onSelectDay = vi.fn()
    render(
      <CalendarGrid
        currentMonth={currentMonth}
        dayMap={emptyMap}
        onSelectDay={onSelectDay}
        selectedDateStr="2025-06-15"
      />,
    )

    const oldDay = document.querySelector('[data-calendar-date="2025-06-07"]')!
    const futureDay = document.querySelector('[data-calendar-date="2025-06-20"]')!

    expect(oldDay.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain(
      'calendar.dayCell.readOnly',
    )
    expect(oldDay.querySelector('[role="img"]')).not.toHaveAttribute('data-loggable')
    expect(oldDay.querySelector('button')).toHaveAccessibleName(
      expect.stringContaining('calendar.dayCell.readOnly'),
    )
    fireEvent.click(oldDay.querySelector('button')!)
    fireEvent.click(futureDay.querySelector('button')!)
    expect(onSelectDay).toHaveBeenNthCalledWith(1, '2025-06-07')
    expect(onSelectDay).toHaveBeenNthCalledWith(2, '2025-06-20')
  })

  it('moves the write window when the app today source advances', () => {
    const { rerender } = render(
      <CalendarGrid currentMonth={currentMonth} dayMap={emptyMap} onSelectDay={vi.fn()} />,
    )

    const oldBoundary = document.querySelector('[data-calendar-date="2025-06-08"]')
    expect(oldBoundary?.querySelector('[data-day-circle]')).toHaveStyle({ background: 'var(--bg-well)' })

    todaySource.value = '2025-06-16'
    rerender(<CalendarGrid currentMonth={currentMonth} dayMap={emptyMap} onSelectDay={vi.fn()} />)

    expect(oldBoundary?.querySelector('[data-day-circle]')).toHaveStyle({ background: 'transparent' })
    const newBoundary = document.querySelector('[data-calendar-date="2025-06-16"]')
    expect(newBoundary?.querySelector('[data-day-circle]')).toHaveStyle({
      background: 'var(--bg-well)',
    })
    expect(oldBoundary?.querySelector('button')).not.toHaveAttribute('aria-current')
    expect(newBoundary?.querySelector('button')).toHaveAttribute('aria-current', 'date')
  })


  it('does not reserve a sixth row for a five-week month', () => {
    render(<CalendarGrid currentMonth={new Date(2026, 8, 1)} dayMap={emptyMap} onSelectDay={vi.fn()} />)
    expect(document.querySelectorAll('[data-calendar-date]')).toHaveLength(35)
    expect(screen.getByTestId('month-grid-days').style.minHeight).toBe('')
  })

  it('uses the grid skeleton geometry and withholds weekdays while loading', () => {
    const { container } = render(
      <CalendarGrid currentMonth={currentMonth} dayMap={emptyMap} onSelectDay={vi.fn()} isLoading />,
    )

    const skeleton = screen.getByRole('progressbar')
    expect(skeleton).toHaveAttribute('data-cols', '7')
    expect(skeleton).toHaveAttribute('data-rows', '6')
    expect(screen.getByTestId('month-grid-header')).toHaveStyle({ opacity: 0 })
    expect(screen.getByTestId('month-grid-header')).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelector('[data-outcome]')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('fills seven tracks inside the content inset with targets at least 44px high', () => {
    render(<CalendarGrid currentMonth={currentMonth} dayMap={emptyMap} onSelectDay={vi.fn()} />)

    expect(screen.getByTestId('calendar-grid')).toHaveStyle({ paddingLeft: '16px', paddingRight: '16px' })
    expect(screen.getByTestId('calendar-grid-card')).not.toHaveStyle({ background: 'var(--bg-card)' })
    expect(screen.getByTestId('calendar-grid-card')).not.toHaveStyle({ boxShadow: 'inset 0 0 0 1px var(--hairline)' })
    expect((screen.getByTestId('calendar-grid-card') as HTMLElement).style.borderRadius).toBe('')
    expect(screen.getByTestId('month-grid-days')).toHaveStyle({ gap: 'var(--calendar-grid-gap)' })
    expect(screen.getByTestId('month-grid-days')).toHaveStyle({ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' })
    const firstRowTargets = [...document.querySelectorAll('[data-calendar-date]')].slice(0, 7)
    expect(firstRowTargets).toHaveLength(7)
    expect(firstRowTargets.every((target) => (target as HTMLElement).style.width === '100%')).toBe(true)
    expect(firstRowTargets.every((target) => (target as HTMLElement).style.minHeight === '44px')).toBe(true)
    expect(firstRowTargets.every((target) => (target as HTMLElement).style.minWidth === '')).toBe(true)
  })

  it('marks today with aria-current="date"', () => {
    const today = new Date()
    const todayMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    render(
      <CalendarGrid
        currentMonth={todayMonth}
        dayMap={emptyMap}
        onSelectDay={vi.fn()}
      />,
    )
    const todayCell = document.querySelector('[aria-current="date"]')
    expect(todayCell).toBeInTheDocument()
  })

  it('keeps the slot transparent and delegates selected presentation to DayCell', () => {
    const { container } = render(
      <CalendarGrid
        currentMonth={currentMonth}
        dayMap={emptyMap}
        onSelectDay={vi.fn()}
        selectedDateStr="2025-06-15"
      />,
    )

    const selectedSlot = container.querySelector('[data-calendar-date="2025-06-15"]')
    expect(selectedSlot?.querySelector('[data-day-circle]')).toHaveStyle({ background: 'var(--selection-bg)' })
    expect(selectedSlot?.querySelector('[data-day-position-ring]')).toHaveStyle({ boxShadow: 'var(--day-focus-ring, inset 0 0 0 2px var(--primary))' })
    expect(selectedSlot?.getAttribute('style')).not.toContain('background')
    expect(selectedSlot?.querySelector('[data-selected]')).not.toBeInTheDocument()
    const futureSlot = container.querySelector('[data-calendar-date="2025-06-20"]')
    expect(futureSlot?.querySelector('[data-outcome]')).not.toBeInTheDocument()
    expect(futureSlot?.querySelector('[data-day-future-numeral]')).toHaveStyle({ color: 'var(--fg-2)' })
  })

  it('derives the full outcome when all entries are complete', () => {
    const dayMap = new Map<string, CalendarDayEntry[]>([
      [
        '2025-06-15',
        [
          {
            habitId: '1',
            title: 'Test',
            status: 'completed',
            isBadHabit: false,
            dueTime: null,
            isOneTime: false,
          },
        ],
      ],
    ])
    const { container } = render(
      <CalendarGrid
        currentMonth={currentMonth}
        dayMap={dayMap}
        onSelectDay={vi.fn()}
      />,
    )
    expect(container.querySelector('[data-outcome="full"]')).toBeInTheDocument()
  })

  it('renders full completion with the neutral foreground token', () => {
    const dayMap = new Map<string, CalendarDayEntry[]>([
      [
        '2025-06-15',
        [
          {
            habitId: '1',
            title: 'Test',
            status: 'completed',
            isBadHabit: false,
            dueTime: null,
            isOneTime: false,
          },
        ],
      ],
    ])
    const { container } = render(
      <CalendarGrid
        currentMonth={currentMonth}
        dayMap={dayMap}
        onSelectDay={vi.fn()}
      />,
    )
    const fullCell = container.querySelector('[data-outcome="full"]')
    expect(fullCell?.querySelector('[data-day-disc]')).toHaveStyle({ background: 'var(--fg-1)' })
  })

  it('disables non-current-month days', () => {
    render(
      <CalendarGrid
        currentMonth={currentMonth}
        dayMap={emptyMap}
        onSelectDay={vi.fn()}
      />,
    )
    const outsideCells = document.querySelectorAll('[data-outside-month]')
    expect(outsideCells.length).toBeGreaterThan(0)
    expect(outsideCells[0]).toHaveAttribute('aria-hidden', 'true')
  })



})

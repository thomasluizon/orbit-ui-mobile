import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'

const translations: Record<string, string> = {
  'calendar.dayDetail.nothingDue': 'nothing due',
  'calendar.noHabitsScheduled': 'No habit was scheduled on this day.',
  'calendar.goToDay': 'Open this day on Today',
  'calendar.showRecurring': 'Show recurring habits',
  'calendar.status.completed': 'done',
  'calendar.status.missed': 'not logged',
  'calendar.status.indulged': 'indulged',
  'calendar.status.resisted': 'resisted',
}

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (key === 'calendar.dayDetail.completionSummary') {
      return `${String(params?.done)} of ${String(params?.total)} logged`
    }
    return translations[key] ?? key
  },
  useLocale: () => 'en',
}))

vi.mock('@/hooks/use-time-format', () => ({
  useTimeFormat: () => ({ displayTime: (time: string) => time }),
}))

vi.mock('@/hooks/use-date-format', () => ({
  useDateFormat: () => ({ displayWeekdayDate: () => 'Sunday, June 15' }),
}))

vi.mock('@orbit/shared/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@orbit/shared/utils')>()
  return { ...actual, parseAPIDate: (date: string) => new Date(date) }
})

import { CalendarDayDetail } from '@/components/calendar/calendar-day-detail'

function makeEntry(overrides: Partial<CalendarDayEntry> = {}): CalendarDayEntry {
  return {
    habitId: '1',
    title: 'Meditate',
    status: 'completed',
    isBadHabit: false,
    dueTime: '08:00',
    isOneTime: false,
    ...overrides,
  }
}

interface RenderProps {
  dateStr?: string | null
  entries?: CalendarDayEntry[]
  loggable?: boolean
  showRecurring?: boolean
  onEntryChange?: (entry: CalendarDayEntry, checked: boolean) => void
  fitViewport?: boolean
}

function renderDetail({
  dateStr = '2025-06-15',
  entries = [],
  loggable = false,
  showRecurring = true,
  onEntryChange = () => {},
  fitViewport = false,
}: RenderProps = {}) {
  return render(
    <CalendarDayDetail
      dateStr={dateStr}
      entries={entries}
      loggable={loggable}
      showRecurring={showRecurring}
      onShowRecurringChange={() => {}}
      onEntryChange={onEntryChange}
      fitViewport={fitViewport}
    />,
  )
}

describe('CalendarDayDetail', () => {
  it('renders nothing without a selected date', () => {
    const { container } = renderDetail({ dateStr: null })
    expect(container).toBeEmptyDOMElement()
  })

  it('keeps the summary and its own no-habits line when the day is empty', () => {
    renderDetail()
    expect(screen.getByText('nothing due')).toBeInTheDocument()
    expect(screen.getByText('No habit was scheduled on this day.')).toBeInTheDocument()
  })

  it('uses the selected-day card surface from the calendar canvas', () => {
    const { container } = renderDetail()
    const panel = container.querySelector('section')
    expect(panel).toHaveClass(
      'rounded-[var(--r-card)]',
      'bg-[var(--bg-card)]',
      'shadow-[inset_0_0_0_1px_var(--hairline-ghost)]',
    )
  })

  it('renders ordinary read-only outcomes beside the time and their rings in the row', () => {
    renderDetail({
      entries: [
        makeEntry({ title: 'Read' }),
        makeEntry({ habitId: '2', title: 'Walk', dueTime: '09:00', status: 'missed' }),
      ],
    })

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getByText('08:00 · done')).toBeInTheDocument()
    expect(screen.getByText('09:00 · not logged')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'done' })).toHaveAttribute('data-status', 'done')
    expect(screen.getByRole('img', { name: 'not logged' })).toHaveAttribute('data-status', 'empty')
  })

  it('uses avoid-habit outcomes for both completed and unlogged rows', () => {
    renderDetail({
      entries: [
        makeEntry({ title: 'Sweets', isBadHabit: true }),
        makeEntry({ habitId: '2', title: 'Smoking', isBadHabit: true, status: 'upcoming' }),
      ],
    })

    expect(screen.getByText('08:00 · indulged')).toBeInTheDocument()
    expect(screen.getByText('08:00 · resisted')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'indulged' })).toHaveAttribute('data-status', 'bad')
    expect(screen.getByRole('img', { name: 'resisted' })).toHaveAttribute('data-status', 'done')
  })

  it('uses check rows on loggable days and reports the requested state', () => {
    const entry = makeEntry({ title: 'Read' })
    const onEntryChange = vi.fn()
    renderDetail({ entries: [entry], loggable: true, onEntryChange })

    const row = screen.getByRole('checkbox', { name: 'Read' })
    expect(within(row).getByText('08:00 · done')).toBeInTheDocument()
    fireEvent.click(row)
    expect(onEntryChange).toHaveBeenCalledWith(entry, false)
  })

  it('summarizes the filtered rows and keeps the no-habits line when recurring rows are hidden', () => {
    renderDetail({
      showRecurring: false,
      entries: [makeEntry({ title: 'Recurring', isOneTime: false })],
    })
    expect(screen.getByText('nothing due')).toBeInTheDocument()
    expect(screen.getByText('No habit was scheduled on this day.')).toBeInTheDocument()
    expect(screen.queryByText('Recurring')).not.toBeInTheDocument()
  })

  it('leaves for Today through the panel row with the selected date', () => {
    renderDetail()
    expect(screen.getByRole('link', { name: 'Open this day on Today' })).toHaveAttribute(
      'href',
      '/?date=2025-06-15',
    )
  })

  it('keeps the route row outside the desktop scroll region', () => {
    const { container } = renderDetail({ entries: [makeEntry()], fitViewport: true })
    const scroller = container.querySelector('[data-calendar-day-scroll]') as HTMLElement
    const routeRow = screen.getByRole('link', { name: 'Open this day on Today' })
    expect(scroller).not.toBeNull()
    expect(scroller).not.toContainElement(routeRow)
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`
    return key
  },
  useLocale: () => 'en',
}))

vi.mock('dompurify', () => ({
  default: { sanitize: (html: string) => html },
}))

vi.mock('@/lib/plural', () => ({
  plural: (text: string) => text,
}))

vi.mock('@/hooks/use-time-format', () => ({
  useTimeFormat: () => ({
    displayTime: (t: string) => t,
  }),
}))

vi.mock('@orbit/shared/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@orbit/shared/utils')>()
  return {
    ...actual,
    parseAPIDate: (d: string) => new Date(d),
  }
})

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

import { CalendarDayDetail } from '@/components/calendar/calendar-day-detail'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'

function makeEntry(overrides: Partial<CalendarDayEntry> = {}): CalendarDayEntry {
  return {
    habitId: '1',
    title: 'Meditate',
    status: 'completed',
    isBadHabit: false,
    dueTime: null,
    isOneTime: false,
    ...overrides,
  }
}

describe('CalendarDayDetail', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('renders nothing when closed', () => {
    const { container } = render(
      <CalendarDayDetail
        open={false}
        onOpenChange={vi.fn()}
        dateStr="2025-06-15"
        entries={[]}
      />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('shows no habits message when entries are empty', () => {
    render(
      <CalendarDayDetail
        open={true}
        onOpenChange={vi.fn()}
        dateStr="2025-06-15"
        entries={[]}
      />,
    )
    expect(document.body.textContent).toContain('calendar.noHabitsScheduled')
  })

  it('renders habit entries', () => {
    render(
      <CalendarDayDetail
        open={true}
        onOpenChange={vi.fn()}
        dateStr="2025-06-15"
        entries={[makeEntry({ title: 'Read' }), makeEntry({ title: 'Exercise', habitId: '2' })]}
      />,
    )
    expect(screen.getByText('Read')).toBeInTheDocument()
    expect(screen.getByText('Exercise')).toBeInTheDocument()
  })

  it('shows completion summary', () => {
    render(
      <CalendarDayDetail
        open={true}
        onOpenChange={vi.fn()}
        dateStr="2025-06-15"
        entries={[makeEntry(), makeEntry({ habitId: '2', status: 'missed' })]}
      />,
    )
    expect(document.body.textContent).toContain('calendar.dayDetail.completionSummary')
  })

  it('shows completed status badge', () => {
    render(
      <CalendarDayDetail
        open={true}
        onOpenChange={vi.fn()}
        dateStr="2025-06-15"
        entries={[makeEntry({ status: 'completed' })]}
      />,
    )
    expect(document.body.textContent).toContain('calendar.status.completed')
  })

  it('shows missed status badge', () => {
    render(
      <CalendarDayDetail
        open={true}
        onOpenChange={vi.fn()}
        dateStr="2025-06-15"
        entries={[makeEntry({ status: 'missed' })]}
      />,
    )
    expect(document.body.textContent).toContain('calendar.status.missed')
  })

  it('shows upcoming status badge', () => {
    render(
      <CalendarDayDetail
        open={true}
        onOpenChange={vi.fn()}
        dateStr="2025-06-15"
        entries={[makeEntry({ status: 'upcoming' })]}
      />,
    )
    expect(document.body.textContent).toContain('calendar.status.upcoming')
  })

  it('shows bad habit labels (indulged/resisted)', () => {
    render(
      <CalendarDayDetail
        open={true}
        onOpenChange={vi.fn()}
        dateStr="2025-06-15"
        entries={[
          makeEntry({ isBadHabit: true, status: 'completed' }),
          makeEntry({ isBadHabit: true, status: 'missed', habitId: '2' }),
        ]}
      />,
    )
    expect(document.body.textContent).toContain('calendar.status.indulged')
    expect(document.body.textContent).toContain('calendar.status.resisted')
  })

  it('renders go to day link', () => {
    render(
      <CalendarDayDetail
        open={true}
        onOpenChange={vi.fn()}
        dateStr="2025-06-15"
        entries={[]}
      />,
    )
    expect(document.body.textContent).toContain('calendar.goToDay')
    const link = document.querySelector('a[href="/?date=2025-06-15"]')
    expect(link).toBeInTheDocument()
  })

  it('shows due time when present', () => {
    render(
      <CalendarDayDetail
        open={true}
        onOpenChange={vi.fn()}
        dateStr="2025-06-15"
        entries={[makeEntry({ dueTime: '08:00' })]}
      />,
    )
    expect(document.body.textContent).toContain('08:00')
  })

  it('shows recurring checkbox', () => {
    render(
      <CalendarDayDetail
        open={true}
        onOpenChange={vi.fn()}
        dateStr="2025-06-15"
        entries={[makeEntry()]}
      />,
    )
    expect(document.body.textContent).toContain('calendar.showRecurring')
  })
})

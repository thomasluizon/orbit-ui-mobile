import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

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
import { buildCalendarDayMap } from '@orbit/shared/utils'
import {
  createMockHabitScheduleChild,
  createMockHabitScheduleItem,
} from '@orbit/shared/__tests__/factories'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import type { CalendarMonthResponse } from '@orbit/shared/types/habit'

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

interface RenderProps {
  dateStr: string | null
  entries: CalendarDayEntry[]
  showRecurring?: boolean
  onShowRecurringChange?: (value: boolean) => void
}

function renderDetail({
  dateStr,
  entries,
  showRecurring = true,
  onShowRecurringChange = () => {},
}: RenderProps) {
  return render(
    <CalendarDayDetail
      dateStr={dateStr}
      entries={entries}
      showRecurring={showRecurring}
      onShowRecurringChange={onShowRecurringChange}
    />,
  )
}

describe('CalendarDayDetail', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('renders nothing without a selected date', () => {
    const { container } = renderDetail({ dateStr: null, entries: [] })
    expect(container.innerHTML).toBe('')
  })

  it('shows no habits message when entries are empty', () => {
    renderDetail({ dateStr: '2025-06-15', entries: [] })
    expect(document.body.textContent).toContain('calendar.noHabitsScheduled')
  })

  it('renders habit entries', () => {
    renderDetail({
      dateStr: '2025-06-15',
      entries: [makeEntry({ title: 'Read' }), makeEntry({ title: 'Exercise', habitId: '2' })],
    })
    expect(screen.getByText('Read')).toBeInTheDocument()
    expect(screen.getByText('Exercise')).toBeInTheDocument()
  })

  it('shows completion summary', () => {
    renderDetail({
      dateStr: '2025-06-15',
      entries: [makeEntry(), makeEntry({ habitId: '2', status: 'missed' })],
    })
    expect(document.body.textContent).toContain('calendar.dayDetail.completionSummary')
  })

  it('shows completed status badge', () => {
    renderDetail({ dateStr: '2025-06-15', entries: [makeEntry({ status: 'completed' })] })
    expect(document.body.textContent).toContain('calendar.status.completed')
  })

  it('shows missed status badge', () => {
    renderDetail({ dateStr: '2025-06-15', entries: [makeEntry({ status: 'missed' })] })
    expect(document.body.textContent).toContain('calendar.status.missed')
  })

  it('shows no status badge for upcoming habits', () => {
    renderDetail({
      dateStr: '2025-06-15',
      entries: [makeEntry({ title: 'Read', status: 'upcoming' })],
    })
    expect(screen.getByText('Read')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('calendar.status.upcoming')
    expect(document.body.textContent).not.toContain('calendar.status.scheduled')
  })

  it('shows bad habit labels (indulged/resisted)', () => {
    renderDetail({
      dateStr: '2025-06-15',
      entries: [
        makeEntry({ isBadHabit: true, status: 'completed' }),
        makeEntry({ isBadHabit: true, status: 'missed', habitId: '2' }),
      ],
    })
    expect(document.body.textContent).toContain('calendar.status.indulged')
    expect(document.body.textContent).toContain('calendar.status.resisted')
  })

  it('renders go to day link', () => {
    renderDetail({ dateStr: '2025-06-15', entries: [] })
    expect(document.body.textContent).toContain('calendar.goToDay')
    const link = document.querySelector('a[href="/?date=2025-06-15"]')
    expect(link).toBeInTheDocument()
  })

  it('shows due time when present', () => {
    renderDetail({ dateStr: '2025-06-15', entries: [makeEntry({ dueTime: '08:00' })] })
    expect(document.body.textContent).toContain('08:00')
  })

  it('shows the recurring toggle', () => {
    renderDetail({ dateStr: '2025-06-15', entries: [makeEntry()] })
    expect(document.body.textContent).toContain('calendar.showRecurring')
  })

  it('hides recurring habits when showRecurring is off', () => {
    renderDetail({
      dateStr: '2025-06-15',
      showRecurring: false,
      entries: [
        makeEntry({ title: 'Recurring habit', isOneTime: false }),
        makeEntry({ title: 'One-time task', habitId: '2', isOneTime: true }),
      ],
    })
    expect(screen.queryByText('Recurring habit')).not.toBeInTheDocument()
    expect(screen.getByText('One-time task')).toBeInTheDocument()
  })

  it('calls onShowRecurringChange when the switch is toggled', () => {
    const onShowRecurringChange = vi.fn()
    renderDetail({
      dateStr: '2025-06-15',
      entries: [makeEntry()],
      onShowRecurringChange,
    })
    fireEvent.click(screen.getByRole('switch'))
    expect(onShowRecurringChange).toHaveBeenCalledWith(false)
  })

  describe('fitViewport desktop panel', () => {
    function renderFitViewport(entries: CalendarDayEntry[]) {
      return render(
        <CalendarDayDetail
          dateStr="2025-06-15"
          entries={entries}
          showRecurring
          onShowRecurringChange={() => {}}
          fitViewport
        />,
      )
    }

    it('renders the entry rows inside the overflow scroll region', () => {
      const { container } = renderFitViewport([makeEntry({ title: 'Read' })])
      const scroller = container.querySelector('.overflow-y-auto')
      expect(scroller).not.toBeNull()
      expect(within(scroller as HTMLElement).getByText('Read')).toBeInTheDocument()
    })

    it('keeps the go-to-day CTA outside the scroll region, after it', () => {
      const { container } = renderFitViewport([makeEntry({ title: 'Read' })])
      const scroller = container.querySelector('.overflow-y-auto') as HTMLElement
      const cta = container.querySelector('a[href="/?date=2025-06-15"]') as HTMLElement
      expect(scroller.contains(cta)).toBe(false)
      const scrollWrapper = scroller.parentElement as HTMLElement
      expect(scrollWrapper.nextElementSibling).toBe(cta)
    })

    it('keeps bottom clearance without rendering a gradient fade', () => {
      const { container } = renderFitViewport([makeEntry({ title: 'Read' })])
      const scroller = container.querySelector('.overflow-y-auto') as HTMLElement
      const scrollWrapper = scroller.parentElement as HTMLElement
      const fade = scrollWrapper.querySelector('[aria-hidden="true"].pointer-events-none')
      expect(scroller).toHaveStyle({ paddingBottom: '8px' })
      expect(fade).toBeNull()
    })
  })

  describe('mixed-type family', () => {
    const loggedDate = '2026-09-28'

    function badParentWithGoodChildLog(): CalendarMonthResponse {
      return {
        habits: [
          createMockHabitScheduleItem({
            id: 'bad-parent',
            title: 'Bad parent',
            isBadHabit: true,
            frequencyUnit: 'Week',
            dueDate: '2026-09-29',
            scheduledDates: ['2026-09-29'],
            instances: [{ date: '2026-09-29', status: 'Pending', logId: null }],
            children: [
              createMockHabitScheduleChild({
                id: 'good-child',
                title: 'Good child',
                frequencyUnit: 'Week',
                frequencyQuantity: 3,
                dueDate: '2026-10-19',
                scheduledDates: [loggedDate],
                isLoggedInRange: true,
                instances: [{ date: loggedDate, status: 'Completed', logId: 'good-child-log' }],
              }),
            ],
            hasSubHabits: true,
          }),
        ],
        logs: { 'bad-parent': [] },
      }
    }

    it('labels a good sub-habit log under a bad parent as completed, not as a slip', () => {
      const dayMap = buildCalendarDayMap(
        badParentWithGoodChildLog(),
        { from: '2026-09-01', to: '2026-09-30' },
        new Date('2026-09-29T12:00:00'),
      )

      renderDetail({ dateStr: loggedDate, entries: dayMap.get(loggedDate) ?? [] })

      expect(document.body.textContent).not.toContain('calendar.status.indulged')
      const row = screen.getByText('Good child').closest('.gap-3') as HTMLElement
      expect(within(row).getByText('calendar.status.completed').style.color).toBe(
        'var(--status-done)',
      )
      const statusCircle = row.querySelector('[aria-hidden="true"]') as HTMLElement
      expect(statusCircle.style.background).toBe('var(--status-done)')
      expect(screen.queryByText('Bad parent')).toBeNull()
    })
  })
})

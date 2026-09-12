import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

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
import type { CalendarSyncEvent } from '@orbit/shared'
import type { Profile } from '@orbit/shared/types/profile'

type CalendarSyncProfile = Pick<
  Profile,
  | 'hasProAccess'
  | 'hasGoogleConnection'
  | 'googleCalendarAutoSyncEnabled'
  | 'googleCalendarAutoSyncStatus'
  | 'googleCalendarLastSyncedAt'
>

const proSyncProfile: CalendarSyncProfile = {
  hasProAccess: true,
  hasGoogleConnection: true,
  googleCalendarAutoSyncEnabled: true,
  googleCalendarAutoSyncStatus: 'Idle',
  googleCalendarLastSyncedAt: '2026-09-12T09:12:00Z',
}

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
  calendarEvents?: CalendarSyncEvent[]
  syncProfile?: CalendarSyncProfile
  showRecurring?: boolean
  onShowRecurringChange?: (value: boolean) => void
  onCalendarAutoSyncChange?: (value: boolean) => Promise<void>
  onOpenPro?: () => void
}

function renderDetail({
  dateStr,
  entries,
  calendarEvents = [],
  syncProfile = proSyncProfile,
  showRecurring = true,
  onShowRecurringChange = () => {},
  onCalendarAutoSyncChange = async () => {},
  onOpenPro = () => {},
}: RenderProps) {
  return render(
    <CalendarDayDetail
      dateStr={dateStr}
      entries={entries}
      calendarEvents={calendarEvents}
      syncProfile={syncProfile}
      showRecurring={showRecurring}
      onShowRecurringChange={onShowRecurringChange}
      onCalendarAutoSyncChange={onCalendarAutoSyncChange}
      onOpenPro={onOpenPro}
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

  it('renders timed and all-day Google events as read-only context', () => {
    renderDetail({
      dateStr: '2025-06-15',
      entries: [makeEntry({ title: 'Read' })],
      calendarEvents: [
        {
          id: 'event-1',
          title: 'Team meeting',
          description: null,
          startDate: '2025-06-15',
          startTime: '09:00',
          endTime: null,
          isRecurring: false,
          recurrenceRule: null,
          reminders: [],
        },
        {
          id: 'event-2',
          title: 'Company holiday',
          description: null,
          startDate: '2025-06-15',
          startTime: null,
          endTime: null,
          isRecurring: false,
          recurrenceRule: null,
          reminders: [],
        },
      ],
    })

    expect(screen.getByText('calendar.dayDetail.eventsTitle')).toBeInTheDocument()
    const timedEvent = screen.getByRole('img', {
      name: '09:00, Team meeting, calendar.title',
    })
    const allDayEvent = screen.getByRole('img', {
      name: 'calendar.timeGrid.allDay, Company holiday, calendar.title',
    })
    expect(within(timedEvent).queryByRole('button')).toBeNull()
    expect(within(allDayEvent).queryByRole('button')).toBeNull()
  })

  it('keeps habit data visible while replacing Google events with the free plan boundary', () => {
    const onOpenPro = vi.fn()
    renderDetail({
      dateStr: '2025-06-15',
      entries: [makeEntry({ title: 'Read' })],
      calendarEvents: [{
        id: 'event-1', title: 'Team meeting', description: null,
        startDate: '2025-06-15', startTime: '09:00', endTime: null,
        isRecurring: false, recurrenceRule: null, reminders: [],
      }],
      syncProfile: { ...proSyncProfile, hasProAccess: false },
      onOpenPro,
    })

    expect(screen.getByText('Read')).toBeInTheDocument()
    expect(screen.queryByText('Team meeting')).not.toBeInTheDocument()
    expect(screen.getByText('calendar.dayDetail.syncBoundary')).toBeInTheDocument()
    expect(screen.getByText('calendar.dayDetail.syncBoundaryBody')).toBeInTheDocument()
    const upgradeAction = screen.getByRole('button', { name: 'calendar.dayDetail.viewPro' })
    expect(upgradeAction).toHaveAttribute('data-variant', 'primary')
    expect(upgradeAction).not.toBeDisabled()
    expect(screen.getAllByRole('switch')).toHaveLength(1)
    fireEvent.click(upgradeAction)
    expect(onOpenPro).toHaveBeenCalledOnce()
  })

  it('builds the Pro sync line and switch from the profile fields', () => {
    const onCalendarAutoSyncChange = vi.fn(async () => {})
    renderDetail({
      dateStr: '2025-06-15',
      entries: [makeEntry()],
      syncProfile: proSyncProfile,
      onCalendarAutoSyncChange,
    })

    expect(screen.getByText('calendar.dayDetail.googleConnected')).toBeInTheDocument()
    expect(document.body.textContent).toContain('calendar.dayDetail.lastSynced')
    const autoSync = screen.getByRole('switch', { name: 'calendar.dayDetail.autoSync' })
    expect(autoSync).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(autoSync)
    expect(onCalendarAutoSyncChange).toHaveBeenCalledWith(false)
  })

  it('rolls the Pro switch back when auto-sync fails', async () => {
    const onCalendarAutoSyncChange = vi.fn(async () => {
      throw new Error('offline')
    })
    renderDetail({
      dateStr: '2025-06-15',
      entries: [makeEntry()],
      syncProfile: proSyncProfile,
      onCalendarAutoSyncChange,
    })

    const autoSync = screen.getByRole('switch', { name: 'calendar.dayDetail.autoSync' })
    fireEvent.click(autoSync)
    expect(autoSync).toHaveAttribute('aria-checked', 'false')
    await waitFor(() => expect(autoSync).toHaveAttribute('aria-checked', 'true'))
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
    fireEvent.click(screen.getByRole('switch', { name: 'calendar.showRecurring' }))
    expect(onShowRecurringChange).toHaveBeenCalledWith(false)
  })

  describe('fitViewport desktop panel', () => {
    function renderFitViewport(entries: CalendarDayEntry[]) {
      return render(
        <CalendarDayDetail
          dateStr="2025-06-15"
          entries={entries}
          calendarEvents={[]}
          syncProfile={proSyncProfile}
          showRecurring
          onShowRecurringChange={() => {}}
          onCalendarAutoSyncChange={async () => {}}
          onOpenPro={() => {}}
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
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { BlockFrameProps } from '@orbit/shared/contracts/blocks'
import { DaySummaryCard } from '@/components/chat/day-summary-card'
import { StreakCard } from '@/components/chat/streak-card'
import { CalendarCard } from '@/components/chat/calendar-card'

const mocks = vi.hoisted(() => ({ push: vi.fn(), language: 'pt-BR', uses24HourClock: false }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { timeZone: 'Pacific/Honolulu', uses24HourClock: mocks.uses24HourClock } }) }))
vi.mock('next-intl', () => ({ useLocale: () => mocks.language, useTranslations: () => (key: string, values?: Record<string, unknown>) => values ? `${key}:${JSON.stringify(values)}` : key }))
vi.mock('@/components/ui/progress-ring', () => ({ ProgressRing: ({ label }: { label: string }) => <div role="progressbar" aria-label={label} /> }))
vi.mock('@/components/ui/progress-bar', () => ({ ProgressBar: ({ value, max }: { value: number; max: number }) => <div role="progressbar" data-value={value} data-max={max} /> }))
vi.mock('@/components/ui/block-frame', () => ({ BlockFrame: ({ items, body, actions }: BlockFrameProps) => <section>{body}{items.map((item) => <div data-testid="card-row" data-status={item.status} key={item.id}>{item.label}{item.meta}{item.control}</div>)}{actions}</section> }))

describe('Astra status cards on web', () => {
  beforeEach(() => { mocks.push.mockReset(); mocks.language = 'pt-BR'; mocks.uses24HourClock = false })

  it('labels the day ring and opens Today', () => {
    render(<DaySummaryCard daySummary={{ date: '2026-09-26', due: 3, done: 1, completionRate: 33, overdueCount: 2, currentStreak: 4, surfaceId: 'today' }} />)
    expect(screen.getByRole('progressbar', { name: /done.*1.*due.*3/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'chat.daySummary.open' }))
    expect(mocks.push).toHaveBeenCalledWith('/')
  })

  it('keeps overdue visible when nothing is due today', () => {
    render(<DaySummaryCard daySummary={{ date: '2026-09-26', due: 0, done: 0, completionRate: null, overdueCount: 2, currentStreak: 4, surfaceId: 'today' }} />)
    expect(screen.getByText('chat.daySummary.nothingDue')).toBeInTheDocument()
    expect(screen.getByText('chat.daySummary.overdue')).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('shows at most six earned and unearned achievement discs', () => {
    render(<StreakCard streakCard={{ currentStreak: 0, longestStreak: 4, level: 11, totalXp: 12200, xpForNextLevel: 14400, lastActiveDate: null, isFrozenToday: false, recentFreezeDates: [], recentAchievements: [], achievementDiscs: Array.from({ length: 8 }, (_, index) => ({ id: `achievement-${index}`, iconKey: 'satellite', earnedAt: index % 2 ? null : '2026-09-26T10:00:00Z' })), surfaceId: 'progress' }} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('data-value', '100')
    expect(screen.getByRole('progressbar')).toHaveAttribute('data-max', '2300')
    expect(document.querySelectorAll('[data-state="earned"]')).toHaveLength(3)
    expect(document.querySelectorAll('[data-state="unearned"]')).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: 'chat.streakCard.open' }))
    expect(mocks.push).toHaveBeenCalledWith('/progress')
  })

  it('ends the streak strip on the account date across device midnight', () => {
    vi.stubEnv('TZ', 'UTC')
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-09-26T06:00:00Z'))
      render(<StreakCard streakCard={{ currentStreak: 1, longestStreak: 1, level: 1, totalXp: 10, xpForNextLevel: 100, lastActiveDate: '2026-09-25', isFrozenToday: false, recentFreezeDates: [], recentAchievements: [], surfaceId: 'progress' }} />)
      const cells = screen.getAllByRole('img')
      expect(cells.at(-1)).toHaveAttribute('data-state', 'active')
      expect(cells.at(-1)).toHaveAccessibleName(/25/)
    } finally {
      vi.useRealTimers()
      vi.unstubAllEnvs()
    }
  })

  it('renders all ten calendar events without an omitted sync row', () => {
    render(<CalendarCard calendarCard={{ events: Array.from({ length: 10 }, (_, index) => ({ title: `Event ${index}`, start: '2026-09-26', end: null, isAllDay: true })), surfaceId: 'calendar' }} />)
    expect(screen.getAllByTestId('card-row')).toHaveLength(10)
    expect(screen.getByRole('button', { name: 'Event 0' })).toBeInTheDocument()
    expect(screen.getAllByTestId('card-row')[0]).toHaveTextContent('chat.calendarCard.allDay')
    expect(screen.queryByText('chat.calendarCard.sync')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'chat.calendarCard.open' }))
    expect(mocks.push).toHaveBeenCalledWith('/calendar')
  })

  it.each([
    ['pt-BR', false, '7:30 PM', '19:30'],
    ['en', true, '19:30', '7:30 PM'],
  ])('shows a timed calendar event with %s and the saved clock', (language, uses24HourClock, expected, excluded) => {
    mocks.language = language
    mocks.uses24HourClock = uses24HourClock
    render(<CalendarCard calendarCard={{ events: [{ title: 'Meeting', start: '2026-09-26T19:30:00', end: null, isAllDay: false }], surfaceId: 'calendar' }} />)
    expect(screen.getByTestId('card-row')).toHaveTextContent(expected)
    expect(screen.getByTestId('card-row')).not.toHaveTextContent(excluded)
  })

  it('shows disabled sync without a failure mark', () => {
    render(<CalendarCard calendarCard={{ events: [], surfaceId: 'calendar', sync: { enabled: false, status: 'ReconnectRequired', lastSyncedAt: null } }} />)
    const row = screen.getByText(/chat.calendarCard.syncchat.calendarCard.syncState.disabled/)
    expect(row).not.toHaveAttribute('data-status')
  })
})

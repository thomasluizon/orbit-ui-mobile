import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { BlockFrameProps } from '@orbit/shared/contracts/blocks'
import { DaySummaryCard } from '@/components/chat/day-summary-card'
import { StreakCard } from '@/components/chat/streak-card'
import { CalendarCard } from '@/components/chat/calendar-card'

const mocks = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('next-intl', () => ({ useLocale: () => 'pt-BR', useTranslations: () => (key: string, values?: Record<string, unknown>) => values ? `${key}:${JSON.stringify(values)}` : key }))
vi.mock('@/components/ui/progress-ring', () => ({ ProgressRing: ({ label }: { label: string }) => <div role="progressbar" aria-label={label} /> }))
vi.mock('@/components/ui/progress-bar', () => ({ ProgressBar: ({ value, max }: { value: number; max: number }) => <div role="progressbar" data-value={value} data-max={max} /> }))
vi.mock('@/components/ui/block-frame', () => ({ BlockFrame: ({ items, body, actions }: BlockFrameProps) => <section>{body}{items.map((item) => <div data-testid="card-row" data-status={item.status} key={item.id}>{item.label}{item.meta}{item.control}</div>)}{actions}</section> }))

describe('Astra status cards on web', () => {
  beforeEach(() => mocks.push.mockReset())

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

  it('renders all ten calendar events without an omitted sync row', () => {
    render(<CalendarCard calendarCard={{ events: Array.from({ length: 10 }, (_, index) => ({ title: `Event ${index}`, start: '2026-09-26', end: null, isAllDay: true })), surfaceId: 'calendar' }} />)
    expect(screen.getAllByTestId('card-row')).toHaveLength(10)
    expect(screen.queryByText('chat.calendarCard.sync')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'chat.calendarCard.open' }))
    expect(mocks.push).toHaveBeenCalledWith('/calendar')
  })

  it('shows disabled sync without a failure mark', () => {
    render(<CalendarCard calendarCard={{ events: [], surfaceId: 'calendar', sync: { enabled: false, status: 'ReconnectRequired', lastSyncedAt: null } }} />)
    const row = screen.getByText(/chat.calendarCard.syncchat.calendarCard.syncState.disabled/)
    expect(row).not.toHaveAttribute('data-status')
  })
})

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MetricsCard as MetricsCardData } from '@orbit/shared/types/chat'
import { MetricsCard } from '@/components/chat/metrics-card'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string, values?: { done?: number; scheduled?: number; name?: string }) =>
    key === 'charts.bar.readout' ? `${values?.done} of ${values?.scheduled}` : key,
}))

const series = (count: number) => ({ granularity: 'day' as const, points: Array.from({ length: count }, (_, index) => ({
  startDate: `2026-09-${String(index + 1).padStart(2, '0')}`,
  endDate: `2026-09-${String(index + 1).padStart(2, '0')}`,
  scheduled: 2, completed: 1, completionRate: 50,
})) })
const overview: MetricsCardData = {
  period: 'week', completionRate: 50, totalCompletions: 7, totalScheduled: 14,
  activeDays: 7, currentStreak: 2, bestStreak: 4, hasData: true,
  surfaceId: 'progress', series: series(7), topHabitName: 'Walk',
}

beforeEach(() => {
  push.mockClear()
  vi.stubGlobal('ResizeObserver', class {
    observe() { this.callback([{ contentRect: { width: 320 } }]) }
    disconnect() {}
    constructor(private callback: (entries: { contentRect: { width: number } }[]) => void) {}
  })
})

describe('Astra metrics card on web', () => {
  it('renders overview rows, seven bars and the Progress chip', () => {
    const { container } = render(<MetricsCard metricsCard={overview} />)
    expect(container.querySelectorAll('[data-status]')).toHaveLength(0)
    expect(screen.getByText('chat.metrics.completionRate')).toBeInTheDocument()
    expect(screen.getByText('chat.metrics.daysLogged')).toBeInTheDocument()
    expect(screen.getByText('chat.metrics.topHabit')).toBeInTheDocument()
    expect(container.querySelectorAll('svg path')).toHaveLength(7)
    fireEvent.click(screen.getByRole('button', { name: 'chat.metrics.progressLink' }))
    expect(push).toHaveBeenCalledWith('/progress')
  })

  it('renders one habit with thirty bars and a habit chip', () => {
    const habitId = '92ca0543-c3e1-4f41-9370-c55e1bfa8157'
    const { container } = render(<MetricsCard metricsCard={{ ...overview, period: 'habit', habitId, habitTitle: 'Walk', monthlyCompletionRate: 60, series: series(30) }} />)
    expect(screen.getByText('chat.metrics.currentStreak')).toBeInTheDocument()
    expect(screen.getByText('chat.metrics.longestStreak')).toBeInTheDocument()
    expect(screen.getByText('chat.metrics.monthlyRate')).toBeInTheDocument()
    expect(container.querySelectorAll('svg path')).toHaveLength(30)
    fireEvent.click(screen.getByRole('button', { name: 'chat.metrics.habitLink' }))
    expect(push).toHaveBeenCalledWith(`/habits/${habitId}`)
  })

  it('shows one empty line and no chart when the series is unavailable', () => {
    const { container } = render(<MetricsCard metricsCard={{ ...overview, hasData: false, series: null }} />)
    expect(screen.getByText('chat.metrics.empty')).toBeInTheDocument()
    expect(container.querySelectorAll('svg path')).toHaveLength(0)
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })
})

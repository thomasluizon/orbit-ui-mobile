import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MetricsCard as MetricsCardData } from '@orbit/shared/types/chat'
import { MetricsCard } from '@/components/chat/metrics-card'

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string, values?: { done?: number; scheduled?: number; name?: string }) =>
    key === 'charts.bar.readout' ? `${values?.done} of ${values?.scheduled}` : key === 'chat.metrics.habitTitle' ? `Metrics for ${values?.name}` : key,
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
    expect(screen.getByRole('link', { name: 'chat.metrics.progressLink' })).toHaveAttribute('href', '/progress')
  })

  it('renders one habit with thirty bars and a habit chip', () => {
    const habitId = '92ca0543-c3e1-4f41-9370-c55e1bfa8157'
    const { container } = render(<MetricsCard metricsCard={{ ...overview, period: 'habit', habitId, habitTitle: 'Walk', monthlyCompletionRate: 60, series: series(30) }} />)
    expect(screen.getByText('chat.metrics.currentStreak')).toBeInTheDocument()
    expect(screen.getByText('chat.metrics.longestStreak')).toBeInTheDocument()
    expect(screen.getByText('chat.metrics.monthlyRate')).toBeInTheDocument()
    expect(container.querySelectorAll('svg path')).toHaveLength(30)
    expect(screen.getByRole('link', { name: 'chat.metrics.habitLink' })).toHaveAttribute('href', `/habits/${habitId}`)
  })

  it('shows one empty line and no chart when the series is unavailable', () => {
    const { container } = render(<MetricsCard metricsCard={{ ...overview, hasData: false, series: null }} />)
    expect(screen.getByText('chat.metrics.empty')).toBeInTheDocument()
    expect(container.querySelectorAll('svg path')).toHaveLength(0)
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('hides an all-null series and wraps row labels', () => {
    const emptySeries = { ...series(7), points: series(7).points.map((point) => ({ ...point, scheduled: 0, completed: 0, completionRate: null })) }
    const { container } = render(<MetricsCard metricsCard={{ ...overview, series: emptySeries }} />)
    expect(container.querySelectorAll('svg path')).toHaveLength(0)
    expect(screen.getByText('chat.metrics.topHabit')).toHaveClass('break-words')
  })

  it('uses the generic title when a habit has no name', () => {
    render(<MetricsCard metricsCard={{ ...overview, habitId: '92ca0543-c3e1-4f41-9370-c55e1bfa8157', habitTitle: null }} />)
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('chat.metrics.title')
  })

  it('keeps a long habit title readable', () => {
    render(<MetricsCard metricsCard={{ ...overview, habitId: '92ca0543-c3e1-4f41-9370-c55e1bfa8157', habitTitle: 'A very long walking habit name that must remain readable' }} />)
    const title = screen.getByRole('heading', { level: 3 })
    expect(title).toHaveTextContent('A very long walking habit name')
    expect(title).not.toHaveClass('truncate')
  })
})

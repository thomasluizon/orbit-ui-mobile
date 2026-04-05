import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}))

import { GoalMetricsPanel } from '@/components/goals/goal-metrics-panel'
import type { GoalMetrics } from '@orbit/shared/types/goal'

function makeMetrics(overrides: Partial<GoalMetrics> = {}): GoalMetrics {
  return {
    trackingStatus: 'on_track',
    projectedCompletionDate: '2025-06-15T00:00:00Z',
    velocityPerDay: 2.5,
    habitAdherence: [],
    ...overrides,
  } as GoalMetrics
}

describe('GoalMetricsPanel', () => {
  it('renders loading skeleton', () => {
    const { container } = render(
      <GoalMetricsPanel metrics={null} unit="km" isLoading={true} />,
    )
    const pulseElements = container.querySelectorAll('.animate-pulse')
    expect(pulseElements.length).toBeGreaterThan(0)
  })

  it('renders nothing when metrics is null and not loading', () => {
    const { container } = render(
      <GoalMetricsPanel metrics={null} unit="km" isLoading={false} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders on_track status badge', () => {
    render(<GoalMetricsPanel metrics={makeMetrics()} unit="km" isLoading={false} />)
    expect(screen.getByText('goals.metrics.onTrack')).toBeInTheDocument()
  })

  it('renders at_risk status badge', () => {
    render(
      <GoalMetricsPanel
        metrics={makeMetrics({ trackingStatus: 'at_risk' })}
        unit="km"
        isLoading={false}
      />,
    )
    expect(screen.getByText('goals.metrics.atRisk')).toBeInTheDocument()
  })

  it('renders behind status badge', () => {
    render(
      <GoalMetricsPanel
        metrics={makeMetrics({ trackingStatus: 'behind' })}
        unit="km"
        isLoading={false}
      />,
    )
    expect(screen.getByText('goals.metrics.behind')).toBeInTheDocument()
  })

  it('renders no_deadline status badge', () => {
    render(
      <GoalMetricsPanel
        metrics={makeMetrics({ trackingStatus: 'no_deadline' })}
        unit="km"
        isLoading={false}
      />,
    )
    expect(screen.getByText('goals.metrics.noDeadline')).toBeInTheDocument()
  })

  it('renders velocity', () => {
    render(<GoalMetricsPanel metrics={makeMetrics()} unit="km" isLoading={false} />)
    expect(screen.getByText(/2.5 km/)).toBeInTheDocument()
  })

  it('renders no data for zero velocity', () => {
    render(
      <GoalMetricsPanel
        metrics={makeMetrics({ velocityPerDay: 0 })}
        unit="km"
        isLoading={false}
      />,
    )
    const noDataElements = screen.getAllByText('goals.metrics.noData')
    expect(noDataElements.length).toBeGreaterThanOrEqual(1)
  })

  it('renders habit adherence when present', () => {
    const metrics = makeMetrics({
      habitAdherence: [
        { habitId: 'h1', habitTitle: 'Run daily', weeklyCompletionRate: 85, monthlyCompletionRate: 80, currentStreak: 5 },
      ],
    })
    render(<GoalMetricsPanel metrics={metrics} unit="km" isLoading={false} />)
    expect(screen.getByText('Run daily')).toBeInTheDocument()
    expect(screen.getByText('85%')).toBeInTheDocument()
  })
})

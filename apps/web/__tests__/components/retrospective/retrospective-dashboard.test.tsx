import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type {
  RetrospectiveMetrics,
  RetrospectiveResponse,
} from '@orbit/shared/utils/retrospective'
import { RetrospectiveDashboard } from '@/app/(app)/retrospective/_components/retrospective-dashboard'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}(${JSON.stringify(params)})` : key,
}))

vi.mock('@/components/ui/stat-tile', () => ({
  StatTile: ({ value, label }: { value: unknown; label: string }) => (
    <div data-testid="stat-tile">
      {String(value)}::{label}
    </div>
  ),
}))

vi.mock('@/components/share/share-card-entry-button', () => ({
  ShareCardEntryButton: () => <div data-testid="share-entry" />,
}))

vi.mock('@/components/wrapped/wrapped-entry-button', () => ({
  WrappedEntryButton: () => <div data-testid="wrapped-entry" />,
}))

function buildMetrics(overrides?: Partial<RetrospectiveMetrics>): RetrospectiveMetrics {
  return {
    completionRate: 82,
    totalCompletions: 40,
    totalScheduled: 50,
    activeDays: 6,
    periodDays: 7,
    currentStreak: 5,
    bestStreak: 9,
    badHabitSlips: 1,
    weeklyConsistency: [0, 50, 120, 75, 88, 30, 10],
    topHabits: [
      { name: 'Read', emoji: '📖', completionRate: 90, completedCount: 6, scheduledCount: 7, isOneTime: false },
      { name: 'Ship v1', emoji: null, completionRate: 100, completedCount: 1, scheduledCount: 1, isOneTime: true },
      { name: 'Taxes', emoji: '🧾', completionRate: 0, completedCount: 0, scheduledCount: 1, isOneTime: true },
    ],
    needsAttention: [
      { name: 'Floss', emoji: '🦷', completionRate: 20, completedCount: 1, scheduledCount: 5, isOneTime: false },
    ],
    ...overrides,
  }
}

function buildData(overrides?: Partial<RetrospectiveResponse>): RetrospectiveResponse {
  return {
    period: 'week',
    fromCache: false,
    narrative: {
      highlights: 'You **crushed** it',
      missed: 'Missed one leg day',
      trends: 'Up and to the right',
      suggestion: 'Try mornings',
    },
    metrics: buildMetrics(),
    ...overrides,
  }
}

function renderDashboard(overrides?: {
  data?: RetrospectiveResponse
  fromCache?: boolean
  isOnline?: boolean
  onRegenerate?: () => void
}) {
  const onRegenerate = overrides?.onRegenerate ?? vi.fn()
  render(
    <RetrospectiveDashboard
      data={overrides?.data ?? buildData()}
      fromCache={overrides?.fromCache ?? false}
      isOnline={overrides?.isOnline ?? true}
      onRegenerate={onRegenerate}
    />,
  )
  return { onRegenerate }
}

describe('RetrospectiveDashboard', () => {
  it('renders one weekly bar per day and clamps out-of-range values into the label', () => {
    renderDashboard()
    const bars = screen.getAllByRole('img')
    expect(bars).toHaveLength(7)
    expect(screen.getByRole('img', { name: /"percent":100/ })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /"percent":0/ })).toBeInTheDocument()
  })

  it('labels recurring habits by rate and one-time habits by completion status', () => {
    renderDashboard()
    expect(screen.getByText('90%')).toBeInTheDocument()
    expect(screen.getByText('retrospective.completed')).toBeInTheDocument()
    expect(screen.getByText('retrospective.notCompleted')).toBeInTheDocument()
    expect(screen.getByText('•')).toBeInTheDocument()
  })

  it('renders the needs-attention list when there are struggling habits', () => {
    renderDashboard()
    expect(screen.getByText('retrospective.needsAttentionTitle')).toBeInTheDocument()
    expect(screen.getByText('Floss')).toBeInTheDocument()
    expect(screen.getByText('20%')).toBeInTheDocument()
  })

  it('omits the top and needs-attention sections when both are empty', () => {
    renderDashboard({
      data: buildData({ metrics: buildMetrics({ topHabits: [], needsAttention: [] }) }),
    })
    expect(screen.queryByText('retrospective.topHabitsTitle')).toBeNull()
    expect(screen.queryByText('retrospective.needsAttentionTitle')).toBeNull()
  })

  it('renders inline bold markdown inside the narrative', () => {
    renderDashboard()
    const strong = screen.getByText('crushed')
    expect(strong.tagName).toBe('STRONG')
  })

  it('disables regeneration while offline and fires it while online', () => {
    const { onRegenerate } = renderDashboard({ isOnline: false })
    const button = screen.getByRole('button', { name: 'retrospective.regenerate' })
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(onRegenerate).not.toHaveBeenCalled()

    const online = renderDashboard({ isOnline: true })
    fireEvent.click(screen.getAllByRole('button', { name: 'retrospective.regenerate' })[1]!)
    expect(online.onRegenerate).toHaveBeenCalledTimes(1)
  })

  it('shows the cached marker only when the data came from cache', () => {
    renderDashboard({ fromCache: true })
    expect(screen.getByText('retrospective.cached')).toBeInTheDocument()
  })

  it('hides the cached marker for a fresh generation', () => {
    renderDashboard({ fromCache: false })
    expect(screen.queryByText('retrospective.cached')).toBeNull()
  })
})

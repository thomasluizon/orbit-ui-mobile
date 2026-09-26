import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PeriodInsightCard as PeriodInsightData } from '@orbit/shared/types/chat'
import { PeriodInsightCard } from '@/components/chat/period-insight-card'

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string, values?: { done?: number; scheduled?: number }) =>
    key === 'charts.bar.readout' ? `${values?.done} of ${values?.scheduled}` : key,
}))

const insight: PeriodInsightData = {
  period: 'week', dateFrom: '2026-09-01', dateTo: '2026-09-07', completionRate: 50,
  activeDays: 4, periodDays: 7, totalCompletions: 7, totalScheduled: 14,
  currentStreak: 2, bestStreak: 5,
  topHabits: [{ name: 'Walk', emoji: null, completionRate: 80, completedCount: 4, scheduledCount: 5 }],
  needsAttention: [{ name: 'Read', emoji: null, completionRate: 20, completedCount: 1, scheduledCount: 5 }],
  narrative: { highlights: 'Walked', trends: 'Mornings', suggestion: 'Start small', missed: 'Reading' },
  series: { granularity: 'day', points: Array.from({ length: 7 }, (_, index) => ({
    startDate: `2026-09-0${index + 1}`, endDate: `2026-09-0${index + 1}`,
    scheduled: 2, completed: 1, completionRate: 50,
  })) },
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() { this.callback([{ contentRect: { width: 320 } }]) }
    disconnect() {}
    constructor(private callback: (entries: { contentRect: { width: number } }[]) => void) {}
  })
})

describe('period insight card on web', () => {
  it('shows figures, chart, four pages and routes to Progress', () => {
    const { container } = render(<PeriodInsightCard periodInsight={insight} />)
    expect(container.querySelectorAll('svg path')).toHaveLength(7)
    expect(screen.getByText('chat.insight.completionRate')).toBeInTheDocument()
    expect(screen.getByText('chat.insight.needsAttention: Read')).toBeInTheDocument()
    expect(container.querySelectorAll('ol li')).toHaveLength(4)
    expect(container.querySelector('ol li[aria-current="step"]')).toBe(container.querySelector('ol li:first-child'))
    fireEvent.click(screen.getByRole('button', { name: 'chat.insight.next' }))
    expect(screen.getByText('Walked')).toBeInTheDocument()
    expect(container.querySelector('ol li[aria-current="step"]')).toBe(container.querySelector('ol li:nth-child(2)'))
    fireEvent.click(screen.getByRole('button', { name: 'chat.insight.next' }))
    expect(screen.getByText('Mornings')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'chat.insight.next' }))
    expect(screen.getByText('Start small')).toBeInTheDocument()
    expect(screen.queryByText('Reading')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'chat.insight.progressLink' })).toHaveAttribute('href', '/progress')
  })

  it('keeps Missed when it is the only narrative page', () => {
    const { container } = render(<PeriodInsightCard periodInsight={{ ...insight, narrative: { highlights: '', trends: '', suggestion: '', missed: 'Reading' } }} />)
    expect(container.querySelectorAll('ol li')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'chat.insight.next' }))
    expect(screen.getByText('Reading')).toBeInTheDocument()
  })

  it('keeps one page with empty narrative and omits a missing chart', () => {
    const { container } = render(<PeriodInsightCard periodInsight={{ ...insight, series: null, narrative: { highlights: '', trends: '', suggestion: '', missed: '' } }} />)
    expect(container.querySelectorAll('ol li')).toHaveLength(1)
    expect(container.querySelectorAll('svg path')).toHaveLength(0)
  })

  it('keeps the full habit name available in the insight row', () => {
    const name = 'A very long walking habit name that needs multiple lines to remain readable'
    render(<PeriodInsightCard periodInsight={{ ...insight, needsAttention: [{ ...insight.needsAttention[0]!, name }] }} />)
    const label = screen.getByText(`chat.insight.needsAttention: ${name}`)
    expect(label).toHaveClass('break-words')
    expect(label).not.toHaveClass('truncate')
  })
})

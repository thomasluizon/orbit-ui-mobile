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
  it('starts with scoped figures and reveals all useful detail deliberately', () => {
    const { container } = render(<PeriodInsightCard periodInsight={insight} />)
    expect(container.querySelectorAll('[data-testid="bar-chart"] svg path')).toHaveLength(7)
    expect(screen.getByText('chat.insight.completionRate')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'chat.insight.title' })).toBeInTheDocument()
    expect(screen.queryByText('chat.insight.currentStreak')).not.toBeInTheDocument()
    expect(screen.queryByText('chat.insight.bestStreak')).not.toBeInTheDocument()
    expect(screen.getByText('Sep 1, 2026 - Sep 7, 2026')).toBeInTheDocument()
    expect(screen.queryByText('Walked')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'chat.habitList.more' }))
    for (const text of ['Walked', 'Mornings', 'Start small', 'Reading']) expect(screen.getByText(text)).toBeInTheDocument()
    expect(screen.getByText('chat.insight.currentStreak').parentElement?.parentElement).toHaveTextContent('2')
    expect(screen.getByText('chat.insight.bestStreak').parentElement?.parentElement).toHaveTextContent('5')
    expect(screen.getByText('Reading').closest('[aria-live="polite"]')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'chat.readBlock.less' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'chat.readBlock.less' })).toHaveAttribute('aria-haspopup', 'false')
    expect(screen.getByRole('button', { name: 'chat.insight.needsAttention: Read' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'chat.readBlock.less' }))
    expect(screen.queryByText('Reading')).not.toBeInTheDocument()
    expect(screen.queryByText('chat.insight.currentStreak')).not.toBeInTheDocument()
    expect(screen.queryByText('chat.insight.bestStreak')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'chat.habitList.more' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('link', { name: 'chat.insight.progressLink' })).toHaveAttribute('href', '/progress')
  })

  it('omits a missing chart and retains empty narrative defaults', () => {
    const { container } = render(<PeriodInsightCard periodInsight={{ ...insight, series: null, narrative: { highlights: '', trends: '', suggestion: '', missed: '' } }} />)
    expect(container.querySelectorAll('[data-testid="bar-chart"] svg path')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'chat.habitList.more' }))
    expect(screen.queryByText('chat.insight.highlights')).not.toBeInTheDocument()
  })

  it('keeps the full habit name available in the insight row', () => {
    const name = 'A very long walking habit name that needs multiple lines to remain readable'
    render(<PeriodInsightCard periodInsight={{ ...insight, needsAttention: [{ ...insight.needsAttention[0]!, name }] }} />)
    fireEvent.click(screen.getByRole('button', { name: 'chat.habitList.more' }))
    const disclosure = screen.getByRole('button', { name: `chat.insight.needsAttention: ${name}` })
    expect(disclosure).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(disclosure)
    expect(disclosure).toHaveAttribute('aria-expanded', 'true')
    expect(disclosure.parentElement).toHaveTextContent(name)
  })
})

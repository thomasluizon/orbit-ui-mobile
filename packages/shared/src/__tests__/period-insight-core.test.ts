import { describe, expect, it } from 'vitest'
import { getInsightPages } from '../chat/period-insight-core'
import type { PeriodInsightCard } from '../types/chat'

const card: PeriodInsightCard = {
  period: 'month', dateFrom: '2026-09-01', dateTo: '2026-09-30', completionRate: 75,
  activeDays: 18, periodDays: 30, totalCompletions: 35, totalScheduled: 46,
  currentStreak: 2, bestStreak: 8, topHabits: [], needsAttention: [],
  narrative: { highlights: 'Kept walking', trends: 'More mornings', suggestion: 'Start small', missed: 'Missed reading' },
}

describe('period insight page order', () => {
  it('keeps four pages and leaves Missed out when all sections have text', () => {
    expect(getInsightPages(card).map((page) => page.titleKey)).toEqual([
      'chat.insight.overview', 'chat.insight.highlights', 'chat.insight.trends', 'chat.insight.suggestion',
    ])
  })

  it('shows Missed when it is the only non-empty narrative section', () => {
    expect(getInsightPages({ ...card, narrative: { highlights: ' ', trends: '', suggestion: '', missed: 'Missed reading' } })
      .map((page) => page.titleKey)).toEqual(['chat.insight.overview', 'chat.insight.missed'])
  })

  it('keeps only Overview when every narrative section is empty', () => {
    expect(getInsightPages({ ...card, narrative: { highlights: '', trends: ' ', suggestion: '', missed: '' } })
      .map((page) => page.titleKey)).toEqual(['chat.insight.overview'])
  })
})

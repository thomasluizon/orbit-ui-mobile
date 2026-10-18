import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { createMockRecap, createMockRetrospectiveMetrics } from '@orbit/shared/__tests__/factories'
import { PADDING, SPACING } from '@orbit/shared/theme'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (key === 'shareCard.weeklyBarLabel') return String(params?.day)
    return params ? `${key}:${JSON.stringify(params)}` : key
  },
}))

vi.mock('@/components/share/share-card-qr', () => ({
  ShareCardQr: () => null,
}))

import { ShareCard } from '@/components/share/share-card'

describe('ShareCard', () => {
  it('reads the shared card inset for progress sharing', () => {
    const originalInset = PADDING.cardInset
    try {
      PADDING.cardInset = SPACING.s48
      render(<ShareCard recap={createMockRecap()} variant="progress" />)
      expect(screen.getByTestId('share-card')).toHaveStyle({ padding: `${PADDING.cardInset}px` })
    } finally {
      PADDING.cardInset = originalInset
    }
  })

  it('restores the progress figures while retaining the Wrapped figures', () => {
    const recap = createMockRecap({ metrics: createMockRetrospectiveMetrics({ activeDays: 5, completionRate: 73.5 }) })
    render(<ShareCard recap={recap} variant="progress" />)
    expect(screen.getByText('shareCard.stats.activeDays')).toBeInTheDocument()
    expect(screen.getByText('shareCard.stats.completionRate')).toBeInTheDocument()
    expect(screen.getByText('74%')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('renders the branded capture target at the 9 by 16 story ratio', () => {
    const { container } = render(<ShareCard recap={createMockRecap()} />)
    expect(screen.getByTestId('share-card')).toHaveStyle({ width: '360px', height: '640px' })
    expect(container.querySelector('[data-asset="orbit-mark-accent"]')).toBeInTheDocument()
  })

  it('contains no controls and exactly one primary figure with two supporting figures', () => {
    const { container } = render(<ShareCard recap={createMockRecap()} />)
    const card = screen.getByTestId('share-card')

    expect(within(card).getAllByTestId('share-card-figure')).toHaveLength(3)
    expect(container.querySelector('button, a, input, select, textarea, [role="button"]')).toBeNull()
  })

  it('prints the same three-letter weekday form as the weekday page', () => {
    const recap = createMockRecap({
      metrics: createMockRetrospectiveMetrics({ weeklyConsistency: [91, 20, 30, 40, 50, 60, 70] }),
    })
    render(<ShareCard recap={recap} />)

    expect(screen.getByTestId('share-card-weekday')).toHaveTextContent('dates.daysShort.monday')
  })

  it('renders closed goals for a goal-only recap', () => {
    render(
      <ShareCard
        recap={createMockRecap({
          goalCompletions: 3,
          shareDeepLink: '',
          metrics: createMockRetrospectiveMetrics({
            completionRate: 0,
            totalCompletions: 0,
            bestStreak: 0,
            currentStreak: 0,
            activeDays: 0,
            topHabits: [],
            weeklyConsistency: [0, 0, 0, 0, 0, 0, 0],
          }),
        })}
      />,
    )

    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('shareCard.stats.goalsClosed')).toBeInTheDocument()
  })
})

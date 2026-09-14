import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { createMockRecap, createMockRetrospectiveMetrics } from '@orbit/shared/__tests__/factories'

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
})

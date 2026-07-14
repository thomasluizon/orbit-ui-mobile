import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { achievementEmoji } from '@orbit/shared/utils'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}(${JSON.stringify(params)})` : key,
}))

vi.mock('@/components/share/share-card-qr', () => ({
  ShareCardQr: ({ value }: { value: string }) => <div data-testid="qr">{value}</div>,
}))

import { MilestoneShareCard } from '@/components/milestone-share/milestone-share-card'

describe('MilestoneShareCard', () => {
  it('renders the streak variant with the day count and streak eyebrow', () => {
    render(<MilestoneShareCard variant={{ kind: 'streak', streak: 30 }} referralUrl="https://useorbit.org/r/XY" />)
    expect(screen.getByText('30 🔥')).toBeInTheDocument()
    expect(screen.getByText('milestoneShare.streakEyebrow')).toBeInTheDocument()
  })

  it('renders the achievement variant with its emoji, name, and rarity', () => {
    render(
      <MilestoneShareCard
        variant={{ kind: 'achievement', achievementId: 'first_habit', iconKey: 'first_habit', rarity: 'Rare' }}
        referralUrl="https://useorbit.org/r/XY"
      />,
    )
    expect(screen.getByText(achievementEmoji('first_habit'))).toBeInTheDocument()
    expect(screen.getByText('gamification.achievements.first_habit.name')).toBeInTheDocument()
    expect(screen.getByText('milestoneShare.rarity.Rare')).toBeInTheDocument()
    expect(screen.getByText('milestoneShare.achievementEyebrow')).toBeInTheDocument()
  })

  it('strips the protocol for the short-link footer and renders the QR', () => {
    render(<MilestoneShareCard variant={{ kind: 'streak', streak: 5 }} referralUrl="https://useorbit.org/r/ABC" />)
    expect(screen.getByText('useorbit.org/r/ABC')).toBeInTheDocument()
    expect(screen.getByTestId('qr')).toHaveTextContent('https://useorbit.org/r/ABC')
  })

  it('forwards the capture ref to the card root', () => {
    const ref = React.createRef<HTMLDivElement>()
    render(<MilestoneShareCard ref={ref} variant={{ kind: 'streak', streak: 1 }} referralUrl="https://useorbit.org/r/A" />)
    expect(ref.current).toBe(screen.getByTestId('milestone-share-card'))
  })
})

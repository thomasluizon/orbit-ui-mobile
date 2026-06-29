import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
}))

const mockUseReferral = vi.fn(() => ({
  stats: { successfulReferrals: 2, maxReferrals: 10 },
  isLoading: false,
}))

vi.mock('@/hooks/use-referral', () => ({
  useReferral: () => mockUseReferral(),
}))

import { ProfileSummaryCard } from '@/app/(app)/profile/_components/profile-summary-card'

const baseProps = {
  name: 'Ada Lovelace',
  isLoading: false,
  showPlanBadge: true,
  planBadgeTone: 'violet' as const,
  planBadgeLabel: 'PRO',
  levelLine: 'Nível 3',
  streak: 5,
  achievementsValue: 7,
  achievementsLocked: false,
  showAchievements: true,
  onEditName: vi.fn(),
  onStreakClick: vi.fn(),
  onAchievementsClick: vi.fn(),
  onInvite: vi.fn(),
}

describe('ProfileSummaryCard', () => {
  it('renders the identity: name, level line, and plan badge', () => {
    render(<ProfileSummaryCard {...baseProps} />)

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByText('Nível 3')).toBeInTheDocument()
    expect(screen.getByText('PRO')).toBeInTheDocument()
  })

  it('wires the edit, stat, and invite actions to their callbacks', () => {
    const onEditName = vi.fn()
    const onStreakClick = vi.fn()
    const onAchievementsClick = vi.fn()
    const onInvite = vi.fn()

    render(
      <ProfileSummaryCard
        {...baseProps}
        onEditName={onEditName}
        onStreakClick={onStreakClick}
        onAchievementsClick={onAchievementsClick}
        onInvite={onInvite}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'profile.editName.title' }))
    expect(onEditName).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: 'streakDisplay.title' }))
    expect(onStreakClick).toHaveBeenCalledOnce()

    fireEvent.click(
      screen.getByRole('button', { name: 'gamification.profileCard.tileLabel' }),
    )
    expect(onAchievementsClick).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: /referral\.card\.title/ }))
    expect(onInvite).toHaveBeenCalledOnce()
  })

  it('hides the achievement stat when showAchievements is false', () => {
    render(<ProfileSummaryCard {...baseProps} showAchievements={false} />)

    expect(
      screen.queryByRole('button', { name: 'gamification.profileCard.tileLabel' }),
    ).not.toBeInTheDocument()
  })

  it('renders a skeleton instead of the identity while loading', () => {
    render(<ProfileSummaryCard {...baseProps} isLoading />)

    expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument()
  })
})

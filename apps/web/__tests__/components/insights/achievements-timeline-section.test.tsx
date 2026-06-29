import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const { useGamificationProfileMock } = vi.hoisted(() => ({
  useGamificationProfileMock: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}))

vi.mock('@/hooks/use-gamification', () => ({
  useGamificationProfile: useGamificationProfileMock,
}))

import { AchievementsTimelineSection } from '@/components/insights/achievements-timeline-section'

describe('AchievementsTimelineSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the localized achievement name, not the raw API name', () => {
    useGamificationProfileMock.mockReturnValue({
      profile: { achievementsEarned: 1, achievementsTotal: 29 },
      earnedAchievements: [
        { id: 'week_warrior', name: 'Week Warrior', earnedAtUtc: '2026-06-27T10:00:00Z' },
      ],
      isLoading: false,
      isError: false,
    })

    render(<AchievementsTimelineSection />)

    expect(
      screen.getByText('gamification.achievements.week_warrior.name'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Week Warrior')).toBeNull()
  })
})

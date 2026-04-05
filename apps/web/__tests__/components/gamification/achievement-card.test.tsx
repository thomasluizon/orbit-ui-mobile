import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`
    return key
  },
  useLocale: () => 'en',
}))

import { AchievementCard } from '@/components/gamification/achievement-card'
import type { Achievement } from '@orbit/shared/types/gamification'

const baseAchievement: Achievement = {
  id: 'first_habit',
  name: 'First Habit',
  description: 'Create your first habit',
  category: 'GettingStarted',
  rarity: 'Common',
  xpReward: 50,
  iconKey: 'star',
  isEarned: false,
  earnedAtUtc: null,
}

describe('AchievementCard', () => {
  it('renders earned state with star emoji', () => {
    render(
      <AchievementCard
        achievement={baseAchievement}
        earned={true}
        earnedDate="2025-01-15T10:00:00Z"
      />,
    )
    expect(document.body.textContent).toContain('\u2B50')
  })

  it('renders locked state with lock emoji', () => {
    render(
      <AchievementCard
        achievement={baseAchievement}
        earned={false}
        earnedDate={null}
      />,
    )
    expect(document.body.textContent).toContain('\uD83D\uDD12')
  })

  it('displays achievement name via i18n key', () => {
    render(
      <AchievementCard
        achievement={baseAchievement}
        earned={true}
        earnedDate="2025-01-15T10:00:00Z"
      />,
    )
    expect(document.body.textContent).toContain('gamification.achievements.first_habit.name')
  })

  it('displays achievement description via i18n key', () => {
    render(
      <AchievementCard
        achievement={baseAchievement}
        earned={false}
        earnedDate={null}
      />,
    )
    expect(document.body.textContent).toContain('gamification.achievements.first_habit.description')
  })

  it('displays rarity badge', () => {
    render(
      <AchievementCard
        achievement={baseAchievement}
        earned={false}
        earnedDate={null}
      />,
    )
    expect(document.body.textContent).toContain('gamification.rarity.common')
  })

  it('displays XP reward', () => {
    render(
      <AchievementCard
        achievement={baseAchievement}
        earned={false}
        earnedDate={null}
      />,
    )
    expect(document.body.textContent).toContain('gamification.xpReward')
  })

  it('shows earned date when earned', () => {
    render(
      <AchievementCard
        achievement={baseAchievement}
        earned={true}
        earnedDate="2025-01-15T10:00:00Z"
      />,
    )
    expect(document.body.textContent).toContain('gamification.page.earnedOn')
  })

  it('does not show earned date when not earned', () => {
    render(
      <AchievementCard
        achievement={baseAchievement}
        earned={false}
        earnedDate={null}
      />,
    )
    expect(document.body.textContent).not.toContain('gamification.page.earnedOn')
  })

  it('applies reduced opacity for locked cards', () => {
    const { container } = render(
      <AchievementCard
        achievement={baseAchievement}
        earned={false}
        earnedDate={null}
      />,
    )
    const card = container.firstChild as HTMLElement
    expect(card.className).toContain('opacity-50')
  })

  it('applies glow styling for earned cards', () => {
    const { container } = render(
      <AchievementCard
        achievement={baseAchievement}
        earned={true}
        earnedDate="2025-01-15T10:00:00Z"
      />,
    )
    const card = container.firstChild as HTMLElement
    expect(card.className).toContain('border-primary/20')
  })

  it('shows correct rarity color for Rare', () => {
    const rareAchievement = { ...baseAchievement, rarity: 'Rare' }
    render(
      <AchievementCard
        achievement={rareAchievement}
        earned={false}
        earnedDate={null}
      />,
    )
    const rarityBadge = document.querySelector('.text-blue-400')
    expect(rarityBadge).toBeInTheDocument()
  })
})

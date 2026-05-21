import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`
    return key
  },
  useLocale: () => 'en',
}))

vi.mock('@/hooks/use-date-format', () => ({
  useDateFormat: () => ({
    displayDate: (d: Date) => d.toISOString().slice(0, 10),
  }),
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
  it('renders earned glyph for common rarity', () => {
    render(
      <AchievementCard
        achievement={baseAchievement}
        earned={true}
        earnedDate="2025-01-15T10:00:00Z"
      />,
    )
    // v8 uses glyph shapes (◇ ◈ ◆ ★ ✦), not emoji
    expect(document.body.textContent).toContain('◇')
  })

  it('renders locked state with locked label', () => {
    render(
      <AchievementCard
        achievement={baseAchievement}
        earned={false}
        earnedDate={null}
      />,
    )
    expect(document.body.textContent).toContain('gamification.rarityLocked')
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

  it('displays achievement description only when earned', () => {
    render(
      <AchievementCard
        achievement={baseAchievement}
        earned={true}
        earnedDate="2025-01-15T10:00:00Z"
      />,
    )
    expect(document.body.textContent).toContain('gamification.achievements.first_habit.description')
  })

  it('hides description when not earned', () => {
    render(
      <AchievementCard
        achievement={baseAchievement}
        earned={false}
        earnedDate={null}
      />,
    )
    expect(document.body.textContent).not.toContain('gamification.achievements.first_habit.description')
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

  it('renders a rare-rarity glyph for Rare achievements', () => {
    const rareAchievement = { ...baseAchievement, rarity: 'Rare' }
    render(
      <AchievementCard
        achievement={rareAchievement}
        earned={true}
        earnedDate="2025-01-15T10:00:00Z"
      />,
    )
    // v8: Rare uses ◆
    expect(document.body.textContent).toContain('◆')
  })
})

import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}(${JSON.stringify(params)})`
    return key
  },
}))

vi.mock('@/hooks/use-gamification', () => ({
  useGamificationProfile: () => ({
    newAchievements: [],
    invalidate: vi.fn(),
  }),
}))

import { AchievementToast } from '@/components/gamification/achievement-toast'

describe('AchievementToast', () => {
  it('renders nothing when there are no new achievements', () => {
    const { container } = render(<AchievementToast />)
    expect(container.innerHTML).toBe('')
  })
})

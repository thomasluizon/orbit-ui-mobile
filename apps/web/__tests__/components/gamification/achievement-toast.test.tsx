import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { useUIStore } from '@/stores/ui-store'
import { AchievementToast } from '@/components/gamification/achievement-toast'

const gamification = vi.hoisted(() => ({
  newAchievements: [] as Array<{ id: string; xpReward: number }>,
  invalidate: vi.fn(),
}))

vi.mock('@/hooks/use-gamification', () => ({
  useGamificationProfile: () => gamification,
}))

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

describe('AchievementToast', () => {
  beforeEach(() => {
    gamification.newAchievements = []
    gamification.invalidate.mockReset()
    useUIStore.setState({ activeCelebration: null, queuedCelebrations: [] })
  })

  it('does nothing when no achievements were earned', () => {
    const { container } = render(<AchievementToast />)
    expect(container.innerHTML).toBe('')
    expect(gamification.invalidate).not.toHaveBeenCalled()
  })

  it('refreshes earned achievements without adding a celebration', () => {
    gamification.newAchievements = [
      { id: 'first_habit', xpReward: 10 },
      { id: 'streak_7', xpReward: 25 },
    ]
    useUIStore.getState().enqueueCelebration('streak', { streak: 7 })
    const active = useUIStore.getState().activeCelebration
    render(<AchievementToast />)

    expect(gamification.invalidate).toHaveBeenCalledTimes(1)
    expect(useUIStore.getState().activeCelebration).toEqual(active)
    expect(useUIStore.getState().queuedCelebrations).toEqual([])
    expect(document.body.querySelector('[role="status"]')).toBeNull()
  })
})

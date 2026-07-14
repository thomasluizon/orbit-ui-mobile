import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'

interface AchievementCelebration {
  id: string
  kind: 'achievement'
  payload: { achievementId: string; xpReward: number }
}

interface UiState {
  activeCelebration: AchievementCelebration | null
  enqueueCelebration: ReturnType<typeof vi.fn>
  completeActiveCelebration: ReturnType<typeof vi.fn>
}

const uiState: UiState = {
  activeCelebration: null,
  enqueueCelebration: vi.fn(),
  completeActiveCelebration: vi.fn(),
}

const gamification: { newAchievements: Array<{ id: string; xpReward: number }>; invalidate: ReturnType<typeof vi.fn> } = {
  newAchievements: [],
  invalidate: vi.fn(),
}

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}(${JSON.stringify(params)})` : key,
}))

vi.mock('@/hooks/use-gamification', () => ({
  useGamificationProfile: () => gamification,
}))

vi.mock('@/stores/ui-store', () => ({
  useUIStore: (selector: (state: UiState) => unknown) => selector(uiState),
}))

import { AchievementToast } from '@/components/gamification/achievement-toast'

function celebration(overrides: Partial<AchievementCelebration['payload']> = {}): AchievementCelebration {
  return {
    id: 'celebration-1',
    kind: 'achievement',
    payload: { achievementId: 'first_habit', xpReward: 50, ...overrides },
  }
}

describe('AchievementToast', () => {
  beforeEach(() => {
    uiState.activeCelebration = null
    uiState.enqueueCelebration.mockReset()
    uiState.completeActiveCelebration.mockReset()
    gamification.newAchievements = []
    gamification.invalidate.mockReset()
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', (callback: (time: number) => void) => {
      callback(0)
      return 0
    })
    vi.stubGlobal('cancelAnimationFrame', () => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('renders nothing when there is no active celebration', () => {
    const { container } = render(<AchievementToast />)
    expect(container.innerHTML).toBe('')
    expect(document.body.querySelector('[role="status"]')).toBeNull()
  })

  it('enqueues each new achievement and invalidates the profile', () => {
    gamification.newAchievements = [
      { id: 'ach-a', xpReward: 10 },
      { id: 'ach-b', xpReward: 25 },
    ]
    render(<AchievementToast />)

    expect(uiState.enqueueCelebration).toHaveBeenCalledTimes(2)
    expect(uiState.enqueueCelebration).toHaveBeenNthCalledWith(1, 'achievement', {
      achievementId: 'ach-a',
      xpReward: 10,
    })
    expect(uiState.enqueueCelebration).toHaveBeenNthCalledWith(2, 'achievement', {
      achievementId: 'ach-b',
      xpReward: 25,
    })
    expect(gamification.invalidate).toHaveBeenCalledTimes(1)
  })

  it('renders the achievement toast with eyebrow, name and description', () => {
    uiState.activeCelebration = celebration({ achievementId: 'streak_7', xpReward: 120 })
    act(() => {
      render(<AchievementToast />)
    })

    const toast = document.body.querySelector('[role="status"]')
    expect(toast).not.toBeNull()
    expect(toast!.textContent).toContain('gamification.toast.achievementEyebrow({"xp":120})')
    expect(toast!.textContent).toContain('gamification.achievements.streak_7.name')
    expect(toast!.textContent).toContain('gamification.achievements.streak_7.description')
  })

  it('auto-dismisses after the visible window and completes the celebration', () => {
    uiState.activeCelebration = celebration()
    act(() => {
      render(<AchievementToast />)
    })
    expect(document.body.querySelector('[role="status"]')).not.toBeNull()

    act(() => {
      vi.advanceTimersByTime(4000)
    })
    expect(uiState.completeActiveCelebration).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(280)
    })
    expect(uiState.completeActiveCelebration).toHaveBeenCalledWith('celebration-1')
    expect(document.body.querySelector('[role="status"]')).toBeNull()
  })
})

import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}(${JSON.stringify(params)})`
    return key
  },
}))

// Mock CSS import
vi.mock('@/components/gamification/goal-completed-celebration.css', () => ({}))

vi.mock('@/stores/ui-store', () => ({
  useUIStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      goalCompletedCelebration: null,
      setGoalCompletedCelebration: vi.fn(),
    }),
}))

import { GoalCompletedCelebration } from '@/components/gamification/goal-completed-celebration'

describe('GoalCompletedCelebration', () => {
  it('renders nothing when no celebration is active', () => {
    const { container } = render(<GoalCompletedCelebration />)
    expect(container.innerHTML).toBe('')
  })
})

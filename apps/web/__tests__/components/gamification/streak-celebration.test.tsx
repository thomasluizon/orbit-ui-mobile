import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`
    return key
  },
}))

vi.mock('@/lib/plural', () => ({
  plural: (text: string) => text,
}))

let mockStreakCelebration: { streak: number } | null = null
const mockSetStreakCelebration = vi.fn()

vi.mock('@/stores/ui-store', () => ({
  useUIStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      streakCelebration: mockStreakCelebration,
      setStreakCelebration: mockSetStreakCelebration,
    }),
}))

import { StreakCelebration } from '@/components/gamification/streak-celebration'

describe('StreakCelebration', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.body.innerHTML = ''
    mockStreakCelebration = null
    mockSetStreakCelebration.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders nothing when no celebration active', () => {
    mockStreakCelebration = null
    const { container } = render(<StreakCelebration />)
    expect(container.innerHTML).toBe('')
  })

  it('renders celebration overlay when streak celebration is set', () => {
    mockStreakCelebration = { streak: 7 }
    render(<StreakCelebration />)
    expect(document.querySelector('[role="status"]')).toBeInTheDocument()
  })

  it('displays the streak count', () => {
    mockStreakCelebration = { streak: 14 }
    render(<StreakCelebration />)
    expect(document.body.textContent).toContain('14')
  })

  it('shows milestone encouragement for milestone streaks', () => {
    mockStreakCelebration = { streak: 30 }
    render(<StreakCelebration />)
    expect(document.body.textContent).toContain('streakDisplay.celebration.milestone')
  })

  it('shows keepGoing encouragement for non-milestone streaks', () => {
    mockStreakCelebration = { streak: 5 }
    render(<StreakCelebration />)
    expect(document.body.textContent).toContain('streakDisplay.celebration.keepGoing')
  })

  it('renders ember particles for milestone streaks', () => {
    mockStreakCelebration = { streak: 7 }
    render(<StreakCelebration />)
    const embers = document.querySelectorAll('.streak-ember')
    expect(embers.length).toBe(12)
  })

  it('does not render ember particles for non-milestone streaks', () => {
    mockStreakCelebration = { streak: 3 }
    render(<StreakCelebration />)
    const embers = document.querySelectorAll('.streak-ember')
    expect(embers.length).toBe(0)
  })

  it('dismisses on click', () => {
    mockStreakCelebration = { streak: 5 }
    render(<StreakCelebration />)
    const button = document.querySelector('button')
    if (button) fireEvent.click(button)
    expect(mockSetStreakCelebration).toHaveBeenCalledWith(null)
  })
})

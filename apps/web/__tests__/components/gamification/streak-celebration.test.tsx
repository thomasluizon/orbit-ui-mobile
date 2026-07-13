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

  it.each([
    { name: 'displays the streak count', streak: 14, text: '14' },
    { name: 'shows milestone encouragement for milestone streaks', streak: 30, text: 'streakDisplay.celebration.milestone' },
    { name: 'renders the Streak eyebrow label', streak: 3, text: 'streakDisplay.celebration.eyebrow' },
  ])('$name', ({ streak, text }) => {
    mockStreakCelebration = { streak }
    render(<StreakCelebration />)
    expect(document.body.textContent).toContain(text)
  })

  it('renders Saturn-ring concentric rings via RingMotif', () => {
    mockStreakCelebration = { streak: 7 }
    render(<StreakCelebration />)
    const rings = document.querySelector('[data-slot="celebration-rings"]')
    expect(rings?.querySelectorAll('span').length).toBe(4)
  })

  it('dismisses on click', () => {
    mockStreakCelebration = { streak: 5 }
    render(<StreakCelebration />)
    const button = document.querySelector('button')
    if (button) fireEvent.click(button)
    expect(mockSetStreakCelebration).toHaveBeenCalledWith(null)
  })
})

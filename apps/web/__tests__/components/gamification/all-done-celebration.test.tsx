import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

let mockAllDoneCelebration = false
const mockSetAllDoneCelebration = vi.fn()

vi.mock('@/stores/ui-store', () => ({
  useUIStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      allDoneCelebration: mockAllDoneCelebration,
      setAllDoneCelebration: mockSetAllDoneCelebration,
    }),
}))

import { AllDoneCelebration } from '@/components/gamification/all-done-celebration'

describe('AllDoneCelebration', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.body.innerHTML = ''
    mockAllDoneCelebration = false
    mockSetAllDoneCelebration.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders nothing when celebration is not active', () => {
    mockAllDoneCelebration = false
    const { container } = render(<AllDoneCelebration />)
    expect(container.innerHTML).toBe('')
  })

  it('renders celebration when active', () => {
    mockAllDoneCelebration = true
    render(<AllDoneCelebration />)
    expect(document.querySelector('[role="status"]')).toBeInTheDocument()
  })

  it('displays celebration title', () => {
    mockAllDoneCelebration = true
    render(<AllDoneCelebration />)
    expect(document.body.textContent).toContain('habits.allDoneCelebrationTitle')
  })

  it('displays celebration subtitle', () => {
    mockAllDoneCelebration = true
    render(<AllDoneCelebration />)
    expect(document.body.textContent).toContain('habits.allDoneCelebrationSubtitle')
  })

  it('renders starburst rays', () => {
    mockAllDoneCelebration = true
    render(<AllDoneCelebration />)
    const rays = document.querySelectorAll('.all-done-starburst-ray')
    expect(rays.length).toBe(12)
  })

  it('renders confetti particles', () => {
    mockAllDoneCelebration = true
    render(<AllDoneCelebration />)
    const confetti = document.querySelectorAll('.all-done-confetti')
    expect(confetti.length).toBe(24)
  })

  it('renders orbit ring shockwaves', () => {
    mockAllDoneCelebration = true
    render(<AllDoneCelebration />)
    expect(document.querySelector('.all-done-ring-1')).toBeInTheDocument()
    expect(document.querySelector('.all-done-ring-2')).toBeInTheDocument()
    expect(document.querySelector('.all-done-ring-3')).toBeInTheDocument()
  })

  it('dismisses on click', () => {
    mockAllDoneCelebration = true
    render(<AllDoneCelebration />)
    const button = document.querySelector('button')
    if (button) fireEvent.click(button)
    expect(mockSetAllDoneCelebration).toHaveBeenCalledWith(false)
  })
})

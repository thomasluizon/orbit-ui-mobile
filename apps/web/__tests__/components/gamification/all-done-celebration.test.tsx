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

  it('renders Saturn-ring concentric rings via RingMotif', () => {
    mockAllDoneCelebration = true
    render(<AllDoneCelebration />)
    const rings = document.querySelector('[data-slot="celebration-rings"]')
    expect(rings).toBeInTheDocument()
    expect(rings?.querySelectorAll('span').length).toBe(3)
  })

  it('dismisses on click', () => {
    mockAllDoneCelebration = true
    render(<AllDoneCelebration />)
    const button = document.querySelector('button')
    if (button) fireEvent.click(button)
    expect(mockSetAllDoneCelebration).toHaveBeenCalledWith(false)
  })
})

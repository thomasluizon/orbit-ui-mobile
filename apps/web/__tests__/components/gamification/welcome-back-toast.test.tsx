import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`
    return key
  },
}))

let mockProfile: Record<string, unknown> | null = null

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: mockProfile }),
}))

import { WelcomeBackToast } from '@/components/gamification/welcome-back-toast'

describe('WelcomeBackToast', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    mockProfile = null
    localStorage.clear()
  })

  it('renders nothing when no profile', () => {
    mockProfile = null
    const { container } = render(<WelcomeBackToast />)
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing on first visit (no last visit timestamp)', () => {
    mockProfile = { currentStreak: 5 }
    const { container } = render(<WelcomeBackToast />)
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing when last visit was recent (< 24h)', () => {
    mockProfile = { currentStreak: 5 }
    localStorage.setItem('orbit_last_visit', String(Date.now() - 1000))
    const { container } = render(<WelcomeBackToast />)
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing when streak is 0', () => {
    mockProfile = { currentStreak: 0 }
    localStorage.setItem('orbit_last_visit', String(Date.now() - 48 * 60 * 60 * 1000))
    const { container } = render(<WelcomeBackToast />)
    expect(container.innerHTML).toBe('')
  })

  it('saves current time as last visit', () => {
    mockProfile = { currentStreak: 5 }
    render(<WelcomeBackToast />)
    const saved = localStorage.getItem('orbit_last_visit')
    expect(saved).toBeTruthy()
    expect(Number(saved)).toBeGreaterThan(0)
  })
})

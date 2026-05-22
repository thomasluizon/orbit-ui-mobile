import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`
    return key
  },
}))

vi.mock('@/lib/plural', () => ({
  plural: (text: string) => text,
}))

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

let mockProfile: Record<string, unknown> | null = null

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: mockProfile }),
}))

import { ProfileStreakCard } from '@/components/gamification/profile-streak-card'

describe('ProfileStreakCard', () => {
  it('renders link to streak page', () => {
    mockProfile = { currentStreak: 5 }
    render(<ProfileStreakCard />)
    const link = document.querySelector('a[href="/streak"]')
    expect(link).toBeInTheDocument()
  })

  it('shows streak title', () => {
    mockProfile = { currentStreak: 5 }
    render(<ProfileStreakCard />)
    expect(document.body.textContent).toContain('streakDisplay.profile.title')
  })

  it('shows noStreak message when streak is 0', () => {
    mockProfile = { currentStreak: 0 }
    render(<ProfileStreakCard />)
    expect(document.body.textContent).toContain('streakDisplay.profile.noStreak')
  })

  it('shows encouragement for streak >= 7', () => {
    mockProfile = { currentStreak: 7 }
    render(<ProfileStreakCard />)
    expect(document.body.textContent).toContain('streakDisplay.profile.encouragement7')
  })

  it('shows encouragement for streak >= 30', () => {
    mockProfile = { currentStreak: 30 }
    render(<ProfileStreakCard />)
    expect(document.body.textContent).toContain('streakDisplay.profile.encouragement30')
  })

  it('shows encouragement for streak >= 100', () => {
    mockProfile = { currentStreak: 100 }
    render(<ProfileStreakCard />)
    expect(document.body.textContent).toContain('streakDisplay.profile.encouragement100')
  })

  it('shows encouragement for streak >= 365', () => {
    mockProfile = { currentStreak: 365 }
    render(<ProfileStreakCard />)
    expect(document.body.textContent).toContain('streakDisplay.profile.encouragement365')
  })

  it('renders the streak count when streak > 0', () => {
    mockProfile = { currentStreak: 47 }
    render(<ProfileStreakCard />)
    // count-up animation may show 0 initially; assert the streak count area renders.
    expect(document.body.textContent).toContain('streakDisplay.profile.currentStreak')
  })

  it('omits the streak count when streak is 0', () => {
    mockProfile = { currentStreak: 0 }
    render(<ProfileStreakCard />)
    expect(document.body.textContent).not.toContain('streakDisplay.profile.currentStreak')
  })

  it('renders chevron icon', () => {
    mockProfile = { currentStreak: 1 }
    const { container } = render(<ProfileStreakCard />)
    // ChevronRight is the last svg
    const svgs = container.querySelectorAll('svg')
    expect(svgs.length).toBeGreaterThan(0)
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks -- must come before component import
// ---------------------------------------------------------------------------

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`
    return key
  },
  useLocale: () => 'en',
}))

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [k: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

vi.mock('@/lib/plural', () => ({
  plural: (text: string) => text,
}))

// CSS import mock
vi.mock('@/app/(app)/streak/streak.css', () => ({}))

let mockProfile: Record<string, unknown> | null = null

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({
    profile: mockProfile,
  }),
}))

let mockStreakQuery = { isLoading: false, data: null }
let mockStreakInfo: Record<string, unknown> | null = null
let mockIsFrozenToday = false
let mockStreakFreezesAccumulated = 2
let mockMaxStreakFreezesAccumulated = 3
let mockFreezesUsedThisMonth = 1
let mockMaxFreezesPerMonth = 3

vi.mock('@/hooks/use-gamification', () => ({
  useStreakFreeze: () => ({
    streakQuery: mockStreakQuery,
    streakInfo: mockStreakInfo,
    isFrozenToday: mockIsFrozenToday,
    streakFreezesAccumulated: mockStreakFreezesAccumulated,
    maxStreakFreezesAccumulated: mockMaxStreakFreezesAccumulated,
    freezesUsedThisMonth: mockFreezesUsedThisMonth,
    maxFreezesPerMonth: mockMaxFreezesPerMonth,
  }),
}))

vi.mock('@/components/gamification/streak-freeze-celebration', () => ({
  StreakFreezeCelebration: vi.fn().mockReturnValue(null),
}))

vi.mock('@/hooks/use-go-back-or-fallback', () => ({
  useGoBackOrFallback: () => vi.fn(),
}))

// ---------------------------------------------------------------------------
// Import component after mocks
// ---------------------------------------------------------------------------

import StreakPage from '@/app/(app)/streak/page'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StreakPage', () => {
  beforeEach(() => {
    mockProfile = { currentStreak: 10, hasProAccess: true }
    mockStreakQuery = { isLoading: false, data: null }
    mockStreakInfo = {
      currentStreak: 10,
      longestStreak: 30,
      lastActiveDate: '2025-06-01',
      recentFreezeDates: [],
      isFrozenToday: false,
    }
    mockIsFrozenToday = false
    mockStreakFreezesAccumulated = 2
    mockMaxStreakFreezesAccumulated = 3
    mockFreezesUsedThisMonth = 1
    mockMaxFreezesPerMonth = 3
  })

  it('renders without crashing', () => {
    const { container } = render(<StreakPage />)
    expect(container).toBeTruthy()
  })

  it('renders the page header with title and back button', () => {
    render(<StreakPage />)
    expect(screen.getByText('streakDisplay.detail.title')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'common.backToProfile' })).toBeInTheDocument()
  })

  // ---- Loading state ----

  it('shows skeleton loading state when streak query is loading', () => {
    mockStreakQuery = { isLoading: true, data: null }
    mockStreakInfo = null
    const { container } = render(<StreakPage />)
    const pulseElements = container.querySelectorAll('.animate-pulse')
    expect(pulseElements.length).toBeGreaterThan(0)
  })

  // ---- Streak hero section ----

  it('renders streak count in hero section', () => {
    const { container } = render(<StreakPage />)
    const countEl = container.querySelector('.streak-hero__count')
    expect(countEl).toBeTruthy()
    expect(countEl?.textContent).toBe('10')
  })

  it('renders days unit text', () => {
    render(<StreakPage />)
    expect(document.body.textContent).toContain('streakDisplay.detail.daysUnit')
  })

  it('renders encouragement message for streak >= 7', () => {
    render(<StreakPage />)
    expect(document.body.textContent).toContain('streakDisplay.profile.encouragement7')
  })

  it('renders no encouragement for streak 0', () => {
    mockProfile = { currentStreak: 0, hasProAccess: true }
    render(<StreakPage />)
    expect(document.body.textContent).not.toContain('streakDisplay.profile.encouragement1')
    expect(document.body.textContent).not.toContain('streakDisplay.profile.encouragement7')
  })

  // ---- Weekly timeline ----

  it('renders 7-day timeline', () => {
    render(<StreakPage />)
    expect(screen.getByText('streakDisplay.detail.thisWeek')).toBeInTheDocument()
  })

  it('renders legend items', () => {
    render(<StreakPage />)
    expect(screen.getByText('streakDisplay.detail.dayActive')).toBeInTheDocument()
    expect(screen.getByText('streakDisplay.detail.dayFrozen')).toBeInTheDocument()
    expect(screen.getByText('streakDisplay.detail.dayMissed')).toBeInTheDocument()
  })

  // ---- Stats section ----

  it('renders current and longest streak stats', () => {
    render(<StreakPage />)
    expect(screen.getAllByText('streakDisplay.detail.currentStreak').length).toBeGreaterThan(0)
    expect(screen.getByText('streakDisplay.detail.longestStreak')).toBeInTheDocument()
  })

  it('renders longest streak value from streakInfo', () => {
    render(<StreakPage />)
    expect(document.body.textContent).toContain('30')
  })

  // ---- Auto-freeze section ----

  it('renders the freeze section title', () => {
    render(<StreakPage />)
    expect(screen.getByText('streakDisplay.freeze.title')).toBeInTheDocument()
  })

  it('renders the auto explainer copy', () => {
    render(<StreakPage />)
    expect(screen.getByText('streakDisplay.freeze.auto.explainer')).toBeInTheDocument()
  })

  it('renders the banked charge gauge with the banked count', () => {
    render(<StreakPage />)
    expect(screen.getByText('streakDisplay.freeze.banked.label')).toBeInTheDocument()
    // banked/max mono value
    expect(document.body.textContent).toContain('2/3')
  })

  it('renders used-this-month and next-freeze rows', () => {
    render(<StreakPage />)
    expect(screen.getByText('streakDisplay.freeze.usedThisMonth.label')).toBeInTheDocument()
    expect(screen.getByText('streakDisplay.freeze.nextFreeze.label')).toBeInTheDocument()
    // streak 10 -> 7 - (10 % 7) = 4 days
    expect(document.body.textContent).toContain('streakDisplay.freeze.nextFreeze.inDays')
    expect(document.body.textContent).toContain('"days":4')
  })

  it('shows "Banked full" for next-freeze when banked is at max', () => {
    mockStreakFreezesAccumulated = 3
    render(<StreakPage />)
    expect(screen.getByText('streakDisplay.freeze.nextFreeze.full')).toBeInTheDocument()
  })

  it('does NOT render any activate-freeze control', () => {
    render(<StreakPage />)
    expect(screen.queryByText('streakDisplay.freeze.activate')).not.toBeInTheDocument()
  })

  // ---- Protected days ----

  it('renders the protected-days empty state when no freezes used', () => {
    render(<StreakPage />)
    expect(screen.getByText('streakDisplay.freeze.protected.label')).toBeInTheDocument()
    expect(screen.getByText('streakDisplay.freeze.protected.empty')).toBeInTheDocument()
  })

  it('lists auto-used protected freeze dates', () => {
    mockStreakInfo = {
      currentStreak: 10,
      longestStreak: 30,
      lastActiveDate: '2025-06-01',
      recentFreezeDates: ['2025-05-28', '2025-05-25'],
      isFrozenToday: false,
    }
    render(<StreakPage />)
    expect(screen.queryByText('streakDisplay.freeze.protected.empty')).not.toBeInTheDocument()
    // formatted dates render (May 28 / May 25)
    expect(document.body.textContent).toContain('May')
  })

  it('prepends a Today row when frozen today', () => {
    mockIsFrozenToday = true
    render(<StreakPage />)
    expect(screen.getByText('streakDisplay.freeze.protected.today')).toBeInTheDocument()
    expect(screen.getByText('streakDisplay.freeze.protected.todayValue')).toBeInTheDocument()
  })

  it('shows the frozen eyebrow in the hero when frozen today', () => {
    mockIsFrozenToday = true
    render(<StreakPage />)
    expect(screen.getAllByText('streakDisplay.freeze.activeToday').length).toBeGreaterThan(0)
  })

  // ---- Pro gating ----

  it('renders the Pro gate instead of the gauge for free users', () => {
    mockProfile = { currentStreak: 10, hasProAccess: false }
    render(<StreakPage />)
    expect(screen.getByText('streakDisplay.freeze.pro.gate')).toBeInTheDocument()
    expect(screen.getByText('common.upgrade')).toBeInTheDocument()
    // gauge rows must not render in the free state
    expect(screen.queryByText('streakDisplay.freeze.banked.label')).not.toBeInTheDocument()
  })

  it('links the Pro upgrade affordance to the paywall route', () => {
    mockProfile = { currentStreak: 10, hasProAccess: false }
    render(<StreakPage />)
    const upgradeLink = screen.getByText('common.upgrade').closest('a')
    expect(upgradeLink).toHaveAttribute('href', '/upgrade')
  })

  // ---- Tier ----

  it('shows the steady tier in stats for streak >= 7', () => {
    mockProfile = { currentStreak: 10, hasProAccess: true }
    render(<StreakPage />)
    expect(screen.getByText('streakDisplay.detail.tierSteady')).toBeInTheDocument()
  })

  it('shows the legendary tier in stats for streak >= 100', () => {
    mockProfile = { currentStreak: 150, hasProAccess: true }
    render(<StreakPage />)
    expect(screen.getByText('streakDisplay.detail.tierLegendary')).toBeInTheDocument()
  })
})

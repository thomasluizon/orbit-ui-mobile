import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

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
let mockFreezesAvailable = 2
let mockIsFrozenToday = false
let mockHasCompletedToday = false
let mockCanFreeze = true

vi.mock('@/hooks/use-gamification', () => ({
  useStreakFreeze: () => ({
    streakQuery: mockStreakQuery,
    streakInfo: mockStreakInfo,
    freezesAvailable: mockFreezesAvailable,
    isFrozenToday: mockIsFrozenToday,
    hasCompletedToday: mockHasCompletedToday,
    canFreeze: mockCanFreeze,
  }),
  useActivateStreakFreeze: () => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
    error: null,
  }),
}))

vi.mock('@/components/gamification/streak-freeze-celebration', () => ({
  StreakFreezeCelebration: vi.fn().mockReturnValue(null),
}))

vi.mock('@/components/ui/app-overlay', () => ({
  AppOverlay: ({ open, children, title }: { open: boolean; children: React.ReactNode; title: string }) => {
    if (!open) return null
    return (
      <div data-testid="overlay" aria-label={title}>
        {children}
      </div>
    )
  },
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
    mockProfile = { currentStreak: 10, streakFreezesAvailable: 2 }
    mockStreakQuery = { isLoading: false, data: null }
    mockStreakInfo = {
      currentStreak: 10,
      longestStreak: 30,
      lastActiveDate: '2025-06-01',
      recentFreezeDates: [],
      freezesAvailable: 2,
      isFrozenToday: false,
    }
    mockFreezesAvailable = 2
    mockIsFrozenToday = false
    mockHasCompletedToday = false
    mockCanFreeze = true
  })

  it('renders without crashing', () => {
    const { container } = render(<StreakPage />)
    expect(container).toBeTruthy()
  })

  it('renders the page header with title and back link', () => {
    render(<StreakPage />)
    expect(screen.getByText('streakDisplay.detail.title')).toBeInTheDocument()
    const backLink = screen.getAllByRole('link').find((a) => a.getAttribute('href') === '/profile')
    expect(backLink).toBeTruthy()
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
    // Streak count is rendered in the .streak-hero__count element
    const countEl = container.querySelector('.streak-hero__count')
    expect(countEl).toBeTruthy()
    expect(countEl?.textContent).toBe('10')
  })

  it('shows flame SVG when streak is greater than 0', () => {
    const { container } = render(<StreakPage />)
    const flameSvg = container.querySelector('svg')
    expect(flameSvg).toBeInTheDocument()
  })

  it('renders days unit text', () => {
    render(<StreakPage />)
    expect(document.body.textContent).toContain('streakDisplay.detail.daysUnit')
  })

  it('renders encouragement message for streak >= 7', () => {
    render(<StreakPage />)
    expect(document.body.textContent).toContain('streakDisplay.profile.encouragement7')
  })

  it('renders encouragement message for streak >= 30', () => {
    mockProfile = { currentStreak: 35 }
    render(<StreakPage />)
    expect(document.body.textContent).toContain('streakDisplay.profile.encouragement30')
  })

  it('renders no encouragement for streak 0', () => {
    mockProfile = { currentStreak: 0 }
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
    expect(screen.getByText('streakDisplay.detail.currentStreak')).toBeInTheDocument()
    expect(screen.getByText('streakDisplay.detail.longestStreak')).toBeInTheDocument()
  })

  it('renders longest streak value from streakInfo', () => {
    render(<StreakPage />)
    // The longest streak value (30) is rendered among multiple text nodes
    expect(document.body.textContent).toContain('30')
  })

  // ---- Freeze section ----

  it('renders freeze title and availability', () => {
    render(<StreakPage />)
    expect(screen.getByText('streakDisplay.freeze.title')).toBeInTheDocument()
    expect(document.body.textContent).toContain('streakDisplay.freeze.available')
  })

  it('renders activate button when canFreeze is true', () => {
    render(<StreakPage />)
    expect(screen.getByText('streakDisplay.freeze.activate')).toBeInTheDocument()
  })

  it('shows frozen today indicator when isFrozenToday', () => {
    mockIsFrozenToday = true
    render(<StreakPage />)
    expect(screen.getByText('streakDisplay.freeze.activeToday')).toBeInTheDocument()
  })

  it('shows completed today hint', () => {
    mockHasCompletedToday = true
    mockIsFrozenToday = false
    render(<StreakPage />)
    expect(screen.getByText('streakDisplay.freeze.completedToday')).toBeInTheDocument()
  })

  it('shows recent freeze dates when available', () => {
    mockStreakInfo = {
      currentStreak: 10,
      longestStreak: 30,
      lastActiveDate: '2025-06-01',
      recentFreezeDates: ['2025-05-28', '2025-05-25'],
      freezesAvailable: 2,
      isFrozenToday: false,
    }
    render(<StreakPage />)
    expect(screen.getByText('streakDisplay.freeze.recentLabel')).toBeInTheDocument()
  })

  // ---- Freeze confirmation overlay ----

  it('opens confirmation overlay when activate button is clicked', () => {
    render(<StreakPage />)
    const activateButton = screen.getByText('streakDisplay.freeze.activate')
    fireEvent.click(activateButton)
    expect(screen.getByTestId('overlay')).toBeInTheDocument()
    expect(document.body.textContent).toContain('streakDisplay.freeze.confirmBody')
  })

  it('closes confirmation overlay when cancel is clicked', () => {
    render(<StreakPage />)
    fireEvent.click(screen.getByText('streakDisplay.freeze.activate'))
    expect(screen.getByTestId('overlay')).toBeInTheDocument()
    fireEvent.click(screen.getByText('common.cancel'))
    expect(screen.queryByTestId('overlay')).not.toBeInTheDocument()
  })

  // ---- Tier styling ----

  it('applies normal tier class for low streaks', () => {
    mockProfile = { currentStreak: 3 }
    const { container } = render(<StreakPage />)
    expect(container.querySelector('.streak-hero--normal')).toBeInTheDocument()
  })

  it('applies strong tier class for streak >= 7', () => {
    mockProfile = { currentStreak: 10 }
    const { container } = render(<StreakPage />)
    expect(container.querySelector('.streak-hero--strong')).toBeInTheDocument()
  })

  it('applies intense tier class for streak >= 30', () => {
    mockProfile = { currentStreak: 50 }
    const { container } = render(<StreakPage />)
    expect(container.querySelector('.streak-hero--intense')).toBeInTheDocument()
  })

  it('applies legendary tier class for streak >= 100', () => {
    mockProfile = { currentStreak: 150 }
    const { container } = render(<StreakPage />)
    expect(container.querySelector('.streak-hero--legendary')).toBeInTheDocument()
  })

  it('disable activate button when canFreeze is false', () => {
    mockCanFreeze = false
    render(<StreakPage />)
    const buttons = screen.getAllByRole('button')
    const activateBtn = buttons.find((b) => b.textContent === 'streakDisplay.freeze.activate')
    expect(activateBtn).toBeDisabled()
  })
})

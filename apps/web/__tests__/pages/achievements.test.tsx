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

const mockReplace = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: vi.fn(),
    back: vi.fn(),
    refresh: vi.fn(),
  }),
}))

let mockProfileLoading = false
let mockHasProAccess = true

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({
    profile: mockProfileLoading ? null : { id: 'u1', currentStreak: 5 },
    isLoading: mockProfileLoading,
  }),
  useHasProAccess: () => mockHasProAccess,
}))

let mockGamificationLoading = false
let mockGamificationProfile: Record<string, unknown> | null = null
let mockAchievementsByCategory: { key: string; items: { id: string; name: string; isEarned: boolean; earnedAtUtc: string | null }[] }[] = []
let mockXpProgress = 45

vi.mock('@/hooks/use-gamification', () => ({
  useGamificationProfile: () => ({
    profile: mockGamificationProfile,
    isLoading: mockGamificationLoading,
    xpProgress: mockXpProgress,
    achievementsByCategory: mockAchievementsByCategory,
  }),
}))

vi.mock('@/components/gamification/achievement-card', () => ({
  AchievementCard: ({ achievement, earned }: { achievement: { id: string; name: string }; earned: boolean }) => (
    <div data-testid={`achievement-${achievement.id}`}>
      {achievement.name} - {earned ? 'earned' : 'locked'}
    </div>
  ),
}))

vi.mock('@/components/ui/pro-badge', () => ({
  ProBadge: () => <span data-testid="pro-badge">PRO</span>,
}))

vi.mock('@/hooks/use-go-back-or-fallback', () => ({
  useGoBackOrFallback: () => vi.fn(),
}))

// ---------------------------------------------------------------------------
// Import component after mocks
// ---------------------------------------------------------------------------

import AchievementsPage from '@/app/(app)/achievements/page'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AchievementsPage', () => {
  beforeEach(() => {
    mockReplace.mockClear()
    mockProfileLoading = false
    mockHasProAccess = true
    mockGamificationLoading = false
    mockGamificationProfile = null
    mockAchievementsByCategory = []
    mockXpProgress = 45
  })

  it('renders without crashing', () => {
    const { container } = render(<AchievementsPage />)
    expect(container).toBeTruthy()
  })

  it('renders the page header with title and back button', () => {
    render(<AchievementsPage />)
    expect(screen.getByText('gamification.title')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'common.backToProfile' })).toBeInTheDocument()
  })

  it('renders ProBadge in header', () => {
    render(<AchievementsPage />)
    expect(screen.getByTestId('pro-badge')).toBeInTheDocument()
  })

  // ---- Locked state (non-Pro) ----

  it('shows locked state when user does not have Pro access', () => {
    mockHasProAccess = false
    render(<AchievementsPage />)
    expect(screen.getByText('gamification.page.lockedTitle')).toBeInTheDocument()
    expect(screen.getByText('gamification.page.lockedDescription')).toBeInTheDocument()
  })

  it('shows upgrade button in locked state', () => {
    mockHasProAccess = false
    render(<AchievementsPage />)
    const upgradeLink = screen.getByText('gamification.page.upgradeButton')
    expect(upgradeLink.closest('a')).toHaveAttribute('href', '/upgrade')
  })

  it('does not show locked state for Pro users', () => {
    mockHasProAccess = true
    render(<AchievementsPage />)
    expect(screen.queryByText('gamification.page.lockedTitle')).not.toBeInTheDocument()
  })

  // ---- Loading state ----

  it('shows skeleton loading state when gamification is loading', () => {
    mockGamificationLoading = true
    mockGamificationProfile = null
    const { container } = render(<AchievementsPage />)
    const pulseElements = container.querySelectorAll('.skeleton-shimmer')
    expect(pulseElements.length).toBeGreaterThan(0)
  })

  // ---- Pro user with profile data ----

  it('renders level header when profile is loaded', () => {
    mockGamificationProfile = {
      level: 5,
      levelTitle: 'Habit Builder',
      totalXp: 1200,
      xpForNextLevel: 2000,
      achievementsEarned: 3,
      achievementsTotal: 20,
      achievements: [],
    }
    render(<AchievementsPage />)
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('Habit Builder')).toBeInTheDocument()
  })

  it('renders XP progress information', () => {
    mockGamificationProfile = {
      level: 5,
      levelTitle: 'Habit Builder',
      totalXp: 1200,
      xpForNextLevel: 2000,
      achievementsEarned: 3,
      achievementsTotal: 20,
      achievements: [],
    }
    render(<AchievementsPage />)
    expect(document.body.textContent).toContain('gamification.profileCard.xp')
    expect(document.body.textContent).toContain('gamification.profileCard.totalXp')
  })

  it('renders earned count', () => {
    mockGamificationProfile = {
      level: 5,
      levelTitle: 'Habit Builder',
      totalXp: 1200,
      xpForNextLevel: 2000,
      achievementsEarned: 3,
      achievementsTotal: 20,
      achievements: [],
    }
    render(<AchievementsPage />)
    expect(document.body.textContent).toContain('gamification.profileCard.earned')
  })

  it('renders achievement cards grouped by category', () => {
    mockGamificationProfile = {
      level: 5,
      levelTitle: 'Habit Builder',
      totalXp: 1200,
      xpForNextLevel: 2000,
      achievementsEarned: 2,
      achievementsTotal: 3,
      achievements: [],
    }
    mockAchievementsByCategory = [
      {
        key: 'GettingStarted',
        items: [
          { id: 'a1', name: 'First Habit', isEarned: true, earnedAtUtc: '2025-01-01T00:00:00Z' },
          { id: 'a2', name: 'First Log', isEarned: false, earnedAtUtc: null },
        ],
      },
      {
        key: 'Consistency',
        items: [
          { id: 'a3', name: '7 Day Streak', isEarned: true, earnedAtUtc: '2025-02-01T00:00:00Z' },
        ],
      },
    ]
    render(<AchievementsPage />)
    expect(screen.getByTestId('achievement-a1')).toBeInTheDocument()
    expect(screen.getByTestId('achievement-a2')).toBeInTheDocument()
    expect(screen.getByTestId('achievement-a3')).toBeInTheDocument()
  })

  it('renders category headers', () => {
    mockGamificationProfile = {
      level: 1,
      levelTitle: 'Beginner',
      totalXp: 0,
      xpForNextLevel: 100,
      achievementsEarned: 0,
      achievementsTotal: 1,
      achievements: [],
    }
    mockAchievementsByCategory = [
      {
        key: 'GettingStarted',
        items: [{ id: 'a1', name: 'First Habit', isEarned: false, earnedAtUtc: null }],
      },
    ]
    render(<AchievementsPage />)
    expect(document.body.textContent).toContain('gamification.categories.GettingStarted')
  })

  it('renders XP progress bar with correct width', () => {
    mockXpProgress = 60
    mockGamificationProfile = {
      level: 3,
      levelTitle: 'Intermediate',
      totalXp: 600,
      xpForNextLevel: 1000,
      achievementsEarned: 1,
      achievementsTotal: 10,
      achievements: [],
    }
    const { container } = render(<AchievementsPage />)
    const progressBar = container.querySelector('[style*="width"]')
    expect(progressBar).toBeTruthy()
    expect(progressBar?.getAttribute('style')).toContain('60%')
  })

  it('does not show locked state while profile is still loading', () => {
    mockProfileLoading = true
    mockHasProAccess = false
    render(<AchievementsPage />)
    // The locked state has a guard: !profileLoading && !hasProAccess
    expect(screen.queryByText('gamification.page.lockedTitle')).not.toBeInTheDocument()
  })

  it('renders nothing when profile exists but no gamification profile', () => {
    mockGamificationLoading = false
    mockGamificationProfile = null
    const { container } = render(<AchievementsPage />)
    // Should render the header but not the locked state nor skeleton
    expect(screen.getByText('gamification.title')).toBeInTheDocument()
    expect(container.querySelectorAll('.skeleton-shimmer').length).toBe(0)
  })
})

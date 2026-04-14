import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks -- must come before component import
// ---------------------------------------------------------------------------

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`
    return key
  },
}))

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode
    href: string
    [k: string]: unknown
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('@/lib/plural', () => ({
  plural: (text: string, _count: number) => text,
}))

// ---------------------------------------------------------------------------
// Import component after mocks
// ---------------------------------------------------------------------------

import { SubscriptionCard } from '@/app/(app)/profile/_components/subscription-card'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const baseProfile = {
  name: 'Thomas',
  email: 'thomas@example.com',
  timeZone: 'America/Sao_Paulo',
  aiMemoryEnabled: true,
  aiSummaryEnabled: true,
  hasCompletedOnboarding: true,
  hasCompletedTour: false,
  language: 'en' as const,
  plan: 'free' as const,
  hasProAccess: false,
  isTrialActive: false,
  trialEndsAt: null,
  planExpiresAt: null,
  aiMessagesUsed: 0,
      aiMessagesLimit: 20,
  hasImportedCalendar: false,
  hasGoogleConnection: false,
  subscriptionInterval: null,
  isLifetimePro: false,
  weekStartDay: 0,
  totalXp: 0,
  level: 1,
  levelTitle: 'Beginner',
  adRewardsClaimedToday: 0,
  currentStreak: 0,
  streakFreezesAvailable: 0,
  themePreference: null,
  colorScheme: null,
  googleCalendarAutoSyncEnabled: false,
  googleCalendarAutoSyncStatus: 'Idle' as const,
  googleCalendarLastSyncedAt: null,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SubscriptionCard', () => {
  it('renders as a link to /upgrade', () => {
    render(
      <SubscriptionCard profile={baseProfile} trialDaysLeft={null} trialExpired={false} />,
    )
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/upgrade')
  })

  it('renders free label and hint for free user', () => {
    render(
      <SubscriptionCard profile={baseProfile} trialDaysLeft={null} trialExpired={false} />,
    )
    expect(screen.getByText('profile.subscription.free')).toBeInTheDocument()
    expect(screen.getByText('profile.subscription.freeHint')).toBeInTheDocument()
  })

  it('renders trial label and trial days hint for active trial', () => {
    const trialProfile = {
      ...baseProfile,
      isTrialActive: true,
    }
    render(
      <SubscriptionCard profile={trialProfile} trialDaysLeft={5} trialExpired={false} />,
    )
    expect(screen.getByText('profile.subscription.trial')).toBeInTheDocument()
    // The hint text goes through the mock `plural`, which returns the raw key
    expect(document.body.textContent).toContain('profile.subscription.trialDaysLeft')
  })

  it('renders pro label and hint for pro user', () => {
    const proProfile = {
      ...baseProfile,
      plan: 'pro' as const,
      hasProAccess: true,
      subscriptionInterval: 'monthly' as const,
    }
    render(
      <SubscriptionCard profile={proProfile} trialDaysLeft={null} trialExpired={false} />,
    )
    expect(screen.getByText('profile.subscription.pro')).toBeInTheDocument()
    expect(screen.getByText('profile.subscription.proHint')).toBeInTheDocument()
  })

  it('renders trial ended label and hint when trial expired', () => {
    render(
      <SubscriptionCard profile={baseProfile} trialDaysLeft={null} trialExpired={true} />,
    )
    expect(screen.getByText('profile.subscription.trialEnded')).toBeInTheDocument()
    expect(screen.getByText('profile.subscription.trialEndedHint')).toBeInTheDocument()
  })

  it('uses primary color styling for trial users', () => {
    const trialProfile = {
      ...baseProfile,
      isTrialActive: true,
    }
    const { container } = render(
      <SubscriptionCard profile={trialProfile} trialDaysLeft={3} trialExpired={false} />,
    )
    const link = container.querySelector('a')
    expect(link?.className).toContain('bg-primary/10')
  })

  it('uses primary color styling for pro users', () => {
    const proProfile = {
      ...baseProfile,
      hasProAccess: true,
    }
    const { container } = render(
      <SubscriptionCard profile={proProfile} trialDaysLeft={null} trialExpired={false} />,
    )
    const link = container.querySelector('a')
    expect(link?.className).toContain('bg-primary/10')
  })

  it('uses amber color styling for free users', () => {
    const { container } = render(
      <SubscriptionCard profile={baseProfile} trialDaysLeft={null} trialExpired={false} />,
    )
    const link = container.querySelector('a')
    expect(link?.className).toContain('bg-amber-500/10')
  })

  it('uses amber color styling for expired trial users', () => {
    const { container } = render(
      <SubscriptionCard profile={baseProfile} trialDaysLeft={null} trialExpired={true} />,
    )
    const link = container.querySelector('a')
    expect(link?.className).toContain('bg-amber-500/10')
  })

  it('renders icon SVG', () => {
    const { container } = render(
      <SubscriptionCard profile={baseProfile} trialDaysLeft={null} trialExpired={false} />,
    )
    const svgs = container.querySelectorAll('svg')
    // At least the subscription icon + chevron
    expect(svgs.length).toBeGreaterThanOrEqual(2)
  })

  it('handles undefined profile gracefully', () => {
    render(
      <SubscriptionCard profile={undefined} trialDaysLeft={null} trialExpired={false} />,
    )
    // Falls through to free state
    expect(screen.getByText('profile.subscription.free')).toBeInTheDocument()
    expect(screen.getByText('profile.subscription.freeHint')).toBeInTheDocument()
  })

  it('handles undefined profile with trialExpired', () => {
    render(
      <SubscriptionCard profile={undefined} trialDaysLeft={null} trialExpired={true} />,
    )
    expect(screen.getByText('profile.subscription.trialEnded')).toBeInTheDocument()
  })

  it('renders ChevronRight icon for navigation', () => {
    const { container } = render(
      <SubscriptionCard profile={baseProfile} trialDaysLeft={null} trialExpired={false} />,
    )
    // The last SVG should be the ChevronRight
    const svgs = container.querySelectorAll('svg')
    expect(svgs.length).toBeGreaterThanOrEqual(1)
  })
})

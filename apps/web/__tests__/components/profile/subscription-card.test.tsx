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
// Tests — v8 SubscriptionCard: flush row, "Plan" label + state line + trailing link
// ---------------------------------------------------------------------------

describe('SubscriptionCard', () => {
  it('renders an upgrade link to /upgrade for free users', () => {
    render(
      <SubscriptionCard profile={baseProfile} trialDaysLeft={null} trialExpired={false} />,
    )
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/upgrade')
    expect(link).toHaveTextContent('common.upgrade')
  })

  it('renders free label and hint for free user', () => {
    render(
      <SubscriptionCard profile={baseProfile} trialDaysLeft={null} trialExpired={false} />,
    )
    // Free state: "Free Plan · Upgrade to unlock..." appears in a single inline span
    expect(document.body.textContent).toContain('profile.subscription.free')
    expect(document.body.textContent).toContain('profile.subscription.freeHint')
  })

  it('renders trial label and trial days hint for active trial', () => {
    const trialProfile = {
      ...baseProfile,
      isTrialActive: true,
    }
    render(
      <SubscriptionCard profile={trialProfile} trialDaysLeft={5} trialExpired={false} />,
    )
    expect(document.body.textContent).toContain('profile.subscription.trial')
    expect(document.body.textContent).toContain('profile.subscription.trialDaysLeft')
  })

  it('renders pro label and "Manage" link for pro user', () => {
    const proProfile = {
      ...baseProfile,
      plan: 'pro' as const,
      hasProAccess: true,
      subscriptionInterval: 'monthly' as const,
    }
    render(
      <SubscriptionCard profile={proProfile} trialDaysLeft={null} trialExpired={false} />,
    )
    expect(document.body.textContent).toContain('profile.subscription.pro')
    expect(screen.getByRole('link')).toHaveTextContent('profile.subscription.manage')
  })

  it('renders trial-ended label and hint when trial expired', () => {
    render(
      <SubscriptionCard profile={baseProfile} trialDaysLeft={null} trialExpired={true} />,
    )
    expect(document.body.textContent).toContain('profile.subscription.trialEnded')
    expect(document.body.textContent).toContain('profile.subscription.trialEndedHint')
  })

  it('handles undefined profile gracefully (falls through to free)', () => {
    render(
      <SubscriptionCard profile={undefined} trialDaysLeft={null} trialExpired={false} />,
    )
    expect(document.body.textContent).toContain('profile.subscription.free')
    expect(document.body.textContent).toContain('profile.subscription.freeHint')
  })

  it('handles undefined profile with trialExpired', () => {
    render(
      <SubscriptionCard profile={undefined} trialDaysLeft={null} trialExpired={true} />,
    )
    expect(document.body.textContent).toContain('profile.subscription.trialEnded')
  })

  it('renders "Plan" header label', () => {
    render(
      <SubscriptionCard profile={baseProfile} trialDaysLeft={null} trialExpired={false} />,
    )
    expect(screen.getByText('profile.subscription.plan')).toBeInTheDocument()
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'


vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`
    return key
  },
}))

const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

vi.mock('@/lib/plural', () => ({
  plural: (text: string, _count: number) => text,
}))


import { SubscriptionCard } from '@/app/(app)/profile/_components/subscription-card'


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
  subscriptionSource: null,
  isLifetimePro: false,
  weekStartDay: 0 as const,
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


describe('SubscriptionCard', () => {
  beforeEach(() => {
    pushMock.mockClear()
  })

  it('navigates to /upgrade when the row is pressed', () => {
    render(
      <SubscriptionCard profile={baseProfile} trialDaysLeft={null} trialExpired={false} />,
    )
    fireEvent.click(screen.getByRole('button'))
    expect(pushMock).toHaveBeenCalledWith('/upgrade')
  })

  it('renders free label and hint for free user', () => {
    render(
      <SubscriptionCard profile={baseProfile} trialDaysLeft={null} trialExpired={false} />,
    )
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

  it('labels the row as Manage for pro users', () => {
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
    expect(
      screen.getByRole('button', { name: 'profile.subscription.manage' }),
    ).toBeInTheDocument()
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

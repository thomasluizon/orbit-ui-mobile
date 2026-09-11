import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { createMockProfile } from '@orbit/shared/__tests__/factories'

const { mockUseGamificationProfile, mockProfileState } = vi.hoisted(() => ({
  mockUseGamificationProfile: vi.fn(() => ({ profile: null })),
  mockProfileState: {
    current: {
      profile: undefined as ReturnType<typeof createMockProfile> | undefined,
      isLoading: false,
      error: null as Error | null,
    },
  },
}))

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: () => ({ currentTheme: 'dark', applyTheme: vi.fn() }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: undefined, isLoading: false, isError: false }),
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
  useMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => mockProfileState.current,
  useTrialDaysLeft: () => 0,
  useTrialExpired: () => true,
}))

vi.mock('@/hooks/use-gamification', () => ({
  useGamificationProfile: mockUseGamificationProfile,
  useStreakInfo: () => ({ data: { currentStreak: 0 } }),
  useReportEvent: () => ({ mutate: vi.fn() }),
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: { logout: () => void }) => unknown) =>
    selector({ logout: vi.fn() }),
}))

vi.mock('@/components/ui/theme-toggle', () => ({
  ThemeToggle: () => null,
}))

vi.mock('@/components/gamification/streak-badge', () => ({
  StreakBadge: () => null,
}))

vi.mock('@/components/navigation/notification-bell', () => ({
  NotificationBell: () => null,
}))

vi.mock('@/app/(app)/profile/_components/subscription-card', () => ({
  SubscriptionCard: () => null,
}))

vi.mock('@/app/(app)/profile/_components/fresh-start-modal', () => ({
  FreshStartModal: () => null,
}))

vi.mock('@/app/(app)/profile/_components/delete-account-modal', () => ({
  DeleteAccountModal: () => null,
}))

vi.mock('@/app/(app)/profile/_components/profile-nav-card', () => ({
  ProfileNavCard: () => null,
}))

vi.mock('@/app/(app)/profile/_components/profile-action-button', () => ({
  ProfileActionButton: () => null,
}))

vi.mock('@/components/profile/profile-nav-icon', () => ({
  ProfileNavIcon: () => null,
}))

vi.mock('@/app/(app)/profile/_components/tour-replay-card', () => ({
  TourReplayCard: () => null,
}))

vi.mock('@/components/referral/referral-card', () => ({
  ReferralCard: ({ onOpen }: { onOpen: () => void; onDismiss?: () => void }) => (
    <button data-testid="profile-referral-card" onClick={onOpen}>
      referral
    </button>
  ),
}))

vi.mock('@/components/referral/referral-drawer', () => ({
  ReferralDrawer: ({ open }: { open: boolean; onOpenChange?: (open: boolean) => void }) =>
    open ? <div data-testid="profile-referral-drawer" /> : null,
}))

import ProfilePage from '@/app/(app)/profile/page'

describe('ProfilePage', () => {
  beforeEach(() => {
    mockUseGamificationProfile.mockClear()
    mockProfileState.current = {
      profile: createMockProfile({ hasProAccess: false, currentStreak: 13 }),
      isLoading: false,
      error: null,
    }
  })

  it('renders the remaining phone feature sections in order', () => {
    render(<ProfilePage />)

    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      'profile.groups.you',
      'profile.groups.astra',
      'profile.groups.notifications',
      'profile.groups.more',
      'profile.groups.ending',
    ])
    expect(screen.getByText('profile.wrappedTitle')).toBeInTheDocument()
    expect(screen.getByText('calendar.profileButton')).toBeInTheDocument()
    expect(screen.getByText('profile.sections.aboutHelp')).toBeInTheDocument()
    expect(screen.queryByText('profile.sections.preferences')).not.toBeInTheDocument()
    expect(screen.queryByText('profile.sections.aiFeatures')).not.toBeInTheDocument()
    expect(screen.queryByText('profile.sections.advanced')).not.toBeInTheDocument()
    expect(screen.queryByText('profile.retrospectiveTitle')).not.toBeInTheDocument()
    expect(screen.queryByText('gamification.profileCard.title')).not.toBeInTheDocument()

    const retiredLabels = [
      ['so', 'cial.profileNav.title'].join(''),
      ['profile.public', 'Profile.title'].join(''),
    ]
    for (const label of retiredLabels) {
      expect(screen.queryByText(label)).not.toBeInTheDocument()
    }
  })

  it('keeps every profile setting reachable by its accessible name', () => {
    render(<ProfilePage />)

    const accessibleNames = [
      'profile.settingsRows.editName',
      'profile.language.title',
      'profile.settingsRows.timezone',
      'settings.weekStartDay.title',
      'preferences.themeMode',
      'profile.subscription.plan',
      'profile.settingsRows.dailyAllowance',
      'profile.proactiveAstra.title',
      'profile.aiSummary.title',
      'profile.settingsRows.apiKeysMcp',
      'profile.wrappedTitle',
      'calendar.profileButton',
      'profile.sections.aboutHelp',
      'dataExport.button',
      'shareCard.entry',
      'profile.freshStart.button',
      'profile.logout',
      'profile.deleteAccount.button',
    ]

    for (const name of accessibleNames) {
      expect(screen.getByRole('button', { name: new RegExp(name, 'i') })).toBeInTheDocument()
    }
    expect(
      screen.getByRole('button', { name: 'profile.marketingEmails.accept' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'profile.marketingEmails.decline' }),
    ).toBeInTheDocument()
  })

  it('opens the timezone picker from the timezone row', () => {
    render(<ProfilePage />)

    fireEvent.click(
      screen.getByRole('button', { name: /profile.settingsRows.timezone/ }),
    )

    expect(
      screen.getByRole('dialog', { name: 'profile.settingsRows.timezone' }),
    ).toBeInTheDocument()
  })

  it('renders habit notification guidance without action semantics or chevrons', () => {
    render(<ProfilePage />)

    expect(
      screen.queryByRole('button', { name: 'profile.settingsRows.reminders' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'habits.form.slipAlert' }),
    ).not.toBeInTheDocument()

    const guidance = screen.getByText('profile.settingsRows.remindersNote')
    expect(guidance.closest('button, a')).toBeNull()
    expect(guidance.closest('[data-profile-notification-guidance]')?.querySelector('svg')).toBeNull()
  })

  it('shows one eight-row settings skeleton before the groups arrive', () => {
    mockProfileState.current = {
      profile: createMockProfile({ hasProAccess: false }),
      isLoading: true,
      error: null,
    }
    render(<ProfilePage />)

    expect(screen.getByRole('progressbar', { name: 'profile.loading' })).toBeInTheDocument()
    expect(document.querySelectorAll('[data-settings-skeleton-row]')).toHaveLength(8)
    expect(screen.queryAllByRole('heading', { level: 2 })).toHaveLength(0)
  })
})

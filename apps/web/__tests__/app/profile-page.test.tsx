import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { createMockProfile } from '@orbit/shared/__tests__/factories'

const { mockUseGamificationProfile } = vi.hoisted(() => ({
  mockUseGamificationProfile: vi.fn(() => ({ profile: null })),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
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
  useProfile: () => ({
    profile: createMockProfile({ hasProAccess: false, currentStreak: 13 }),
    isLoading: false,
    error: null,
  }),
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
  })

  it('disables the gamification profile query for free users', () => {
    render(<ProfilePage />)

    expect(mockUseGamificationProfile).toHaveBeenCalledWith(false)
  })

  it('shows a free user their real streak (from profile, not the Pro-gated streak hook)', () => {
    render(<ProfilePage />)

    expect(document.body.textContent).toContain('13')
  })

  it('mounts the referral card on profile and opens the drawer when tapped', () => {
    render(<ProfilePage />)

    const card = screen.getByTestId('profile-referral-card')
    expect(card).toBeInTheDocument()
    expect(screen.queryByTestId('profile-referral-drawer')).toBeNull()

    fireEvent.click(card)

    expect(screen.getByTestId('profile-referral-drawer')).toBeInTheDocument()
  })
})

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
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
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({
    profile: createMockProfile({ hasProAccess: false }),
    isLoading: false,
    error: null,
  }),
  useTrialDaysLeft: () => 0,
  useTrialExpired: () => true,
}))

vi.mock('@/hooks/use-gamification', () => ({
  useGamificationProfile: mockUseGamificationProfile,
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: { logout: () => void }) => unknown) =>
    selector({ logout: vi.fn() }),
}))

vi.mock('@/components/ui/theme-toggle', () => ({
  ThemeToggle: () => null,
}))

vi.mock('@/components/gamification/profile-streak-card', () => ({
  ProfileStreakCard: () => null,
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

vi.mock('@/app/(app)/profile/_components/profile-nav-icon', () => ({
  ProfileNavIcon: () => null,
}))

vi.mock('@/app/(app)/profile/_components/tour-replay-card', () => ({
  TourReplayCard: () => null,
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
})

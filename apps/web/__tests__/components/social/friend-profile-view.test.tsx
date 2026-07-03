import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { achievementEmoji, ApiClientError } from '@orbit/shared/utils'
import type { FriendProfileView as FriendProfileViewData } from '@orbit/shared/types/social'

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const translate = (key: string, params?: Record<string, unknown>) =>
      params ? `${key}(${JSON.stringify(params)})` : key
    translate.has = () => false
    return translate
  },
  useLocale: () => 'en',
}))

vi.mock('@/components/ui/app-overlay', () => ({
  AppOverlay: ({ open, children, title }: {
    open: boolean; children: React.ReactNode; title?: string
  }) => {
    if (!open) return null
    return (
      <div data-testid="overlay">
        {title && <h2>{title}</h2>}
        {children}
      </div>
    )
  },
}))

const mocks = vi.hoisted(() => ({
  profileReturn: {} as Record<string, unknown>,
}))

vi.mock('@/hooks/use-friends', () => ({
  useFriendProfile: () => mocks.profileReturn,
}))

import { FriendProfileView } from '@/app/(app)/social/_components/friend-profile-view'

const profileView: FriendProfileViewData = {
  userId: 'user-1',
  handle: 'ada',
  displayName: 'Ada Lovelace',
  currentStreak: 12,
  longestStreak: 40,
  level: 4,
  levelTitle: 'Navigator',
  totalXp: 820,
  friendsSinceUtc: '2026-05-01T00:00:00Z',
  weeklyActivity: [0, 1, 0, 2, 0, 3, 1],
  achievements: [],
  topHabits: [],
  isAccountabilityPartner: false,
  sharedChallenges: [],
}

const refetch = vi.fn()

function setProfileReturn(overrides: Record<string, unknown>) {
  mocks.profileReturn = {
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    refetch,
    ...overrides,
  }
}

function renderView() {
  return render(
    <FriendProfileView
      userId="user-1"
      displayName="Ada Lovelace"
      open
      onOpenChange={vi.fn()}
    />,
  )
}

describe('FriendProfileView', () => {
  beforeEach(() => {
    refetch.mockClear()
  })

  it('announces the loading state through a labeled status region', () => {
    setProfileReturn({ isLoading: true })
    renderView()
    expect(screen.getByRole('status', { name: 'common.loading' })).toBeInTheDocument()
  })

  it('shows the permanent unavailable copy without a retry action on 404', () => {
    setProfileReturn({ isError: true, error: new ApiClientError(404, 'not found') })
    renderView()
    expect(screen.getByText('social.friendProfile.unavailable')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'common.retry' })).not.toBeInTheDocument()
  })

  it('shows the unavailable copy when the view is missing without an error', () => {
    setProfileReturn({ data: undefined })
    renderView()
    expect(screen.getByText('social.friendProfile.unavailable')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'common.retry' })).not.toBeInTheDocument()
  })

  it('offers a retry that refetches on transient failures', () => {
    setProfileReturn({ isError: true, error: new ApiClientError(500, 'server down') })
    renderView()
    expect(screen.getByText('social.friendProfile.loadError')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('treats unknown failures as retryable too', () => {
    setProfileReturn({ isError: true, error: new Error('network gone') })
    renderView()
    expect(screen.getByRole('button', { name: 'common.retry' })).toBeInTheDocument()
  })

  it('renders the enriched stat tiles and the empty achievements line', () => {
    setProfileReturn({ data: profileView })
    renderView()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('40')).toBeInTheDocument()
    expect(screen.getByText('820')).toBeInTheDocument()
    expect(screen.getByText('Navigator')).toBeInTheDocument()
    expect(screen.getByText('social.friendProfile.noAchievements')).toBeInTheDocument()
  })

  it('renders top habits with their completion counts', () => {
    setProfileReturn({
      data: {
        ...profileView,
        topHabits: [{ title: 'Reading', emoji: '📖', completionCount: 33 }],
      },
    })
    renderView()
    expect(screen.getByText('Reading')).toBeInTheDocument()
    expect(screen.getByText('33')).toBeInTheDocument()
  })

  it('renders shared context when the friend is a partner and shares challenges', () => {
    setProfileReturn({
      data: {
        ...profileView,
        isAccountabilityPartner: true,
        sharedChallenges: [{ id: 'c-1', title: 'Sunrise Sprint' }],
      },
    })
    renderView()
    expect(screen.getByText('social.friendProfile.accountabilityPartner')).toBeInTheDocument()
    expect(screen.getByText('Sunrise Sprint')).toBeInTheDocument()
  })

  it('omits the shared context section when there is nothing to show', () => {
    setProfileReturn({ data: profileView })
    renderView()
    expect(screen.queryByText('social.friendProfile.accountabilityPartner')).not.toBeInTheDocument()
    expect(screen.queryByText('social.friendProfile.sharedChallengesTitle')).not.toBeInTheDocument()
  })

  it('prefixes achievement chips with the shared achievement glyph', () => {
    setProfileReturn({
      data: {
        ...profileView,
        achievements: [{ name: 'First Steps', iconKey: 'first_habit', rarity: 'Common' }],
      },
    })
    renderView()
    const chip = screen.getByRole('listitem')
    expect(chip).toHaveTextContent(`${achievementEmoji('first_habit')} First Steps`)
    expect(screen.queryByText('social.friendProfile.noAchievements')).not.toBeInTheDocument()
  })
})

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
  level: 4,
  achievements: [],
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

  it('renders the level numeral with its label and the empty achievements line', () => {
    setProfileReturn({ data: profileView })
    renderView()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('social.friendProfile.levelLabel')).toBeInTheDocument()
    expect(screen.getByText('social.friendProfile.noAchievements')).toBeInTheDocument()
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

import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { FriendFeedItem } from '@orbit/shared/types/social'

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const translate = (key: string, params?: Record<string, unknown>) =>
      params ? `${key}(${JSON.stringify(params)})` : key
    translate.has = () => false
    return translate
  },
}))

vi.mock('@/app/(app)/social/_components/friend-profile-view', () => ({
  FriendProfileView: ({ open, userId }: { open: boolean; userId: string | null }) =>
    open ? <div data-testid="friend-profile" data-user-id={userId ?? ''} /> : null,
}))

import { FeedEventCard } from '@/app/(app)/social/_components/feed-event-card'

const item: FriendFeedItem = {
  id: 'feed-1',
  actorUserId: 'user-9',
  actorHandle: 'grace',
  actorDisplayName: 'Grace',
  type: 'StreakMilestone',
  value: 7,
  achievementId: null,
  createdAtUtc: '2026-05-01T00:00:00Z',
}

describe('FeedEventCard', () => {
  it('opens the actor profile from the identity press target', () => {
    render(<FeedEventCard item={item} onCheer={vi.fn()} />)
    expect(screen.queryByTestId('friend-profile')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /social\.feed\.viewProfile/ }))

    const profile = screen.getByTestId('friend-profile')
    expect(profile).toHaveAttribute('data-user-id', 'user-9')
  })

  it('keeps Cheer a separate action that does not open the profile', () => {
    const onCheer = vi.fn()
    render(<FeedEventCard item={item} onCheer={onCheer} />)

    fireEvent.click(screen.getByRole('button', { name: 'social.feed.cheerAction' }))

    expect(onCheer).toHaveBeenCalledWith({ recipientId: 'user-9', displayName: 'Grace' })
    expect(screen.queryByTestId('friend-profile')).not.toBeInTheDocument()
  })
})

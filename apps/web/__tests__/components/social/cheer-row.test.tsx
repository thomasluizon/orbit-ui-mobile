import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createMockCheer } from '@orbit/shared/__tests__/factories'

const mocks = vi.hoisted(() => ({
  cheersReturn: { data: undefined as unknown },
}))

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const translate = (key: string, params?: Record<string, unknown>) =>
      params ? `${key}(${JSON.stringify(params)})` : key
    translate.has = () => false
    return translate
  },
}))

vi.mock('@/hooks/use-friends', () => ({
  useCheers: () => mocks.cheersReturn,
  useFriendFeed: () => ({
    data: { pages: [{ items: [], nextCursor: null }] },
    hasNextPage: false,
    isLoading: false,
    isError: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  }),
}))

vi.mock('@/app/(app)/social/_components/friend-profile-view', () => ({
  FriendProfileView: ({ open, userId }: { open: boolean; userId: string | null }) =>
    open ? <div data-testid="friend-profile" data-user-id={userId ?? ''} /> : null,
}))

import { SocialFeed } from '@/app/(app)/social/_components/social-feed'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.cheersReturn = { data: { items: [] } }
})

describe('SocialFeed received cheers', () => {
  it('opens the sender profile from a cheer identity press target', () => {
    mocks.cheersReturn = {
      data: { items: [createMockCheer({ senderId: 'user-7', senderDisplayName: 'Grace' })] },
    }

    render(<SocialFeed onCheer={vi.fn()} onAddFriends={vi.fn()} />)
    expect(screen.queryByTestId('friend-profile')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /social\.feed\.viewProfile/ }))

    expect(screen.getByTestId('friend-profile')).toHaveAttribute('data-user-id', 'user-7')
  })

  it('renders a cheer without a sender id as a non-interactive row', () => {
    mocks.cheersReturn = {
      data: { items: [createMockCheer({ senderId: '', senderDisplayName: 'Orbit' })] },
    }

    render(<SocialFeed onCheer={vi.fn()} onAddFriends={vi.fn()} />)

    expect(
      screen.queryByRole('button', { name: /social\.feed\.viewProfile/ }),
    ).not.toBeInTheDocument()
  })
})

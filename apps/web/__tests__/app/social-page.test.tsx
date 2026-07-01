import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import {
  createMockFriendFeedItem,
  createMockFriendRequestSummary,
  createMockProfile,
} from '@orbit/shared/__tests__/factories'

const mocks = vi.hoisted(() => ({
  profileReturn: { profile: undefined as unknown, isLoading: false },
  friendsReturn: { data: undefined as unknown },
  feedReturn: {
    data: undefined as unknown,
    hasNextPage: false,
    isLoading: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  },
  cheersReturn: { data: undefined as unknown },
  acceptMutate: vi.fn(),
  removeMutate: vi.fn(),
  sendCheerMutate: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}(${JSON.stringify(params)})` : key,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

vi.mock('@/components/ui/app-bar', () => ({ AppBar: () => null }))
vi.mock('@/components/ui/gradient-top', () => ({ GradientTop: () => null }))

vi.mock('@/components/ui/app-overlay', () => ({
  AppOverlay: ({
    open,
    children,
    footer,
  }: {
    open: boolean
    children?: React.ReactNode
    footer?: React.ReactNode
  }) =>
    open ? (
      <div>
        {children}
        {footer}
      </div>
    ) : null,
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => mocks.profileReturn,
}))

vi.mock('@/hooks/use-friends', () => ({
  useFriends: () => mocks.friendsReturn,
  useFriendFeed: () => mocks.feedReturn,
  useCheers: () => mocks.cheersReturn,
  useSendFriendRequest: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAcceptFriendRequest: () => ({ mutateAsync: mocks.acceptMutate, isPending: false }),
  useRemoveFriend: () => ({ mutateAsync: mocks.removeMutate, isPending: false }),
  useSendCheer: () => ({ mutateAsync: mocks.sendCheerMutate, isPending: false }),
  useBlockUser: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReportUser: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSetHandle: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSetSocialOptIn: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

import SocialPage from '@/app/(app)/social/page'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.profileReturn.profile = createMockProfile({ socialOptIn: true, handle: 'me' })
  mocks.profileReturn.isLoading = false
  mocks.friendsReturn.data = { friends: [], incomingRequests: [], outgoingRequests: [] }
  mocks.feedReturn.data = { pages: [{ items: [], nextCursor: null }] }
  mocks.cheersReturn.data = { items: [] }
  mocks.acceptMutate.mockResolvedValue(null)
  mocks.removeMutate.mockResolvedValue(null)
  mocks.sendCheerMutate.mockResolvedValue({ id: 'cheer-1' })
})

describe('SocialPage', () => {
  it('renders the opt-in gate when social is not enabled', () => {
    mocks.profileReturn.profile = createMockProfile({ socialOptIn: false, handle: 'me' })

    render(<SocialPage />)

    expect(screen.getByText('social.optInGate.title')).toBeInTheDocument()
    expect(screen.queryByText('social.tabs.feed')).not.toBeInTheDocument()
  })

  it('switches from the feed tab to the friends tab', () => {
    render(<SocialPage />)

    expect(screen.getByText('social.feed.emptyTitle')).toBeInTheDocument()

    fireEvent.click(screen.getByText('social.tabs.friends'))

    expect(screen.getByText('social.addFriend.title')).toBeInTheDocument()
  })

  it('accepts with the friendship id and declines with the user id', () => {
    mocks.friendsReturn.data = {
      friends: [],
      incomingRequests: [
        createMockFriendRequestSummary({ id: 'friendship-9', userId: 'user-9' }),
      ],
      outgoingRequests: [],
    }

    render(<SocialPage />)
    fireEvent.click(screen.getByText('social.tabs.friends'))

    fireEvent.click(screen.getByText('social.friends.accept'))
    expect(mocks.acceptMutate).toHaveBeenCalledWith('friendship-9')

    fireEvent.click(screen.getByText('social.friends.decline'))
    expect(mocks.removeMutate).toHaveBeenCalledWith('user-9')
  })

  it('sends a cheer from a feed row and surfaces the success toast', async () => {
    const { toast } = await import('sonner')
    mocks.feedReturn.data = {
      pages: [
        {
          items: [createMockFriendFeedItem({ actorUserId: 'user-2', actorDisplayName: 'Grace' })],
          nextCursor: null,
        },
      ],
    }

    render(<SocialPage />)

    fireEvent.click(screen.getByText('social.feed.cheerAction'))
    fireEvent.click(screen.getByText('social.cheer.send'))

    expect(mocks.sendCheerMutate).toHaveBeenCalledWith({ recipientId: 'user-2', note: undefined })

    await vi.waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('social.cheer.success', expect.anything())
    })
  })
})

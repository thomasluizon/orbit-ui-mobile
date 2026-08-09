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
  friendsReturn: {
    data: undefined as unknown,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
  feedReturn: {
    data: undefined as unknown,
    hasNextPage: false,
    isLoading: false,
    isError: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  },
  cheersReturn: { data: undefined as unknown },
  searchParams: '',
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
  useSearchParams: () => new URLSearchParams(mocks.searchParams),
}))

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

vi.mock('@/components/ui/app-bar', () => ({ AppBar: () => null }))
vi.mock('@/components/ui/gradient-top', () => ({ GradientTop: () => null }))
vi.mock('@/app/(app)/social/_components/invite-hero', () => ({ InviteHero: () => null }))
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
  useFriendProfile: () => ({ data: undefined, isLoading: false, isError: false }),
  useInvitePreview: () => ({ data: undefined, isLoading: false, isError: false, error: null }),
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
  mocks.friendsReturn.isLoading = false
  mocks.friendsReturn.isError = false
  mocks.feedReturn.data = { pages: [{ items: [], nextCursor: null }] }
  mocks.feedReturn.isError = false
  mocks.cheersReturn.data = { items: [] }
  mocks.searchParams = ''
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

    expect(screen.getAllByRole('tab')).toHaveLength(2)
    expect(screen.getByRole('tab', { name: 'social.tabs.feed' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'social.tabs.friends' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByText('social.feed.emptyTitle')).toBeInTheDocument()

    fireEvent.click(screen.getByText('social.tabs.friends'))

    expect(screen.getByText('social.addFriend.title')).toBeInTheDocument()
  })

  /**
   * Codex connector P2 on #698. This used to assert the fallback, which was the defect: a link
   * queued before the deletion still carries `/social?tab=buddies`, so landing silently on the
   * unrelated Feed tab reads as a bug rather than as a retired feature. Parity with
   * `apps/mobile/__tests__/app/social-page.test.tsx`.
   */
  it('redirects a retired buddies deep link to the friends tab', () => {
    mocks.searchParams = `tab=${['budd', 'ies'].join('')}`

    render(<SocialPage />)

    expect(screen.getAllByRole('tab')).toHaveLength(2)
    expect(screen.getByRole('tab', { name: 'social.tabs.friends' })).toHaveAttribute('aria-selected', 'true')
  })

  it('still falls back to the feed for a tab deep link that never existed', () => {
    mocks.searchParams = 'tab=not-a-tab'

    render(<SocialPage />)

    expect(screen.getByRole('tab', { name: 'social.tabs.feed' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('social.feed.emptyTitle')).toBeInTheDocument()
  })

  /**
   * Codex connector P2 on #698. The desktop topbar keeps NotificationBell mounted, so opening a
   * stored `/social?tab=buddies` while already on `/social` is a QUERY-ONLY navigation: the page
   * never remounts, so a `useState` initializer alone left the user on Feed.
   */
  it('re-resolves the tab on a query-only navigation, without remounting', () => {
    mocks.searchParams = ''
    const { rerender } = render(<SocialPage />)
    expect(screen.getByRole('tab', { name: 'social.tabs.feed' })).toHaveAttribute('aria-selected', 'true')

    mocks.searchParams = `tab=${['budd', 'ies'].join('')}`
    rerender(<SocialPage />)

    expect(screen.getByRole('tab', { name: 'social.tabs.friends' })).toHaveAttribute('aria-selected', 'true')
  })

  it('does not clobber a tab the user chose when the query has not changed', () => {
    mocks.searchParams = ''
    const { rerender } = render(<SocialPage />)

    fireEvent.click(screen.getByRole('tab', { name: 'social.tabs.friends' }))
    expect(screen.getByRole('tab', { name: 'social.tabs.friends' })).toHaveAttribute('aria-selected', 'true')

    rerender(<SocialPage />)

    expect(screen.getByRole('tab', { name: 'social.tabs.friends' })).toHaveAttribute('aria-selected', 'true')
  })

  it('opens the friends tab from a friends deep link', () => {
    mocks.searchParams = 'tab=friends'

    render(<SocialPage />)

    expect(screen.getByRole('tab', { name: 'social.tabs.friends' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByText('social.addFriend.title')).toBeInTheDocument()
    expect(screen.queryByText('social.feed.emptyTitle')).not.toBeInTheDocument()
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

  it('shows a retry action when the feed query fails and refetches it', () => {
    mocks.feedReturn.isError = true

    render(<SocialPage />)

    expect(screen.getByText('social.errors.loadFailed')).toBeInTheDocument()
    expect(screen.queryByText('social.feed.emptyTitle')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('common.retry'))
    expect(mocks.feedReturn.refetch).toHaveBeenCalled()
  })

  it('shows a retry action when the friends query fails', () => {
    mocks.friendsReturn.isError = true

    render(<SocialPage />)
    fireEvent.click(screen.getByText('social.tabs.friends'))

    expect(screen.getByText('social.errors.loadFailed')).toBeInTheDocument()
    expect(screen.queryByText('social.friends.emptyTitle')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('common.retry'))
    expect(mocks.friendsReturn.refetch).toHaveBeenCalled()
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

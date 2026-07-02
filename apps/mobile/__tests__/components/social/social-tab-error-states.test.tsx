import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SocialFeed } from '@/app/social/_components/social-feed'
import { SocialFriends } from '@/app/social/_components/social-friends'
import { AccountabilitySection } from '@/app/social/_components/accountability-section'

const mocks = vi.hoisted(() => ({
  feedReturn: {} as Record<string, unknown>,
  cheersReturn: { data: undefined } as Record<string, unknown>,
  friendsReturn: {} as Record<string, unknown>,
  pairsReturn: {} as Record<string, unknown>,
  feedRefetch: vi.fn(),
  friendsRefetch: vi.fn(),
  pairsRefetch: vi.fn(),
}))

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}))

vi.mock('@/hooks/use-friends', () => ({
  useFriendFeed: () => mocks.feedReturn,
  useCheers: () => mocks.cheersReturn,
  useFriends: () => mocks.friendsReturn,
  useFriendProfile: () => ({ data: undefined, isLoading: false, isError: false }),
  useAcceptFriendRequest: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemoveFriend: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useBlockUser: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReportUser: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

vi.mock('@/hooks/use-accountability', () => ({
  useAccountabilityPairs: () => mocks.pairsReturn,
  useAcceptAccountabilityPair: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useEndAccountabilityPair: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCheckInAccountability: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: undefined, isLoading: false }),
}))

vi.mock('@/hooks/use-habits', () => ({
  useHabits: () => ({ data: undefined }),
  EMPTY_HABITS_BY_ID: new Map(),
  EMPTY_CHILDREN_BY_PARENT: new Map(),
  EMPTY_NORMALIZED_HABITS: [],
}))

vi.mock('@/app/social/_components/add-friend-form', () => ({
  AddFriendForm: () => null,
}))

vi.mock('@/app/social/_components/new-pair-flow', () => ({
  NewPairFlow: () => null,
}))

interface TestNode {
  type: unknown
  props: Record<string, unknown>
  findAll(predicate: (node: TestNode) => boolean): TestNode[]
  find(predicate: (node: TestNode) => boolean): TestNode
  findByType(type: unknown): TestNode
  findAllByType(type: unknown): TestNode[]
}

interface TestTree {
  root: TestNode
}

interface TestRendererApi {
  create(element: React.ReactNode): TestTree
  act(callback: () => Promise<void> | void): Promise<void>
}

const TestRenderer: TestRendererApi = require('react-test-renderer')

async function renderTree(element: React.ReactElement): Promise<TestTree> {
  let tree!: TestTree
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(element)
  })
  return tree
}

function textContents(tree: TestTree): unknown[] {
  return tree.root.findAllByType('Text').map((node) => node.props.children)
}

function retryAction(tree: TestTree): TestNode {
  return tree.root.find(
    (node) =>
      node.type === 'Pressable' &&
      node.props.accessibilityLabel === 'common.retry' &&
      typeof node.props.onPress === 'function',
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.feedReturn = {
    data: undefined,
    isLoading: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: mocks.feedRefetch,
  }
  mocks.cheersReturn = { data: undefined }
  mocks.friendsReturn = {
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: mocks.friendsRefetch,
  }
  mocks.pairsReturn = {
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: mocks.pairsRefetch,
  }
})

describe('social tab error states', () => {
  it('shows the load-failed state on the feed tab and retries on press', async () => {
    mocks.feedReturn.isError = true

    const tree = await renderTree(<SocialFeed onCheer={() => {}} onAddFriends={() => {}} />)

    expect(textContents(tree)).toEqual(expect.arrayContaining(['social.errors.loadFailed']))
    expect(textContents(tree)).not.toEqual(expect.arrayContaining(['social.feed.emptyTitle']))

    await TestRenderer.act(() => {
      ;(retryAction(tree).props.onPress as () => void)()
    })
    expect(mocks.feedRefetch).toHaveBeenCalled()
  })

  it('shows the load-failed state on the friends tab and retries on press', async () => {
    mocks.friendsReturn.isError = true

    const tree = await renderTree(<SocialFriends onCheer={() => {}} />)

    expect(textContents(tree)).toEqual(expect.arrayContaining(['social.errors.loadFailed']))

    await TestRenderer.act(() => {
      ;(retryAction(tree).props.onPress as () => void)()
    })
    expect(mocks.friendsRefetch).toHaveBeenCalled()
  })

  it('labels the friends loading indicator for TalkBack', async () => {
    mocks.friendsReturn.isLoading = true

    const tree = await renderTree(<SocialFriends onCheer={() => {}} />)

    expect(tree.root.findByType('ActivityIndicator').props.accessibilityLabel).toBe(
      'common.loading',
    )
  })

  it('shows the load-failed state on the buddies tab and retries on press', async () => {
    mocks.pairsReturn.isError = true

    const tree = await renderTree(<AccountabilitySection initialHabitId={null} />)

    expect(textContents(tree)).toEqual(expect.arrayContaining(['social.errors.loadFailed']))
    expect(textContents(tree)).not.toEqual(
      expect.arrayContaining(['social.buddies.emptyTitle']),
    )

    await TestRenderer.act(() => {
      ;(retryAction(tree).props.onPress as () => void)()
    })
    expect(mocks.pairsRefetch).toHaveBeenCalled()
  })

  it('labels the buddies loading indicator for TalkBack', async () => {
    mocks.pairsReturn.isLoading = true

    const tree = await renderTree(<AccountabilitySection initialHabitId={null} />)

    expect(tree.root.findByType('ActivityIndicator').props.accessibilityLabel).toBe(
      'common.loading',
    )
  })
})

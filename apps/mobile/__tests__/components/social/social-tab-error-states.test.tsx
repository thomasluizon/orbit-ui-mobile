import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SocialFeed } from '@/app/social/_components/social-feed'
import { SocialFriends } from '@/app/social/_components/social-friends'

const mocks = vi.hoisted((): {
  feedReturn: Record<string, unknown>
  cheersReturn: Record<string, unknown>
  friendsReturn: Record<string, unknown>
  feedRefetch: ReturnType<typeof vi.fn>
  friendsRefetch: ReturnType<typeof vi.fn>
} => ({
  feedReturn: {},
  cheersReturn: { data: undefined },
  friendsReturn: {},
  feedRefetch: vi.fn(),
  friendsRefetch: vi.fn(),
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
  await TestRenderer.act(() => {
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

})

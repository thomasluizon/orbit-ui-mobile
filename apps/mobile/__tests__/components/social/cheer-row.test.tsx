import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FriendFeedItem } from '@orbit/shared/types/social'
import { createMockCheer } from '@orbit/shared/__tests__/factories'
import { SocialFeed } from '@/app/social/_components/social-feed'

const mocks = vi.hoisted(() => ({
  cheersReturn: { data: undefined as unknown },
  feedReturn: {} as Record<string, unknown>,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
    i18n: { language: 'en', exists: () => false },
  }),
}))

vi.mock('@/hooks/use-friends', () => ({
  useCheers: () => mocks.cheersReturn,
  useFriendFeed: () => mocks.feedReturn,
}))

vi.mock('@/app/social/_components/friend-profile-sheet', () => ({
  FriendProfileSheet: ({
    open,
    userId,
    onClose,
  }: {
    open: boolean
    userId: string | null
    onClose: () => void
  }) => {
    if (!open) return null
    const react = require('react')
    return react.createElement(
      'Pressable',
      { accessibilityLabel: 'close-profile', onPress: onClose },
      react.createElement('Text', null, `profile:${userId}`),
    )
  },
}))

interface TestNode {
  type: unknown
  props: Record<string, unknown>
  find(predicate: (node: TestNode) => boolean): TestNode
  findAll(predicate: (node: TestNode) => boolean): TestNode[]
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

const feedItem: FriendFeedItem = {
  id: 'feed-1',
  actorUserId: 'user-9',
  actorHandle: 'grace',
  actorDisplayName: 'Grace',
  type: 'StreakMilestone',
  value: 7,
  achievementId: null,
  createdAtUtc: '2026-05-01T00:00:00Z',
}

function textContents(tree: TestTree): unknown[] {
  return tree.root.findAllByType('Text').map((node) => node.props.children)
}

function openSheets(tree: TestTree): TestNode[] {
  return tree.root.findAll(
    (node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'close-profile',
  )
}

function pressWithLabel(tree: TestTree, label: string): Promise<void> {
  const target = tree.root.find(
    (node) => node.type === 'Pressable' && node.props.accessibilityLabel === label,
  )
  return TestRenderer.act(async () => {
    ;(target.props as { onPress: () => void }).onPress()
  })
}

async function renderFeed(): Promise<TestTree> {
  let tree!: TestTree
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(<SocialFeed onCheer={vi.fn()} onAddFriends={vi.fn()} />)
  })
  return tree
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.cheersReturn = { data: { items: [] } }
  mocks.feedReturn = {
    data: { pages: [{ items: [], nextCursor: null }] },
    hasNextPage: false,
    isLoading: false,
    isError: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  }
})

describe('SocialFeed shared profile sheet', () => {
  it('opens one shared sheet from a cheer identity and closes it', async () => {
    mocks.cheersReturn = {
      data: { items: [createMockCheer({ senderId: 'user-7', senderDisplayName: 'Grace' })] },
    }

    const tree = await renderFeed()
    expect(openSheets(tree)).toHaveLength(0)

    await pressWithLabel(tree, 'social.feed.viewProfile:{"name":"Grace"}')

    expect(openSheets(tree)).toHaveLength(1)
    expect(textContents(tree)).toEqual(expect.arrayContaining(['profile:user-7']))

    await TestRenderer.act(async () => {
      ;(openSheets(tree)[0]!.props as { onPress: () => void }).onPress()
    })

    expect(openSheets(tree)).toHaveLength(0)
    expect(textContents(tree)).not.toEqual(expect.arrayContaining(['profile:user-7']))
  })

  it('opens the same shared sheet from a feed actor identity', async () => {
    mocks.feedReturn = {
      ...mocks.feedReturn,
      data: { pages: [{ items: [feedItem], nextCursor: null }] },
    }

    const tree = await renderFeed()
    expect(openSheets(tree)).toHaveLength(0)

    await pressWithLabel(tree, 'social.feed.viewProfile:{"name":"Grace"}')

    expect(openSheets(tree)).toHaveLength(1)
    expect(textContents(tree)).toEqual(expect.arrayContaining(['profile:user-9']))
  })

  it('renders a cheer without a sender id as a non-interactive row', async () => {
    mocks.cheersReturn = {
      data: { items: [createMockCheer({ senderId: '', senderDisplayName: 'Orbit' })] },
    }

    const tree = await renderFeed()

    const identities = tree.root.findAll(
      (node) =>
        node.type === 'Pressable' &&
        typeof node.props.accessibilityLabel === 'string' &&
        (node.props.accessibilityLabel as string).startsWith('social.feed.viewProfile'),
    )
    expect(identities).toHaveLength(0)
  })
})

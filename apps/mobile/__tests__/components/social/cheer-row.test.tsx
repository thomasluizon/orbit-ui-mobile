import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockCheer } from '@orbit/shared/__tests__/factories'
import { SocialFeed } from '@/app/social/_components/social-feed'

const mocks = vi.hoisted(() => ({
  cheersReturn: { data: undefined as unknown },
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

vi.mock('@/app/social/_components/friend-profile-sheet', () => ({
  FriendProfileSheet: ({ open, userId }: { open: boolean; userId: string | null }) => {
    if (!open) return null
    const react = require('react')
    return react.createElement('Text', null, `profile:${userId}`)
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

function textContents(tree: TestTree): unknown[] {
  return tree.root.findAllByType('Text').map((node) => node.props.children)
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
})

describe('SocialFeed received cheers', () => {
  it('opens the sender profile from a cheer identity press target', async () => {
    mocks.cheersReturn = {
      data: { items: [createMockCheer({ senderId: 'user-7', senderDisplayName: 'Grace' })] },
    }

    const tree = await renderFeed()
    expect(textContents(tree)).not.toEqual(expect.arrayContaining(['profile:user-7']))

    const identity = tree.root.find(
      (node) =>
        node.type === 'Pressable' &&
        node.props.accessibilityLabel === 'social.feed.viewProfile:{"name":"Grace"}',
    )
    await TestRenderer.act(async () => {
      ;(identity.props as { onPress: () => void }).onPress()
    })

    expect(textContents(tree)).toEqual(expect.arrayContaining(['profile:user-7']))
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

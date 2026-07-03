import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockFriendSummary } from '@orbit/shared/__tests__/factories'
import { SocialFriends } from '@/app/social/_components/social-friends'

const mocks = vi.hoisted(() => ({
  friendsReturn: {} as Record<string, unknown>,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
    i18n: { language: 'en', exists: () => false },
  }),
}))

vi.mock('@/app/social/_components/add-friend-form', () => ({
  AddFriendForm: () => null,
}))

vi.mock('@/components/bottom-sheet-modal', () => ({
  BottomSheetModal: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? React.createElement('BottomSheetModal', null, children) : null,
}))

vi.mock('@/components/ui/confirm-dialog', () => ({
  ConfirmDialog: () => null,
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: undefined, isLoading: false }),
}))

vi.mock('@/hooks/use-friends', () => ({
  useFriends: () => mocks.friendsReturn,
  useRemoveFriend: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useBlockUser: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReportUser: () => ({ mutateAsync: vi.fn(), isPending: false }),
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

function textContents(tree: TestTree): unknown[] {
  return tree.root.findAllByType('Text').map((node) => node.props.children)
}

function openSheets(tree: TestTree): TestNode[] {
  return tree.root.findAll(
    (node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'close-profile',
  )
}

async function renderFriends(): Promise<TestTree> {
  let tree!: TestTree
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(<SocialFriends onCheer={vi.fn()} />)
  })
  return tree
}

beforeEach(() => {
  mocks.friendsReturn = {
    data: {
      friends: [createMockFriendSummary({ userId: 'user-1', displayName: 'Ada Lovelace' })],
      incomingRequests: [],
      outgoingRequests: [],
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }
})

describe('SocialFriends shared profile sheet', () => {
  it('opens one shared sheet with the tapped friend and closes it', async () => {
    const tree = await renderFriends()
    expect(openSheets(tree)).toHaveLength(0)

    const identity = tree.root.find(
      (node) =>
        node.type === 'Pressable' &&
        node.props.accessibilityLabel === 'social.friends.viewProfile',
    )
    await TestRenderer.act(async () => {
      ;(identity.props as { onPress: () => void }).onPress()
    })

    expect(openSheets(tree)).toHaveLength(1)
    expect(textContents(tree)).toEqual(expect.arrayContaining(['profile:user-1']))

    await TestRenderer.act(async () => {
      ;(openSheets(tree)[0]!.props as { onPress: () => void }).onPress()
    })

    expect(openSheets(tree)).toHaveLength(0)
    expect(textContents(tree)).not.toEqual(expect.arrayContaining(['profile:user-1']))
  })
})

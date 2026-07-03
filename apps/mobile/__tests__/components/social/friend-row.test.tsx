import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createMockFriendSummary } from '@orbit/shared/__tests__/factories'
import { FriendRow } from '@/app/social/_components/friend-row'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
    i18n: { language: 'en', exists: () => false },
  }),
}))

vi.mock('@/components/bottom-sheet-modal', () => ({
  BottomSheetModal: ({
    open,
    title,
    children,
  }: {
    open: boolean
    title?: string
    children: React.ReactNode
  }) => (open ? React.createElement('BottomSheetModal', { title }, children) : null),
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
  useRemoveFriend: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useBlockUser: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReportUser: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

interface TestNode {
  type: unknown
  props: Record<string, unknown>
  find(predicate: (node: TestNode) => boolean): TestNode
}

interface TestTree {
  root: TestNode
}

interface TestRendererApi {
  create(element: React.ReactNode): TestTree
  act(callback: () => Promise<void> | void): Promise<void>
}

const TestRenderer: TestRendererApi = require('react-test-renderer')

const friend = createMockFriendSummary({ userId: 'user-1', displayName: 'Ada Lovelace' })
const expectedTarget = { userId: 'user-1', displayName: 'Ada Lovelace' }

async function renderRow(onOpenProfile: (target: unknown) => void): Promise<TestTree> {
  let tree!: TestTree
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(
      <FriendRow friend={friend} onCheer={vi.fn()} onOpenProfile={onOpenProfile} />,
    )
  })
  return tree
}

function press(node: TestNode): Promise<void> {
  return TestRenderer.act(async () => {
    ;(node.props as { onPress: () => void }).onPress()
  })
}

function pressableWithLabel(scope: TestNode, label: string): TestNode {
  return scope.find(
    (node) => node.type === 'Pressable' && node.props.accessibilityLabel === label,
  )
}

describe('FriendRow', () => {
  it('routes the identity press to the profile callback', async () => {
    const onOpenProfile = vi.fn()
    const tree = await renderRow(onOpenProfile)

    await press(pressableWithLabel(tree.root, 'social.friends.viewProfile'))

    expect(onOpenProfile).toHaveBeenCalledWith(expectedTarget)
  })

  it('routes the action-sheet View profile entry through the same callback', async () => {
    const onOpenProfile = vi.fn()
    const tree = await renderRow(onOpenProfile)

    await press(pressableWithLabel(tree.root, 'social.friends.moreActions'))

    const actionsSheet = tree.root.find(
      (node) => node.type === 'BottomSheetModal' && node.props.title === 'Ada Lovelace',
    )
    await press(pressableWithLabel(actionsSheet, 'social.friends.viewProfile'))

    expect(onOpenProfile).toHaveBeenCalledWith(expectedTarget)
  })
})

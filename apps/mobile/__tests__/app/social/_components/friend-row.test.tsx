import React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { FriendSummary } from '@orbit/shared/types/social'

const mocks = vi.hoisted(() => ({
  removeMutateAsync: vi.fn(),
  blockMutateAsync: vi.fn(),
  reportMutateAsync: vi.fn(),
  reportPending: false,
  showSuccess: vi.fn(),
  showError: vi.fn(),
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({
    showSuccess: mocks.showSuccess,
    showError: mocks.showError,
    showInfo: vi.fn(),
    showToast: vi.fn(),
  }),
}))

vi.mock('@/hooks/use-friends', () => ({
  useRemoveFriend: () => ({ mutateAsync: mocks.removeMutateAsync, isPending: false }),
  useBlockUser: () => ({ mutateAsync: mocks.blockMutateAsync, isPending: false }),
  useReportUser: () => ({ mutateAsync: mocks.reportMutateAsync, isPending: mocks.reportPending }),
}))

vi.mock('@/components/ui/user-avatar', () => ({
  UserAvatar: ({ name }: { name: string }) => React.createElement('Text', null, name),
}))

vi.mock('@/components/ui/settings-group', () => ({
  SettingsGroup: ({ children }: { children: React.ReactNode }) => React.createElement('View', null, children),
  SettingsGroupRow: ({ label, onPress }: { label: string; onPress: () => void }) =>
    React.createElement(
      'Pressable',
      { accessibilityRole: 'button', accessibilityLabel: label, onPress },
      React.createElement('Text', null, label),
    ),
}))

vi.mock('@/components/ui/pill-button', () => ({
  PillButton: ({ children, onPress, disabled }: { children: React.ReactNode; onPress: () => void; disabled?: boolean }) =>
    React.createElement(
      'Pressable',
      { accessibilityRole: 'button', accessibilityLabel: 'submit-report', onPress, disabled },
      children,
    ),
}))

vi.mock('@/components/ui/confirm-dialog', () => ({
  ConfirmDialog: ({ open, onConfirm, confirmLabel }: { open: boolean; onConfirm: () => void; confirmLabel: string }) =>
    open
      ? React.createElement('Pressable', {
          accessibilityRole: 'button',
          accessibilityLabel: `confirm:${confirmLabel}`,
          onPress: onConfirm,
        })
      : null,
}))

import { FriendRow } from '@/app/social/_components/friend-row'

interface TestNode {
  type: unknown
  props: Record<string, unknown>
  findAll(predicate: (node: TestNode) => boolean): TestNode[]
}
interface TestTree {
  root: TestNode
}
interface TestRendererApi {
  create(element: React.ReactNode): TestTree
  act(callback: () => void | Promise<void>): Promise<void> | void
}
const TestRenderer: TestRendererApi = require('react-test-renderer')

const friend: FriendSummary = {
  userId: 'u-1',
  handle: 'ada',
  displayName: 'Ada Lovelace',
  currentStreak: 9,
}

function byLabel(tree: TestTree, label: string): TestNode | undefined {
  return tree.root.findAll(
    (node) => node.props?.accessibilityRole === 'button' && node.props.accessibilityLabel === label,
  )[0]
}

function pressLabel(tree: TestTree, label: string) {
  const node = byLabel(tree, label)
  if (!node) throw new Error(`no button ${label}`)
  TestRenderer.act(() => {
    ;(node.props as { onPress: () => void }).onPress()
  })
}

function renderRow(overrides?: { onCheer?: (target: unknown) => void; onOpenProfile?: (target: unknown) => void }) {
  const onCheer = overrides?.onCheer ?? vi.fn()
  const onOpenProfile = overrides?.onOpenProfile ?? vi.fn()
  let tree!: TestTree
  TestRenderer.act(() => {
    tree = TestRenderer.create(
      <FriendRow friend={friend} onCheer={onCheer} onOpenProfile={onOpenProfile} />,
    )
  })
  return { tree, onCheer, onOpenProfile }
}

describe('FriendRow', () => {
  beforeEach(() => {
    mocks.removeMutateAsync.mockReset().mockResolvedValue(undefined)
    mocks.blockMutateAsync.mockReset().mockResolvedValue(undefined)
    mocks.reportMutateAsync.mockReset().mockResolvedValue(undefined)
    mocks.showSuccess.mockReset()
    mocks.showError.mockReset()
    mocks.reportPending = false
  })

  it('renders the friend identity and streak', () => {
    const { tree } = renderRow()
    const rendered = tree.root.findAll((node) => node.type === 'Text').map((node) => node.props.children)
    expect(rendered).toContain('Ada Lovelace')
    expect(rendered).toContain('social.friends.streakLabel:{"count":9}')
  })

  it('cheers and opens the profile through the identity and cheer buttons', () => {
    const { tree, onCheer, onOpenProfile } = renderRow()
    pressLabel(tree, 'social.friends.viewProfile')
    expect(onOpenProfile).toHaveBeenCalledWith({ userId: 'u-1', displayName: 'Ada Lovelace' })
    pressLabel(tree, 'social.friends.cheer')
    expect(onCheer).toHaveBeenCalledWith({ recipientId: 'u-1', displayName: 'Ada Lovelace' })
  })

  it('removes a friend after confirming and surfaces errors from the mutation', async () => {
    mocks.removeMutateAsync.mockRejectedValueOnce(new Error('offline'))
    const { tree } = renderRow()
    pressLabel(tree, 'social.friends.moreActions')
    pressLabel(tree, 'social.friends.remove')
    await TestRenderer.act(async () => {
      pressLabel(tree, 'confirm:social.friends.remove')
    })
    expect(mocks.removeMutateAsync).toHaveBeenCalledWith('u-1')
    expect(mocks.showError).toHaveBeenCalledTimes(1)
    expect(mocks.showSuccess).not.toHaveBeenCalled()
  })

  it('blocks a user and reports success', async () => {
    const { tree } = renderRow()
    pressLabel(tree, 'social.friends.moreActions')
    pressLabel(tree, 'social.friends.block')
    await TestRenderer.act(async () => {
      pressLabel(tree, 'confirm:social.friends.block')
    })
    expect(mocks.blockMutateAsync).toHaveBeenCalledWith('u-1')
    expect(mocks.showSuccess).toHaveBeenCalledWith('social.block.success')
  })

  it('submits a report with the trimmed details and reports success', async () => {
    const { tree } = renderRow()
    pressLabel(tree, 'social.friends.moreActions')
    pressLabel(tree, 'social.friends.report')
    await TestRenderer.act(async () => {
      pressLabel(tree, 'submit-report')
    })
    expect(mocks.reportMutateAsync).toHaveBeenCalledWith({
      reportedUserId: 'u-1',
      reason: 'Spam',
      details: undefined,
    })
    expect(mocks.showSuccess).toHaveBeenCalledWith('social.report.success')
  })
})

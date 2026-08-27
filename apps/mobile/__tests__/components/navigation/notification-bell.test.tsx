import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockNotification } from '@orbit/shared/__tests__/factories'
import type { NotificationItem } from '@orbit/shared/types/notification'

import { NotificationBell } from '@/components/navigation/notification-bell'
import { NotificationRow } from '@/components/navigation/notification-row'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => ({
  notifications: [] as NotificationItem[],
  isLoading: false,
  isError: false,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))

vi.mock('@/hooks/use-notifications', () => ({
  useNotifications: () => ({
    notifications: mocks.notifications,
    isLoading: mocks.isLoading,
    isError: mocks.isError,
    refetch: vi.fn(),
  }),
  useMarkNotificationRead: () => ({ mutate: vi.fn() }),
  useMarkAllNotificationsRead: () => ({ mutate: vi.fn() }),
  useDeleteNotification: () => ({ mutate: vi.fn() }),
  useDeleteAllNotifications: () => ({ mutate: vi.fn() }),
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showQueued: vi.fn(), showError: vi.fn() }),
}))

const EMPTY_PENDING_DELETES: string[] = []
const noopUnsubscribe = () => {}

vi.mock('@/lib/pending-notification-deletes', () => ({
  subscribePendingNotificationDeleteIds: () => noopUnsubscribe,
  getPendingNotificationDeleteIdsSnapshot: () => EMPTY_PENDING_DELETES,
  cancelPendingNotificationDelete: vi.fn(),
  queuePendingNotificationDelete: vi.fn(() => true),
}))

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }),
}))

vi.mock('@/lib/theme', () => ({
  createTokensV2: () => new Proxy({}, { get: () => '#111111' }),
  radius: { full: 999 },
  tintFromPrimary: () => 'rgba(127,70,247,0.06)',
}))

vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({
    children,
    actions,
  }: {
    open: true
    children: React.ReactNode
    actions?: React.ReactNode
  }) => React.createElement('Sheet', null, children, actions),
}))

vi.mock('@/components/ui/drawer-content-inset', () => ({
  withDrawerContentInset: (style: unknown) => style,
}))

vi.mock('@/components/navigation/notification-detail-modal', () => ({
  NotificationDetailModal: () => null,
}))

vi.mock('@/components/ui/confirm-dialog', () => ({
  ConfirmDialog: () => null,
}))

function render() {
  let tree: {
    root: {
      findByType: (type: string) => { props: { onPress?: () => void } }
      findAllByType: (type: unknown) => unknown[]
      findAll: (
        predicate: (node: { type: unknown; props: Record<string, unknown> }) => boolean,
      ) => { type: unknown; props: Record<string, unknown> }[]
    }
  } | null = null
  TestRenderer.act(() => {
    tree = TestRenderer.create(React.createElement(NotificationBell))
  })
  return tree!
}

function openSheet(tree: ReturnType<typeof render>) {
  const bell = tree.root.findByType('Pressable')
  TestRenderer.act(() => {
    bell.props.onPress?.()
  })
}

beforeEach(() => {
  mocks.notifications = []
  mocks.isLoading = false
  mocks.isError = false
})

describe('NotificationBell list rendering', () => {
  it('renders notification rows inside the sheet without a nested scroll container', () => {
    mocks.notifications = [
      createMockNotification({ id: 'n-1', title: 'Streak saved' }),
      createMockNotification({ id: 'n-2', title: 'New achievement' }),
    ]

    const tree = render()
    openSheet(tree)

    expect(tree.root.findAllByType('ScrollView')).toHaveLength(0)
    expect(tree.root.findAllByType('FlatList')).toHaveLength(0)
    expect(tree.root.findAllByType(NotificationRow)).toHaveLength(2)
  })

  it('renders each row with the title and body as its label', () => {
    mocks.notifications = [createMockNotification({ id: 'n-1', title: 'Streak saved' })]

    const tree = render()
    openSheet(tree)
    const labeled = tree.root.findAll(
      (node) =>
        node.props.accessibilityLabel === 'Streak saved. Time to complete your habit!',
    )
    expect(labeled.length).toBeGreaterThan(0)
  })

  it('renders the empty state when there are no notifications', () => {
    mocks.notifications = []

    const tree = render()
    openSheet(tree)
    expect(
      tree.root.findAll(
        (node) => node.type === 'Text' && node.props.children === 'notifications.empty',
      ),
    ).toHaveLength(1)
  })

  it('renders a load-error state with a retry control when the query fails', () => {
    mocks.isError = true

    const tree = render()
    openSheet(tree)
    const retryControls = tree.root.findAll(
      (node) => node.props.accessibilityLabel === 'common.retry',
    )
    expect(retryControls.length).toBeGreaterThan(0)
  })
})

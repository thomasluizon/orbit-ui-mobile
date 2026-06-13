import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockNotification } from '@orbit/shared/__tests__/factories'
import type { NotificationItem } from '@orbit/shared/types/notification'

import { NotificationBell } from '@/components/navigation/notification-bell'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => ({
  notifications: [] as NotificationItem[],
  isLoading: false,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))

vi.mock('@/hooks/use-notifications', () => ({
  useNotifications: () => ({
    notifications: mocks.notifications,
    isLoading: mocks.isLoading,
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
  tintFromPrimary: () => 'rgba(127,70,247,0.06)',
}))

vi.mock('@/components/bottom-sheet-modal', () => ({
  BottomSheetModal: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? React.createElement('Sheet', null, children) : null,
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

type FlatListNode = {
  props: {
    data: NotificationItem[]
    keyExtractor: (item: NotificationItem) => string
    renderItem: (info: { item: NotificationItem; index: number }) => React.ReactElement
    ListEmptyComponent?: React.ReactNode
    ListHeaderComponent?: React.ReactNode
  }
}

function render() {
  let tree: {
    root: {
      findByType: (type: string) => { props: { onPress?: () => void } }
      findAllByType: (type: string) => FlatListNode[]
    }
  } | null = null
  TestRenderer.act(() => {
    tree = TestRenderer.create(React.createElement(NotificationBell))
  })
  return tree!
}

function openSheetAndGetList(tree: ReturnType<typeof render>): FlatListNode {
  const bell = tree.root.findByType('Pressable')
  TestRenderer.act(() => {
    bell.props.onPress?.()
  })
  const lists = tree.root.findAllByType('FlatList')
  if (lists.length !== 1) {
    throw new Error(`expected exactly one FlatList, found ${lists.length}`)
  }
  return lists[0]!
}

function findLabel(node: unknown, label: string): boolean {
  if (!node || typeof node !== 'object') return false
  const element = node as { props?: Record<string, unknown> }
  if (element.props?.accessibilityLabel === label) return true
  const children = element.props?.children
  if (Array.isArray(children)) return children.some((child) => findLabel(child, label))
  return findLabel(children, label)
}

beforeEach(() => {
  mocks.notifications = []
  mocks.isLoading = false
})

describe('NotificationBell list rendering', () => {
  it('renders notifications through a FlatList instead of a ScrollView', () => {
    mocks.notifications = [
      createMockNotification({ id: 'n-1', title: 'Streak saved' }),
      createMockNotification({ id: 'n-2', title: 'New achievement' }),
    ]

    const tree = render()
    expect(tree.root.findAllByType('ScrollView')).toHaveLength(0)

    const list = openSheetAndGetList(tree)
    expect(list.props.data).toHaveLength(2)
    expect(list.props.keyExtractor(mocks.notifications[0]!)).toBe('n-1')
  })

  it('renders each row via renderItem with the notification title as its label', () => {
    mocks.notifications = [createMockNotification({ id: 'n-1', title: 'Streak saved' })]

    const list = openSheetAndGetList(render())
    const row = list.props.renderItem({ item: mocks.notifications[0]!, index: 0 })
    expect(findLabel(row, 'Streak saved')).toBe(true)
  })

  it('passes an empty data set and an empty-state component when there are no notifications', () => {
    mocks.notifications = []

    const list = openSheetAndGetList(render())
    expect(list.props.data).toHaveLength(0)
    expect(list.props.ListEmptyComponent).toBeTruthy()
  })
})

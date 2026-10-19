import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockNotification } from '@orbit/shared/__tests__/factories'
import type { NotificationItem } from '@orbit/shared/types/notification'

import { NotificationBell } from '@/components/navigation/notification-bell'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => ({
  notifications: [] as NotificationItem[],
  isLoading: false,
  isError: false,
  markAllAsRead: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
    i18n: { language: 'en' },
  }),
}))

vi.mock('@/hooks/use-notifications', () => ({
  useNotifications: () => ({
    notifications: mocks.notifications,
    isLoading: mocks.isLoading,
    isError: mocks.isError,
    refetch: vi.fn(),
  }),
  useMarkNotificationRead: () => ({ mutate: vi.fn() }),
  useMarkAllNotificationsRead: () => ({ mutate: mocks.markAllAsRead }),
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
      findByType: (type: string) => { props: { onPress?: () => void; accessibilityLabel?: string } }
      findAll: (
        predicate: (node: { props: { accessibilityLabel?: string; children?: React.ReactNode } }) => boolean,
      ) => { props: { onPress?: () => void } }[]
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

beforeEach(() => {
  mocks.notifications = []
  mocks.isLoading = false
  mocks.isError = false
  mocks.markAllAsRead.mockReset()
})

describe('NotificationBell list rendering', () => {
  it.each(['/social?tab=buddies', '/public-profile/123', '/u/thomas'])(
    'hides %s from the list and unread badge while preserving other rows',
    (url) => {
      mocks.notifications = [
        createMockNotification({ id: 'streak', title: 'Streak saved', url: '/streak' }),
        createMockNotification({ id: 'retired', title: 'Retired notification', url }),
        createMockNotification({ id: 'celebration', title: 'Achievement earned', isRead: true }),
      ]

      const tree = render()
      expect(tree.root.findByType('Pressable').props.accessibilityLabel)
        .toBe('notifications.bellWithCount:{"count":1}')
      const list = openSheetAndGetList(tree)
      expect(list.props.data.map((item) => item.id)).toEqual(['streak', 'celebration'])
      const markAllRead = tree.root.findAll(
        (node) => node.props.accessibilityLabel === 'notifications.markAllRead',
      )[0]!
      TestRenderer.act(() => { markAllRead.props.onPress?.() })
      expect(mocks.markAllAsRead).toHaveBeenCalledOnce()
    },
  )

  it('shows the empty state and no unread badge when every notification is retired', () => {
    mocks.notifications = ['/social?tab=buddies', '/public-profile/123', '/u/thomas'].map(
      (url, index) => createMockNotification({ id: `retired-${index}`, url }),
    )

    const tree = render()
    expect(tree.root.findByType('Pressable').props.accessibilityLabel).toBe('notifications.bell')
    const list = openSheetAndGetList(tree)
    expect(list.props.data).toEqual([])
    expect(tree.root.findAll((node) => node.props.accessibilityLabel === 'notifications.markAllRead'))
      .toHaveLength(0)
    let emptyTree: ReturnType<typeof render> | null = null
    TestRenderer.act(() => {
      emptyTree = TestRenderer.create(list.props.ListEmptyComponent)
    })
    expect(emptyTree!.root.findAll((node) => node.props.children === 'notifications.empty').length)
      .toBeGreaterThan(0)
  })

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

  it('renders each row via renderItem with the title and body as its label', () => {
    mocks.notifications = [createMockNotification({ id: 'n-1', title: 'Streak saved' })]

    const list = openSheetAndGetList(render())
    const rowElement = list.props.renderItem({ item: mocks.notifications[0]!, index: 0 })
    let rowTree: {
      root: {
        findAll: (
          predicate: (node: { props: Record<string, unknown> }) => boolean,
        ) => unknown[]
      }
    } | null = null
    TestRenderer.act(() => {
      rowTree = TestRenderer.create(rowElement)
    })
    const labeled = rowTree!.root.findAll(
      (node) =>
        node.props.accessibilityLabel === 'Streak saved. Time to complete your habit!',
    )
    expect(labeled.length).toBeGreaterThan(0)
  })

  it('passes an empty data set and an empty-state component when there are no notifications', () => {
    mocks.notifications = []

    const list = openSheetAndGetList(render())
    expect(list.props.data).toHaveLength(0)
    expect(list.props.ListEmptyComponent).toBeTruthy()
  })

  it('renders a load-error state with a retry control when the query fails', () => {
    mocks.isError = true

    const list = openSheetAndGetList(render())
    let emptyTree: {
      root: {
        findAll: (
          predicate: (node: { props: Record<string, unknown> }) => boolean,
        ) => unknown[]
      }
    } | null = null
    TestRenderer.act(() => {
      emptyTree = TestRenderer.create(list.props.ListEmptyComponent)
    })
    const retryControls = emptyTree!.root.findAll(
      (node) => node.props.accessibilityLabel === 'common.retry',
    )
    expect(retryControls.length).toBeGreaterThan(0)
  })
})

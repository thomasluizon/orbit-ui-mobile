import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockNotification } from '@orbit/shared/__tests__/factories'
import { NotificationDetailModal } from '@/components/navigation/notification-detail-modal'

const TestRenderer = require('react-test-renderer')
const mocks = vi.hoisted(() => ({
  push: vi.fn(),
}))

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: mocks.push }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }),
}))

vi.mock('@/lib/theme', () => ({
  createTokensV2: () => new Proxy({}, { get: () => '#111111' }),
  tintFromPrimary: () => '#222222',
}))

vi.mock('@/components/bottom-sheet-modal', () => ({
  BottomSheetModal: ({ open, children, onDidDismiss }: {
    open: boolean
    children: React.ReactNode
    onDidDismiss?: () => void
  }) => open ? React.createElement('Sheet', { onDidDismiss }, children) : null,
}))

function renderModal(url: string | null) {
  const onClose = vi.fn()
  let tree!: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => {
    tree = TestRenderer.create(
      <NotificationDetailModal
        open
        onClose={onClose}
        notification={createMockNotification({ url })}
        onMarkAsRead={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
  })
  return { tree, onClose }
}

describe('NotificationDetailModal navigation', () => {
  beforeEach(() => mocks.push.mockClear())

  it('opens progress on the streak screen after the sheet closes', () => {
    const { tree, onClose } = renderModal('/progress')
    const view = tree.root.findAllByType('Pressable')
      .find((node: { props: { accessibilityLabel: string } }) => node.props.accessibilityLabel === 'notifications.view')
    expect(view).toBeDefined()
    TestRenderer.act(() => {
      view.props.onPress()
      tree.root.findByType('Sheet').props.onDidDismiss()
    })
    expect(onClose).toHaveBeenCalled()
    expect(mocks.push).toHaveBeenCalledWith('/streak')
  })

  it('hides View for a missing destination', () => {
    const { tree } = renderModal(null)
    const view = tree.root.findAllByType('Pressable')
      .find((node: { props: { accessibilityLabel: string } }) => node.props.accessibilityLabel === 'notifications.view')
    expect(view).toBeUndefined()
  })
})

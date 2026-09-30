import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockNotification } from '@orbit/shared/__tests__/factories'
import { sheetTestControls } from '@/__tests__/support/sheet-double'
import { NotificationDetailModal } from '@/components/navigation/notification-detail-modal'

const TestRenderer = require('react-test-renderer')

type TestNode = {
  type: unknown
  props: Record<string, unknown>
  findAll: (predicate: (node: TestNode) => boolean) => TestNode[]
}

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

vi.mock('@/lib/theme', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, createTokensV2: () => new Proxy({}, { get: () => '#111111' }) }
})

vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

function renderModal(url: string | null) {
  const onClose = vi.fn()
  let tree!: { root: TestNode }
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

function findOpenAction(root: TestNode) {
  return root
    .findAll((node) => typeof node.type === 'function' && node.props.onClick !== undefined)
    .find((node) => node.props.children === 'notifications.openIn')
}

describe('NotificationDetailModal navigation', () => {
  beforeEach(() => {
    mocks.push.mockClear()
    sheetTestControls.defer(false)
  })

  it('opens a progress notification on Progresso after the sheet closes', () => {
    const { tree, onClose } = renderModal('/progress')
    const openAction = findOpenAction(tree.root)
    expect(openAction).toBeDefined()

    TestRenderer.act(() => {
      ;(openAction?.props.onClick as () => void)()
    })

    expect(onClose).toHaveBeenCalled()
    expect(mocks.push).toHaveBeenCalledWith('/progress')
  })

  it('preserves the closed month after the sheet closes', () => {
    const { tree } = renderModal('/progress?wrapped=month&year=2024&month=2')
    const openAction = findOpenAction(tree.root)
    expect(openAction).toBeDefined()

    TestRenderer.act(() => {
      ;(openAction?.props.onClick as () => void)()
    })

    expect(mocks.push).toHaveBeenCalledWith('/wrapped?period=month&year=2024&month=2')
  })

  it('never navigates before the sheet finishes its dismissal', () => {
    sheetTestControls.defer(true)
    const { tree, onClose } = renderModal('/progress')

    TestRenderer.act(() => {
      ;(findOpenAction(tree.root)?.props.onClick as () => void)()
    })
    expect(mocks.push).not.toHaveBeenCalled()

    TestRenderer.act(() => sheetTestControls.completeDismissal())
    expect(onClose).toHaveBeenCalled()
    expect(mocks.push).toHaveBeenCalledWith('/progress')
  })

  it('hides the open action for a missing destination', () => {
    const { tree } = renderModal(null)
    expect(findOpenAction(tree.root)).toBeUndefined()
  })
})

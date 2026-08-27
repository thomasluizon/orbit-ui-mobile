import React from 'react'
import { describe, expect, it, vi } from 'vitest'

import { ShareCardSheet } from '@/components/share/share-card-sheet'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}))

vi.mock('@/components/bottom-sheet-modal', () => ({
  BottomSheetModal: ({
    open,
    children,
  }: {
    open: boolean
    children: React.ReactNode
    onClose?: () => void
  }) => (open ? React.createElement('BottomSheetOpen', {}, children) : null),
}))

vi.mock('@/components/ui/pill-button', () => ({
  PillButton: ({
    children,
    onClick,
  }: {
    children: React.ReactNode
    onClick?: () => void
  }) => React.createElement('PillButtonStub', { onClick }, children),
}))

const { refetch } = vi.hoisted(() => ({ refetch: vi.fn() }))

vi.mock('@/hooks/use-recap', () => ({
  useRecap: () => ({ data: undefined, isLoading: false, isError: true, refetch }),
}))

vi.mock('@/hooks/use-share-card', () => ({
  useShareCard: () => ({
    shareRef: { current: null },
    isSharing: false,
    hasError: false,
    share: vi.fn(),
  }),
}))

const TestRenderer = require('react-test-renderer')

type RenderedNode = {
  type: unknown
  props: Record<string, unknown>
  children?: RenderedNode[]
}
type RenderedTree = {
  root: { findAll: (predicate: (node: RenderedNode) => boolean) => RenderedNode[] }
  unmount: () => void
}

describe('ShareCardSheet (mobile)', () => {
  it('retries the recap fetch from the error state', async () => {
    let tree: RenderedTree | null = null
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<ShareCardSheet open onClose={vi.fn()} />)
      await Promise.resolve()
    })

    const retryButton = tree!.root
      .findAll((node) => node.type === 'PillButtonStub')
      .find((node) => node.props.children === 'common.retry')
    expect(retryButton).toBeDefined()

    await TestRenderer.act(async () => {
      ;(retryButton!.props.onClick as () => void)()
      await Promise.resolve()
    })

    expect(refetch).toHaveBeenCalledTimes(1)

    TestRenderer.act(() => tree!.unmount())
  })
})

import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  createMockRecap,
  createMockRetrospectiveMetrics,
} from '@orbit/shared/__tests__/factories'

import { ShareCardPanel } from '@/components/share/share-card-panel'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}))

vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

vi.mock('@/components/share/share-card', () => ({
  ShareCard: () => React.createElement('ShareCardStub'),
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

const { recapState, refetch } = vi.hoisted<{
  recapState: { data: unknown; isLoading: boolean; isError: boolean }
  refetch: ReturnType<typeof vi.fn>
}>(() => ({
  recapState: { data: undefined, isLoading: false, isError: true },
  refetch: vi.fn(),
}))

vi.mock('@/hooks/use-recap', () => ({
  useRecap: () => ({ ...recapState, refetch }),
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

describe('ShareCardPanel (mobile)', () => {
  it('retries the recap fetch from the error state', async () => {
    let tree: RenderedTree | null = null
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<ShareCardPanel open onClose={vi.fn()} />)
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

  it('shows the share card for a goal-only recap', async () => {
    recapState.data = createMockRecap({
      goalCompletions: 4,
      metrics: createMockRetrospectiveMetrics({ totalCompletions: 0, activeDays: 0 }),
    })
    recapState.isError = false
    let tree: RenderedTree | null = null
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<ShareCardPanel open onClose={vi.fn()} />)
      await Promise.resolve()
    })

    expect(tree!.root.findAll((node) => node.type === 'ShareCardStub')).toHaveLength(1)
    expect(
      tree!.root.findAll((node) => node.type === 'PillButtonStub')
        .map((node) => node.props.children),
    ).toEqual(['shareCard.share'])

    TestRenderer.act(() => tree!.unmount())
    recapState.data = undefined
    recapState.isError = true
  })
})

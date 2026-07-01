import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ getQueryData: () => undefined }),
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

vi.mock('@/components/milestone-share/milestone-share-card', () => ({
  MilestoneShareCard: React.forwardRef(function MilestoneShareCard() {
    return React.createElement('MilestoneShareCardStub')
  }),
}))

vi.mock('@/components/ui/pill-button', () => ({
  PillButton: ({
    children,
    onPress,
  }: {
    children: React.ReactNode
    onPress?: () => void
  }) => React.createElement('PillButtonStub', { onPress }, children),
}))

vi.mock('@/hooks/use-share-card', () => ({
  useShareCard: () => ({
    shareRef: { current: null },
    isSharing: false,
    hasError: false,
    share: vi.fn(),
  }),
}))

import { MilestoneSharePrompt } from '@/components/milestone-share/milestone-share-prompt'
import { useUIStore } from '@/stores/ui-store'
import { useEngagementPromptStore } from '@/stores/referral-prompt-store'

const TestRenderer = require('react-test-renderer')

type RenderedNode = {
  type: unknown
  props: Record<string, unknown>
}
type RenderedTree = {
  root: { findAll: (predicate: (node: RenderedNode) => boolean) => RenderedNode[] }
  unmount: () => void
}

let currentTree: RenderedTree | null = null

function findByType(tree: RenderedTree, typeName: string) {
  return tree.root.findAll((node) => node.type === typeName)
}

function resetStores() {
  useEngagementPromptStore.setState({
    promptedMilestoneKeys: [],
    lastPromptedAtIso: null,
    homeEntryDismissed: false,
    armedPrompt: null,
  })
  useUIStore.setState({ activeCelebration: null, queuedCelebrations: [] })
}

describe('MilestoneSharePrompt (mobile)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetStores()
  })

  afterEach(() => {
    if (currentTree) {
      TestRenderer.act(() => currentTree!.unmount())
      currentTree = null
    }
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  async function render() {
    await TestRenderer.act(async () => {
      currentTree = TestRenderer.create(<MilestoneSharePrompt />)
      await Promise.resolve()
    })
    return currentTree!
  }

  async function armMilestoneShare(milestoneKey: string) {
    await TestRenderer.act(async () => {
      useEngagementPromptStore.getState().armMilestoneSharePrompt(milestoneKey)
      await Promise.resolve()
    })
  }

  it('renders nothing when no milestone is armed', async () => {
    const tree = await render()
    expect(findByType(tree, 'BottomSheetOpen')).toHaveLength(0)
  })

  it('renders nothing when a referral prompt is armed (kind isolation)', async () => {
    const tree = await render()
    await TestRenderer.act(async () => {
      useEngagementPromptStore.getState().armReferralPrompt('level-3')
      await Promise.resolve()
    })

    await TestRenderer.act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })

    expect(findByType(tree, 'BottomSheetOpen')).toHaveLength(0)
  })

  it('shows the card after the settle delay and marks it prompted', async () => {
    const tree = await render()
    await armMilestoneShare('share-streak-7')
    expect(findByType(tree, 'BottomSheetOpen')).toHaveLength(0)

    await TestRenderer.act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })

    expect(findByType(tree, 'BottomSheetOpen')).toHaveLength(1)
    expect(findByType(tree, 'MilestoneShareCardStub')).toHaveLength(1)
    expect(useEngagementPromptStore.getState().promptedMilestoneKeys).toContain(
      'share-streak-7',
    )
  })

  it('stays hidden while a celebration is in flight', async () => {
    useUIStore.getState().enqueueCelebration('streak', { streak: 7 })
    const tree = await render()
    await armMilestoneShare('share-streak-7')

    await TestRenderer.act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    expect(findByType(tree, 'BottomSheetOpen')).toHaveLength(0)
  })

  it('stays hidden and clears the arm when the milestone was already prompted', async () => {
    useEngagementPromptStore.setState({ promptedMilestoneKeys: ['share-streak-7'] })
    const tree = await render()
    await armMilestoneShare('share-streak-7')

    await TestRenderer.act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    expect(findByType(tree, 'BottomSheetOpen')).toHaveLength(0)
    expect(useEngagementPromptStore.getState().armedPrompt).toBeNull()
  })
})

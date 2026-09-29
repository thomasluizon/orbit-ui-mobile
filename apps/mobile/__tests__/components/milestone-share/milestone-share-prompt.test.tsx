import React from 'react'
import { StyleSheet } from 'react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MilestoneSharePrompt } from '@/components/milestone-share/milestone-share-prompt'
import { useUIStore } from '@/stores/ui-store'
import { useEngagementPromptStore } from '@/stores/referral-prompt-store'
import { sheetActionsUseActionPair, sheetSlotButtons } from '@/__tests__/support/sheet-slots'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ getQueryData: () => undefined }),
}))

vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

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

const shareCard = vi.hoisted(() => ({ hasError: false }))

vi.mock('@/hooks/use-share-card', () => ({
  useShareCard: () => ({
    shareRef: { current: null },
    isSharing: false,
    hasError: shareCard.hasError,
    share: vi.fn(),
  }),
}))

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
  useUIStore.setState({ activeCelebration: null, queuedCelebrations: [], openOverlayIds: [] })
}

describe('MilestoneSharePrompt (mobile)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    shareCard.hasError = false
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
    expect(findByType(tree, 'Sheet')).toHaveLength(0)
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

    expect(findByType(tree, 'Sheet')).toHaveLength(0)
  })

  it('shows the card after the settle delay and marks it prompted', async () => {
    const tree = await render()
    await armMilestoneShare('share-streak-7')
    expect(findByType(tree, 'Sheet')).toHaveLength(0)

    await TestRenderer.act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })

    expect(findByType(tree, 'Sheet')).toHaveLength(1)
    expect(findByType(tree, 'MilestoneShareCardStub')).toHaveLength(1)
    expect(useEngagementPromptStore.getState().promptedMilestoneKeys).toContain(
      'share-streak-7',
    )
  })

  it('pins Share and Later in the sheet footer, never in the scrolling body', async () => {
    const tree = await render()
    await armMilestoneShare('share-streak-7')
    await TestRenderer.act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })

    expect(sheetSlotButtons(tree.root, 'SheetActions')).toEqual(['milestoneShare.share', 'milestoneShare.later'])
    expect(sheetActionsUseActionPair(tree.root)).toBe(true)
    expect(sheetSlotButtons(tree.root, 'SheetBody')).toEqual([])
  })

  it('gives Later the 44 point minimum target', async () => {
    const tree = await render()
    await armMilestoneShare('share-streak-7')
    await TestRenderer.act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    const later = tree.root.findAll((node) =>
      typeof node.type === 'string' && node.props.accessibilityLabel === 'milestoneShare.later')[0]!
    const style = later.props.style
    const resolved = typeof style === 'function' ? style({ pressed: false }) : style

    expect(StyleSheet.flatten(resolved).minHeight).toBeGreaterThanOrEqual(44)
  })

  it('shows a failed share in the pinned footer, beside Share', async () => {
    shareCard.hasError = true
    const tree = await render()
    await armMilestoneShare('share-streak-7')
    await TestRenderer.act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    const alerts = (slot: 'SheetBody' | 'SheetActions') => tree.root
      .findAll((node) => node.type === slot)[0]!
      .findAll((node) => typeof node.type === 'string' && node.props.accessibilityRole === 'alert')
      .map((node) => node.props.children)

    expect(alerts('SheetActions')).toEqual(['milestoneShare.shareError'])
    expect(alerts('SheetBody')).toEqual([])
  })

  it('presses Later to the shared 0.96 scale', async () => {
    const tree = await render()
    await armMilestoneShare('share-streak-7')
    await TestRenderer.act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    const later = tree.root.findAll((node) =>
      typeof node.type === 'string' && node.props.accessibilityLabel === 'milestoneShare.later')[0]!
    const style = later.props.style
    const pressed = typeof style === 'function' ? style({ pressed: true }) : style

    expect(StyleSheet.flatten(pressed).transform).toEqual([{ scale: 0.96 }])
  })

  it('stays hidden while a celebration is in flight', async () => {
    useUIStore.getState().enqueueCelebration('streak', { streak: 7 })
    const tree = await render()
    await armMilestoneShare('share-streak-7')

    await TestRenderer.act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    expect(findByType(tree, 'Sheet')).toHaveLength(0)
  })

  it('waits for another sheet to close before offering a milestone', async () => {
    useUIStore.getState().registerOpenOverlay('already-open')
    const tree = await render()
    await armMilestoneShare('share-streak-7')
    await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(500) })
    expect(findByType(tree, 'Sheet')).toHaveLength(0)

    await TestRenderer.act(async () => {
      useUIStore.getState().unregisterOpenOverlay('already-open')
      await Promise.resolve()
    })
    await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(500) })
    expect(findByType(tree, 'Sheet')).toHaveLength(1)
  })

  it('stays hidden and clears the arm when the milestone was already prompted', async () => {
    useEngagementPromptStore.setState({ promptedMilestoneKeys: ['share-streak-7'] })
    const tree = await render()
    await armMilestoneShare('share-streak-7')

    await TestRenderer.act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    expect(findByType(tree, 'Sheet')).toHaveLength(0)
    expect(useEngagementPromptStore.getState().armedPrompt).toBeNull()
  })
})

import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
    onClose,
  }: {
    open: boolean
    children: React.ReactNode
    onClose?: () => void
  }) => (open ? React.createElement('BottomSheetOpen', { onClose }, children) : null),
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

vi.mock('@/components/ui/astra-avatar', () => ({
  AstraAvatar: () => React.createElement('AstraAvatarStub'),
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: undefined }),
}))

const reviewReminder = vi.hoisted(() => ({
  isEligible: true,
  dismiss: vi.fn(),
  requestReview: vi.fn(async () => true),
}))

vi.mock('@/hooks/use-review-reminder', () => ({
  useReviewReminder: () => ({
    isEligible: reviewReminder.isEligible,
    dismiss: reviewReminder.dismiss,
    requestReview: reviewReminder.requestReview,
  }),
}))

import { ReviewMomentSheet } from '@/components/review-moment/review-moment-sheet'
import { useUIStore } from '@/stores/ui-store'
import { useEngagementPromptStore } from '@/stores/referral-prompt-store'

const TestRenderer = require('react-test-renderer')

type RenderedNode = {
  type: unknown
  props: Record<string, unknown>
  children?: unknown[]
}
type RenderedTree = {
  root: { findAll: (predicate: (node: RenderedNode) => boolean) => RenderedNode[] }
  toJSON: () => unknown
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

describe('ReviewMomentSheet (mobile)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetStores()
    reviewReminder.isEligible = true
    reviewReminder.dismiss.mockClear()
    reviewReminder.requestReview.mockClear()
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
      currentTree = TestRenderer.create(<ReviewMomentSheet />)
      await Promise.resolve()
    })
    return currentTree!
  }

  async function armReview(milestoneKey: string) {
    await TestRenderer.act(async () => {
      useEngagementPromptStore.getState().armReviewPrompt(milestoneKey)
      await Promise.resolve()
    })
  }

  async function settle(ms = 500) {
    await TestRenderer.act(async () => {
      await vi.advanceTimersByTimeAsync(ms)
    })
  }

  it('renders nothing when no review moment is armed', async () => {
    const tree = await render()
    expect(findByType(tree, 'BottomSheetOpen')).toHaveLength(0)
  })

  it('renders nothing when a milestone-share prompt is armed (kind isolation)', async () => {
    const tree = await render()
    await TestRenderer.act(async () => {
      useEngagementPromptStore.getState().armMilestoneSharePrompt('share-streak-7')
      await Promise.resolve()
    })
    await settle(1000)

    expect(findByType(tree, 'BottomSheetOpen')).toHaveLength(0)
  })

  it('shows the streak variant after the settle delay and burns the shared cooldown', async () => {
    const tree = await render()
    await armReview('review-streak-7')
    expect(findByType(tree, 'BottomSheetOpen')).toHaveLength(0)

    await settle()

    expect(findByType(tree, 'BottomSheetOpen')).toHaveLength(1)
    expect(findByType(tree, 'AstraAvatarStub')).toHaveLength(1)
    expect(JSON.stringify(tree.toJSON())).toContain('reviewMoment.streakTitle')
    expect(useEngagementPromptStore.getState().promptedMilestoneKeys).toContain(
      'review-streak-7',
    )
    expect(useEngagementPromptStore.getState().lastPromptedAtIso).not.toBeNull()
  })

  it('shows the level variant for a level key', async () => {
    const tree = await render()
    await armReview('review-level-5')
    await settle()

    expect(findByType(tree, 'BottomSheetOpen')).toHaveLength(1)
    expect(JSON.stringify(tree.toJSON())).toContain('reviewMoment.levelTitle')
  })

  it('stays hidden while a celebration is in flight', async () => {
    useUIStore.getState().enqueueCelebration('level-up', { level: 5 })
    const tree = await render()
    await armReview('review-level-5')
    await settle(1000)

    expect(findByType(tree, 'BottomSheetOpen')).toHaveLength(0)
  })

  it('stays hidden and clears the arm when the key was already prompted', async () => {
    useEngagementPromptStore.setState({ promptedMilestoneKeys: ['review-streak-7'] })
    const tree = await render()
    await armReview('review-streak-7')
    await settle(1000)

    expect(findByType(tree, 'BottomSheetOpen')).toHaveLength(0)
    expect(useEngagementPromptStore.getState().armedPrompt).toBeNull()
  })

  it('stays hidden and clears the arm when the user is not eligible', async () => {
    reviewReminder.isEligible = false
    const tree = await render()
    await armReview('review-streak-7')
    await settle(1000)

    expect(findByType(tree, 'BottomSheetOpen')).toHaveLength(0)
    expect(useEngagementPromptStore.getState().armedPrompt).toBeNull()
  })

  it('snoozes on "not now" and closes the sheet', async () => {
    const tree = await render()
    await armReview('review-streak-7')
    await settle()

    const notNow = tree.root.findAll(
      (node) =>
        node.props.accessibilityLabel === 'reviewMoment.notNow' &&
        typeof node.props.onPress === 'function',
    )
    expect(notNow.length).toBeGreaterThan(0)

    await TestRenderer.act(async () => {
      ;(notNow[0]!.props.onPress as () => void)()
      await Promise.resolve()
    })

    expect(reviewReminder.dismiss).toHaveBeenCalledTimes(1)
    expect(findByType(tree, 'BottomSheetOpen')).toHaveLength(0)
  })

  it('snoozes when the sheet is dismissed natively (swipe/back)', async () => {
    const tree = await render()
    await armReview('review-streak-7')
    await settle()

    const sheet = findByType(tree, 'BottomSheetOpen')[0]!
    await TestRenderer.act(async () => {
      ;(sheet.props.onClose as () => void)()
      await Promise.resolve()
    })

    expect(reviewReminder.dismiss).toHaveBeenCalledTimes(1)
    expect(findByType(tree, 'BottomSheetOpen')).toHaveLength(0)
  })

  it('requests the native review on the CTA without snoozing', async () => {
    const tree = await render()
    await armReview('review-streak-7')
    await settle()

    const cta = findByType(tree, 'PillButtonStub')
    expect(cta).toHaveLength(1)

    await TestRenderer.act(async () => {
      ;(cta[0]!.props.onPress as () => void)()
      await Promise.resolve()
    })

    expect(reviewReminder.requestReview).toHaveBeenCalledTimes(1)
    expect(reviewReminder.dismiss).not.toHaveBeenCalled()
    expect(findByType(tree, 'BottomSheetOpen')).toHaveLength(0)
  })
})

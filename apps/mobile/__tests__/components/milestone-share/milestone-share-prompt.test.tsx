import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MilestoneSharePrompt } from '@/components/milestone-share/milestone-share-prompt'
import { useUIStore } from '@/stores/ui-store'
import { useEngagementPromptStore } from '@/stores/referral-prompt-store'
import { getMilestoneShareAchievementKey } from '@orbit/shared/stores'
import { achievementSchema } from '@orbit/shared/types/gamification'
import { expectSmallSheetActions, sheetActionsUseActionPair, sheetSlotButtons } from '@/__tests__/support/sheet-slots'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}))

const queryCache = vi.hoisted((): { gamificationProfile: unknown } => ({ gamificationProfile: undefined }))

vi.mock('@tanstack/react-query', async () => {
  const { gamificationKeys } = await import('@orbit/shared/query')
  return {
    useQueryClient: () => ({
      getQueryData: (key: readonly unknown[]) =>
        JSON.stringify(key) === JSON.stringify(gamificationKeys.profile()) ? queryCache.gamificationProfile : undefined,
    }),
  }
})

vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

vi.mock('@/components/milestone-share/milestone-share-card', () => ({
  MILESTONE_SHARE_CARD_WIDTH: 360,
  MilestoneShareCard: React.forwardRef(function MilestoneShareCard() {
    return React.createElement('MilestoneShareCardStub')
  }),
}))

vi.mock('@/components/ui/pill-button', () => ({
  PillButton: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) =>
    React.createElement('PillButtonStub', { ...props, onPress: props.onClick, accessibilityLabel: props.accessibleName }, children),
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
  findAll: (predicate: (node: RenderedNode) => boolean) => RenderedNode[]
}
type RenderedTree = {
  root: { findAll: (predicate: (node: RenderedNode) => boolean) => RenderedNode[] }
  unmount: () => void
  update: (element: React.ReactElement) => void
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
    queryCache.gamificationProfile = undefined
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
      currentTree = TestRenderer.create(<MilestoneSharePrompt suppressed={false} />)
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

  it('uses a ghost pill for Later', async () => {
    const tree = await render()
    await armMilestoneShare('share-streak-7')
    await TestRenderer.act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    const later = tree.root.findAll((node) =>
      typeof node.type === 'string' && node.props.accessibilityLabel === 'milestoneShare.later')[0]!
    expect(later.props.variant).toBe('ghost')
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

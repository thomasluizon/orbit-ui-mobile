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

vi.mock('@/components/referral/referral-drawer', () => ({
  ReferralDrawer: ({ open }: { open: boolean; onClose?: () => void }) =>
    open ? React.createElement('ReferralDrawerOpen', {}) : null,
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

import { ReferralPrompt } from '@/components/referral/referral-prompt'
import { useUIStore } from '@/stores/ui-store'
import { useReferralPromptStore } from '@/stores/referral-prompt-store'

const TestRenderer = require('react-test-renderer')

type RenderedNode = {
  type: unknown
  props: { onPress?: () => void; accessibilityLabel?: string } & Record<
    string,
    unknown
  >
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
  useReferralPromptStore.setState({
    promptedMilestoneKeys: [],
    lastPromptedAtIso: null,
    homeEntryDismissed: false,
    armedMilestoneKey: null,
  })
  useUIStore.setState({ activeCelebration: null, queuedCelebrations: [] })
}

describe('ReferralPrompt (mobile)', () => {
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
      currentTree = TestRenderer.create(<ReferralPrompt />)
      await Promise.resolve()
    })
    return currentTree!
  }

  async function renderArmed(milestoneKey: string) {
    const tree = await render()
    await TestRenderer.act(async () => {
      useReferralPromptStore.getState().armReferralPrompt(milestoneKey)
      await Promise.resolve()
    })
    return tree
  }

  it('renders nothing when no milestone is armed', async () => {
    const tree = await render()
    expect(findByType(tree, 'BottomSheetOpen')).toHaveLength(0)
  })

  it('shows the prompt after the settle delay and marks it prompted', async () => {
    const tree = await renderArmed('streak-7')
    expect(findByType(tree, 'BottomSheetOpen')).toHaveLength(0)

    await TestRenderer.act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })

    expect(findByType(tree, 'BottomSheetOpen')).toHaveLength(1)
    expect(useReferralPromptStore.getState().promptedMilestoneKeys).toContain(
      'streak-7',
    )
  })

  it('stays hidden while a celebration is in flight', async () => {
    useUIStore.getState().enqueueCelebration('streak', { streak: 7 })
    const tree = await renderArmed('streak-7')

    await TestRenderer.act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    expect(findByType(tree, 'BottomSheetOpen')).toHaveLength(0)
  })

  it('stays hidden and clears the arm when the milestone was already prompted', async () => {
    useReferralPromptStore.setState({ promptedMilestoneKeys: ['streak-7'] })
    const tree = await renderArmed('streak-7')

    await TestRenderer.act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    expect(findByType(tree, 'BottomSheetOpen')).toHaveLength(0)
    expect(useReferralPromptStore.getState().armedMilestoneKey).toBeNull()
  })

  it('opens the drawer from the CTA', async () => {
    const tree = await renderArmed('level-3')
    await TestRenderer.act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })

    const [cta] = findByType(tree, 'PillButtonStub')
    await TestRenderer.act(async () => {
      cta!.props.onPress?.()
      await Promise.resolve()
    })

    expect(findByType(tree, 'BottomSheetOpen')).toHaveLength(0)
    expect(findByType(tree, 'ReferralDrawerOpen')).toHaveLength(1)
  })

  it('dismisses without opening the drawer from "maybe later"', async () => {
    const tree = await renderArmed('streak-30')
    await TestRenderer.act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })

    const [later] = tree.root.findAll(
      (node) => node.props.accessibilityLabel === 'referral.prompt.later',
    )
    await TestRenderer.act(async () => {
      later!.props.onPress?.()
      await Promise.resolve()
    })

    expect(findByType(tree, 'BottomSheetOpen')).toHaveLength(0)
    expect(findByType(tree, 'ReferralDrawerOpen')).toHaveLength(0)
  })
})

import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}))

const performQueuedApiMutation = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/queued-api-mutation', () => ({
  performQueuedApiMutation: (input: unknown) => performQueuedApiMutation(input),
}))

const patchProfile = vi.fn()
let profileValue: { marketingEmailConsent: boolean | null } | undefined
vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: profileValue, patchProfile }),
}))

vi.mock('@tanstack/react-query', () => ({
  useMutation: (options: {
    mutationFn: (vars: boolean) => Promise<unknown>
    onMutate?: (vars: boolean) => unknown
    onError?: (err: unknown, vars: boolean, ctx: unknown) => void
  }) => ({
    isPending: false,
    mutate: (vars: boolean) => {
      const ctx = options.onMutate?.(vars)
      Promise.resolve(options.mutationFn(vars)).catch((err) =>
        options.onError?.(err, vars, ctx),
      )
    },
  }),
}))

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }),
}))

vi.mock('@/lib/theme', () => ({
  createTokensV2: () =>
    new Proxy({}, { get: () => '#ffffff' }) as Record<string, string>,
  tintFromPrimary: () => 'rgba(0,0,0,0.15)',
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
    onPress,
  }: {
    children: React.ReactNode
    onPress?: () => void
  }) => React.createElement('PillButtonStub', { onPress }, children),
}))

import { MarketingConsentPrompt } from '@/components/marketing-consent/marketing-consent-prompt'
import { useUIStore } from '@/stores/ui-store'
import { useReferralPromptStore } from '@/stores/referral-prompt-store'
import { MARKETING_CONSENT_MILESTONE_KEY } from '@orbit/shared/stores'

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
    armedPrompt: null,
  })
  useUIStore.setState({ activeCelebration: null, queuedCelebrations: [] })
}

describe('MarketingConsentPrompt (mobile)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetStores()
    patchProfile.mockClear()
    performQueuedApiMutation.mockClear()
    profileValue = { marketingEmailConsent: null }
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
      currentTree = TestRenderer.create(<MarketingConsentPrompt />)
      await Promise.resolve()
    })
    return currentTree!
  }

  async function renderArmed() {
    const tree = await render()
    await TestRenderer.act(async () => {
      useReferralPromptStore
        .getState()
        .armConsentPrompt(MARKETING_CONSENT_MILESTONE_KEY)
      await Promise.resolve()
    })
    return tree
  }

  async function settle() {
    await TestRenderer.act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
  }

  it('renders nothing when no consent prompt is armed', async () => {
    const tree = await render()
    expect(findByType(tree, 'BottomSheetOpen')).toHaveLength(0)
  })

  it('does not render when a different kind is armed', async () => {
    const tree = await render()
    await TestRenderer.act(async () => {
      useReferralPromptStore.getState().armReferralPrompt('level-3')
      await Promise.resolve()
    })
    await settle()
    expect(findByType(tree, 'BottomSheetOpen')).toHaveLength(0)
  })

  it('shows after the settle delay and records markEngagementPrompted', async () => {
    const tree = await renderArmed()
    expect(findByType(tree, 'BottomSheetOpen')).toHaveLength(0)

    await settle()

    expect(findByType(tree, 'BottomSheetOpen')).toHaveLength(1)
    expect(useReferralPromptStore.getState().promptedMilestoneKeys).toContain(
      MARKETING_CONSENT_MILESTONE_KEY,
    )
  })

  it('stays hidden while a celebration is in flight', async () => {
    useUIStore.getState().enqueueCelebration('streak', { streak: 7 })
    const tree = await renderArmed()

    await TestRenderer.act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    expect(findByType(tree, 'BottomSheetOpen')).toHaveLength(0)
  })

  it('opts in through the offline queue and patches the profile on accept', async () => {
    const tree = await renderArmed()
    await settle()

    const [accept] = findByType(tree, 'PillButtonStub')
    await TestRenderer.act(async () => {
      accept!.props.onPress?.()
      await Promise.resolve()
    })

    expect(performQueuedApiMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'setMarketingConsent',
        scope: 'profile',
        payload: { enabled: true },
        dedupeKey: 'profile-marketing-consent',
      }),
    )
    expect(patchProfile).toHaveBeenCalledWith({ marketingEmailConsent: true })
    expect(findByType(tree, 'BottomSheetOpen')).toHaveLength(0)
  })

  it('opts out through the offline queue on decline', async () => {
    const tree = await renderArmed()
    await settle()

    const [decline] = tree.root.findAll(
      (node) => node.props.accessibilityLabel === 'marketingConsent.prompt.decline',
    )
    await TestRenderer.act(async () => {
      decline!.props.onPress?.()
      await Promise.resolve()
    })

    expect(performQueuedApiMutation).toHaveBeenCalledWith(
      expect.objectContaining({ payload: { enabled: false } }),
    )
    expect(patchProfile).toHaveBeenCalledWith({ marketingEmailConsent: false })
  })
})

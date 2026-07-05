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

vi.mock('@/components/ui/section-label', () => ({
  SectionLabel: ({ children }: { children: React.ReactNode }) =>
    React.createElement('SectionLabelStub', {}, children),
}))

vi.mock('@/components/ui/settings-row', () => ({
  SettingsRow: ({ children }: { children: React.ReactNode }) =>
    React.createElement('SettingsRowStub', {}, children),
  Switch: ({ on, onToggle }: { on: boolean; onToggle: () => void }) =>
    React.createElement('SwitchStub', { on, onToggle }),
}))

import { MarketingConsentSection } from '@/components/marketing-consent/marketing-consent-section'

const TestRenderer = require('react-test-renderer')

type RenderedNode = {
  type: unknown
  props: { on?: boolean; onToggle?: () => void } & Record<string, unknown>
}
type RenderedTree = {
  root: { findAll: (predicate: (node: RenderedNode) => boolean) => RenderedNode[] }
  unmount: () => void
}

let currentTree: RenderedTree | null = null

function getSwitch(tree: RenderedTree) {
  return tree.root.findAll((node) => node.type === 'SwitchStub')[0]
}

async function render() {
  await TestRenderer.act(async () => {
    currentTree = TestRenderer.create(<MarketingConsentSection />)
    await Promise.resolve()
  })
  return currentTree!
}

describe('MarketingConsentSection (mobile)', () => {
  beforeEach(() => {
    patchProfile.mockClear()
    performQueuedApiMutation.mockClear()
    performQueuedApiMutation.mockResolvedValue(undefined)
    profileValue = { marketingEmailConsent: null }
  })

  afterEach(() => {
    if (currentTree) {
      TestRenderer.act(() => currentTree!.unmount())
      currentTree = null
    }
  })

  it('reflects consent off when the profile has not opted in', async () => {
    profileValue = { marketingEmailConsent: null }
    const tree = await render()
    expect(getSwitch(tree).props.on).toBe(false)
  })

  it('reflects consent on when the profile opted in', async () => {
    profileValue = { marketingEmailConsent: true }
    const tree = await render()
    expect(getSwitch(tree).props.on).toBe(true)
  })

  it('opts in through the offline queue and patches optimistically', async () => {
    profileValue = { marketingEmailConsent: false }
    const tree = await render()

    await TestRenderer.act(async () => {
      getSwitch(tree).props.onToggle?.()
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
  })

  it('rolls the optimistic patch back when the mutation fails', async () => {
    profileValue = { marketingEmailConsent: true }
    performQueuedApiMutation.mockRejectedValueOnce(new Error('network'))
    const tree = await render()

    await TestRenderer.act(async () => {
      getSwitch(tree).props.onToggle?.()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(patchProfile).toHaveBeenNthCalledWith(1, { marketingEmailConsent: false })
    expect(patchProfile).toHaveBeenLastCalledWith({ marketingEmailConsent: true })
  })
})

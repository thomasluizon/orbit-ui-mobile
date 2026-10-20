import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MarketingConsentSection } from '@/components/marketing-consent/marketing-consent-section'

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

vi.mock('@/components/ui/list-row', () => ({
  ListRow: ({ title, toggle }: import('@orbit/shared/contracts/lists').ListRowProps) =>
    React.createElement('SettingsRowStub', {}, React.createElement('SwitchStub', { label: title, ...toggle })),
}))

vi.mock('@/components/ui/switch', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/components/ui/switch')>(),
  Switch: ({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) =>
    React.createElement('SwitchStub', { checked, onChange }),
}))

const TestRenderer = require('react-test-renderer')

type RenderedNode = {
  type: unknown
  props: { checked?: boolean; onChange?: (checked: boolean) => void } & Record<string, unknown>
}
type RenderedTree = {
  root: { findAll: (predicate: (node: RenderedNode) => boolean) => RenderedNode[] }
  unmount: () => void
}

let currentTree: RenderedTree | null = null

function getSwitch(tree: RenderedTree) {
  const node = tree.root.findAll((candidate) => candidate.type === 'SwitchStub')[0]
  if (!node) throw new Error('SwitchStub not rendered')
  return node
}

async function render(contained = false) {
  await TestRenderer.act(async () => {
    currentTree = TestRenderer.create(<MarketingConsentSection contained={contained} />)
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

  it.each([false, true])('asks for an explicit answer when consent has never been decided with contained %s', async (contained) => {
    profileValue = { marketingEmailConsent: null }
    const tree = await render(contained)
    expect(tree.root.findAll((candidate) => candidate.type === 'SwitchStub')).toHaveLength(0)
    expect(
      tree.root.findAll((candidate) => candidate.props.testID === 'button-primary-sm').length,
    ).toBeGreaterThan(0)
    expect(
      tree.root.findAll((candidate) => candidate.props.testID === 'button-ghost-sm').length,
    ).toBeGreaterThan(0)
  })

  it('keeps the default answered settings row', async () => {
    profileValue = { marketingEmailConsent: false }
    const tree = await render()
    expect(tree.root.findAll((node) => node.type === 'SettingsRowStub')).toHaveLength(1)
  })

  it('reflects explicit consent off', async () => {
    profileValue = { marketingEmailConsent: false }
    const tree = await render()
    expect(getSwitch(tree).props.checked).toBe(false)
  })

  it('reflects consent on when the profile opted in', async () => {
    profileValue = { marketingEmailConsent: true }
    const tree = await render()
    expect(getSwitch(tree).props.checked).toBe(true)
  })

  it.each([false, true])('opts in through the offline queue and patches optimistically with contained %s', async (contained) => {
    profileValue = { marketingEmailConsent: false }
    const tree = await render(contained)

    await TestRenderer.act(async () => {
      getSwitch(tree).props.onChange?.(true)
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

  it.each([false, true])('rolls the optimistic patch back when the mutation fails with contained %s', async (contained) => {
    profileValue = { marketingEmailConsent: true }
    performQueuedApiMutation.mockRejectedValueOnce(new Error('network'))
    const tree = await render(contained)

    await TestRenderer.act(async () => {
      getSwitch(tree).props.onChange?.(false)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(patchProfile).toHaveBeenNthCalledWith(1, { marketingEmailConsent: false })
    expect(patchProfile).toHaveBeenLastCalledWith({ marketingEmailConsent: true })
  })
})

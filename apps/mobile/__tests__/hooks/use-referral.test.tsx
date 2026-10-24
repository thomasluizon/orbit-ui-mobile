import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { resetAccountQueries } from '@orbit/shared/query'
import type { ZodType } from 'zod'
import type { ReferralDashboard } from '@orbit/shared/types/referral'
import { useReferral } from '@/hooks/use-referral'

const mocks = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('@/lib/api-client', () => ({
  apiClient: (_path: string, _options: unknown, schema: ZodType) => mocks.request().then((payload: unknown) => schema.parse(payload)),
}))

function makeDashboard(code = 'XYZ789'): ReferralDashboard {
  return { code, link: `https://app.useorbit.org/r/${code}`, stats: {
    referralCode: code, referralLink: `https://app.useorbit.org/r/${code}`,
    successfulReferrals: 8, pendingReferrals: 2, maxReferrals: 10,
    rewardType: 'pro_days', proDaysPerReferral: 11, discountPercent: 23,
  } }
}

async function renderReferral() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  let latest!: ReturnType<typeof useReferral>
  let tree!: ReactTestRenderer
  function Harness() { latest = useReferral(); return null }
  await act(async () => {
    tree = create(<QueryClientProvider client={queryClient}><Harness /></QueryClientProvider>)
    await new Promise((resolve) => setTimeout(resolve, 10))
  })
  async function flush() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)) }) }
  async function cleanup() { await act(() => tree.update(<></>)); queryClient.clear() }
  return { current: () => latest, tree, queryClient, flush, cleanup }
}

describe('mobile useReferral', () => {
  beforeEach(() => { mocks.request.mockReset() })

  it('returns an empty referralUrl when there is no code', async () => {
    mocks.request.mockReturnValue(new Promise(() => {}))
    const hook = await renderReferral()
    expect(hook.current().code).toBeNull()
    expect(hook.current().stats).toBeNull()
    expect(hook.current().referralUrl).toBe('')
    await hook.cleanup()
  })

  it('builds the hosted referral url from the dashboard code', async () => {
    mocks.request.mockResolvedValue(makeDashboard())
    const hook = await renderReferral()
    await hook.flush()
    expect(hook.current().code).toBe('XYZ789')
    expect(hook.current().referralUrl).toBe('https://app.useorbit.org/r/XYZ789')
    expect(hook.current().stats?.proDaysPerReferral).toBe(11)
    expect(mocks.request).toHaveBeenCalledTimes(1)
    await hook.cleanup()
  })

  it.each([
    { rewardType: 'discount', proDaysPerReferral: undefined, discountPercent: 23 },
    { rewardType: 'future_reward', proDaysPerReferral: 11, discountPercent: 23 },
    { rewardType: undefined, proDaysPerReferral: undefined, discountPercent: undefined },
    { rewardType: 'pro_days', proDaysPerReferral: 'bad', discountPercent: 23 },
  ])('validates facts without making optional reward metadata fatal %s', async (reward) => {
    const dashboard = makeDashboard()
    mocks.request.mockResolvedValue({ ...dashboard, stats: { ...dashboard.stats, ...reward } })
    const hook = await renderReferral()
    await hook.flush()
    expect(hook.current().isSuccess).toBe(true)
    expect(hook.current().stats?.rewardType).toBe(reward.rewardType)
    expect(hook.current().code).toBe(dashboard.code)
    await hook.cleanup()
  })

  it('keeps malformed required counts as a real error', async () => {
    const dashboard = makeDashboard()
    mocks.request.mockResolvedValue({ ...dashboard, stats: { ...dashboard.stats, successfulReferrals: 'bad' } })
    const hook = await renderReferral()
    await hook.flush()
    expect(hook.current().isError).toBe(true)
    expect(hook.current().stats).toBeNull()
    await hook.cleanup()
  })

  it('clears the previous account code and reward before the replacement request completes', async () => {
    let finish!: (response: unknown) => void
    mocks.request.mockResolvedValueOnce(makeDashboard())
    mocks.request.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const hook = await renderReferral()
    await hook.flush()
    expect(hook.current().code).toBe('XYZ789')
    await act(async () => { void resetAccountQueries(hook.queryClient, 'signed-in'); await Promise.resolve() })
    await hook.flush()
    expect(hook.current().code).toBeNull()
    expect(hook.current().referralUrl).toBe('')
    expect(hook.current().stats).toBeNull()
    const next = makeDashboard('NEXT')
    await act(async () => { finish({ ...next, stats: { ...next.stats, rewardType: 'discount', proDaysPerReferral: undefined } }); await Promise.resolve() })
    await hook.flush()
    expect(hook.current().code).toBe('NEXT')
    expect(hook.current().stats?.rewardType).toBe('discount')
    expect(hook.current().stats?.proDaysPerReferral).toBeUndefined()
    expect(hook.current().referralUrl).toBe('https://app.useorbit.org/r/NEXT')
    await hook.cleanup()
  })
})

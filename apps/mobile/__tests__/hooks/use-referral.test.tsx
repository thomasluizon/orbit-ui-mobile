import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReferralDashboard } from '@orbit/shared/types/referral'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => {
  const state = {
    data: undefined as ReferralDashboard | undefined,
  }

  return {
    state,
    useQuery: vi.fn(() => ({
      data: state.data,
      isLoading: false,
      isError: false,
      error: null,
    })),
  }
})

vi.mock('@tanstack/react-query', () => ({
  useQuery: mocks.useQuery,
}))

vi.mock('@/lib/api-client', () => ({
  apiClient: vi.fn(),
}))

import { useReferral } from '@/hooks/use-referral'

async function renderUseReferral(): Promise<ReturnType<typeof useReferral>> {
  let latestValue: ReturnType<typeof useReferral> | null = null

  function Harness() {
    latestValue = useReferral()
    return null
  }

  await TestRenderer.act(async () => {
    TestRenderer.create(<Harness />)
    await Promise.resolve()
  })

  if (!latestValue) {
    throw new Error('useReferral did not render')
  }

  return latestValue
}

describe('mobile useReferral', () => {
  beforeEach(() => {
    mocks.state.data = undefined
    mocks.useQuery.mockClear()
  })

  it('returns an empty referralUrl when there is no code', async () => {
    const result = await renderUseReferral()

    expect(result.code).toBeNull()
    expect(result.referralUrl).toBe('')
  })

  it('builds the hosted referral url from the dashboard code', async () => {
    mocks.state.data = {
      code: 'XYZ789',
      link: 'https://app.useorbit.org/r/XYZ789',
      stats: {
        referralCode: 'XYZ789',
        referralLink: 'https://app.useorbit.org/r/XYZ789',
        successfulReferrals: 3,
        pendingReferrals: 1,
        maxReferrals: 10,
        rewardType: 'discount',
        discountPercent: 20,
      },
    }

    const result = await renderUseReferral()

    expect(result.code).toBe('XYZ789')
    expect(result.referralUrl).toBe('https://app.useorbit.org/r/XYZ789')
  })
})

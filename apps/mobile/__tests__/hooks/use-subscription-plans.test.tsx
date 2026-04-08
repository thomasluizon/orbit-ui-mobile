import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SubscriptionPlans } from '@orbit/shared/types/subscription'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => {
  const state = {
    data: undefined as SubscriptionPlans | undefined,
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

import { useSubscriptionPlans } from '@/hooks/use-subscription-plans'

async function renderUseSubscriptionPlans(): Promise<ReturnType<typeof useSubscriptionPlans>> {
  let latestValue: ReturnType<typeof useSubscriptionPlans> | null = null

  function Harness() {
    latestValue = useSubscriptionPlans()
    return null
  }

  await TestRenderer.act(async () => {
    TestRenderer.create(<Harness />)
    await Promise.resolve()
  })

  if (!latestValue) {
    throw new Error('useSubscriptionPlans did not render')
  }

  return latestValue
}

describe('mobile useSubscriptionPlans', () => {
  beforeEach(() => {
    mocks.state.data = undefined
    mocks.useQuery.mockClear()
  })

  it('returns null plans when nothing has loaded yet', async () => {
    const result = await renderUseSubscriptionPlans()

    expect(result.plans).toBeNull()
  })

  it('uses the shared pricing helpers for loaded plans', async () => {
    mocks.state.data = {
      monthly: { unitAmount: 999, currency: 'usd' },
      yearly: { unitAmount: 7999, currency: 'usd' },
      savingsPercent: 20,
      couponPercentOff: 20,
      currency: 'usd',
    }

    const result = await renderUseSubscriptionPlans()

    expect(result.discountedAmount(1000)).toBe(800)
    expect(result.formatPrice(999, 'usd')).toBe('$9.99')
    expect(result.monthlyEquivalent(7999)).toBe(667)
  })
})

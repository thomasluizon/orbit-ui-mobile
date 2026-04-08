import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const TestRenderer = require('react-test-renderer')
import { createMockProfile } from '@orbit/shared/__tests__/factories'

const mocks = vi.hoisted(() => {
  const state = {
    profile: null as ReturnType<typeof createMockProfile> | null,
  }

  const queryClient = {
    invalidateQueries: vi.fn(async () => {}),
    setQueryData: vi.fn(),
  }

  return {
    state,
    queryClient,
    useQuery: vi.fn(() => ({
      data: state.profile,
      isLoading: false,
      isError: false,
      error: null,
    })),
    useQueryClient: vi.fn(() => queryClient),
    performQueuedApiMutation: vi.fn(async () => undefined),
    i18n: {
      language: 'en',
      changeLanguage: vi.fn(async () => undefined),
    },
  }
})

vi.mock('@tanstack/react-query', () => ({
  useQuery: mocks.useQuery,
  useQueryClient: mocks.useQueryClient,
}))

vi.mock('i18next', () => ({
  default: mocks.i18n,
}))

vi.mock('@/lib/api-client', () => ({
  apiClient: vi.fn(),
}))

vi.mock('@/lib/queued-api-mutation', () => ({
  performQueuedApiMutation: mocks.performQueuedApiMutation,
}))

import {
  useCurrentPlan,
  useHasProAccess,
  useIsYearlyPro,
  useProfile,
  useTrialDaysLeft,
  useTrialExpired,
  useTrialUrgent,
} from '@/hooks/use-profile'

async function renderHookValue<T>(hook: () => T): Promise<T> {
  let latestValue: T | undefined
  let rendered = false

  function Harness() {
    latestValue = hook()
    rendered = true
    return null
  }

  await TestRenderer.act(async () => {
    TestRenderer.create(<Harness />)
    await Promise.resolve()
  })

  if (!rendered) {
    throw new Error('hook did not render')
  }

  return latestValue as T
}

describe('mobile useProfile selectors', () => {
  beforeEach(() => {
    mocks.state.profile = createMockProfile()
    mocks.queryClient.invalidateQueries.mockClear()
    mocks.queryClient.setQueryData.mockClear()
    mocks.useQuery.mockClear()
    mocks.useQueryClient.mockClear()
    mocks.performQueuedApiMutation.mockClear()
    mocks.i18n.changeLanguage.mockClear()
    mocks.i18n.language = 'en'
  })

  it('exposes the profile query result and patch/invalidate helpers', async () => {
    const result = await renderHookValue(() => useProfile())

    expect(result.profile?.email).toBe('thomas@example.com')
    expect(typeof result.patchProfile).toBe('function')
    expect(typeof result.invalidate).toBe('function')
  })

  it('derives pro and trial state from the profile cache', async () => {
    mocks.state.profile = createMockProfile({
      hasProAccess: true,
      plan: 'pro',
      isTrialActive: false,
      trialEndsAt: null,
    })

    expect(await renderHookValue(() => useHasProAccess())).toBe(true)
    expect(await renderHookValue(() => useCurrentPlan())).toBe('Pro')
    expect(await renderHookValue(() => useTrialDaysLeft())).toBeNull()
    expect(await renderHookValue(() => useTrialExpired())).toBe(false)
    expect(await renderHookValue(() => useTrialUrgent())).toBe(false)
    expect(await renderHookValue(() => useIsYearlyPro())).toBe(false)
  })

  it('reports trial urgency and expiry from the cached profile', async () => {
    const soon = new Date()
    soon.setDate(soon.getDate() + 1)
    mocks.state.profile = createMockProfile({
      isTrialActive: true,
      trialEndsAt: soon.toISOString(),
    })

    expect(await renderHookValue(() => useCurrentPlan())).toBe('Trial')
    const daysLeft = await renderHookValue(() => useTrialDaysLeft())
    expect(daysLeft).not.toBeNull()
    expect(daysLeft).toBeGreaterThanOrEqual(0)
    expect(await renderHookValue(() => useTrialUrgent())).toBe(true)
    expect(await renderHookValue(() => useTrialExpired())).toBe(false)
  })
})

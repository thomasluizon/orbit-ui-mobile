import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'
import type { ApplyOnboardingResponse } from '@orbit/shared/types'
import { useApplyOnboarding } from '@/hooks/use-apply-onboarding'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => ({
  apiClient: vi.fn(),
  buildApplyPayload: vi.fn(),
}))

vi.mock('@/lib/api-client', () => ({ apiClient: mocks.apiClient }))

vi.mock('@/stores/onboarding-draft-store', () => ({
  useOnboardingDraftStore: {
    getState: () => ({ buildApplyPayload: mocks.buildApplyPayload }),
  },
}))

function renderApply(): () => Promise<ApplyOnboardingResponse> {
  let applyFn: (() => Promise<ApplyOnboardingResponse>) | null = null
  function Harness() {
    applyFn = useApplyOnboarding()
    return null
  }
  TestRenderer.act(() => {
    TestRenderer.create(<Harness />)
  })
  if (!applyFn) throw new Error('hook did not return an apply function')
  return applyFn
}

const validResponse: ApplyOnboardingResponse = {
  applied: true,
  createdHabitCount: 2,
  createdGoal: true,
  loggedFirstHabit: false,
}

describe('mobile useApplyOnboarding', () => {
  beforeEach(() => {
    mocks.apiClient.mockReset()
    mocks.buildApplyPayload.mockReset()
  })

  it('builds the payload from the draft store and POSTs it to the apply endpoint', async () => {
    const payload = { habits: [{ title: 'Run' }], weekStartDay: 1 }
    mocks.buildApplyPayload.mockReturnValue(payload)
    mocks.apiClient.mockResolvedValue(validResponse)

    const apply = renderApply()
    const result = await apply()

    expect(mocks.buildApplyPayload).toHaveBeenCalledTimes(1)
    expect(mocks.apiClient).toHaveBeenCalledWith(API.profile.onboardingApply, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    expect(result).toEqual(validResponse)
  })

  it('rejects when the API response fails the response schema (boundary validation)', async () => {
    mocks.buildApplyPayload.mockReturnValue({})
    mocks.apiClient.mockResolvedValue({ applied: 'yes', createdHabitCount: 1 })

    const apply = renderApply()

    await expect(apply()).rejects.toThrow()
  })

  it('propagates a network error from the API client', async () => {
    mocks.buildApplyPayload.mockReturnValue({})
    mocks.apiClient.mockRejectedValue(new Error('offline'))

    const apply = renderApply()

    await expect(apply()).rejects.toThrow('offline')
  })
})

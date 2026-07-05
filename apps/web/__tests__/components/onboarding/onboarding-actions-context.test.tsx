import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

import {
  useBufferOnboardingActions,
} from '@/components/onboarding/onboarding-actions-context'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'

describe('buffer onboarding actions', () => {
  beforeEach(() => {
    pushMock.mockReset()
    useOnboardingDraftStore.getState().reset()
  })

  it('buffers a created habit into the draft store and returns its index id', async () => {
    const { result } = renderHook(() => useBufferOnboardingActions())

    const created = await result.current.createHabit({
      title: 'Read',
      frequencyUnit: 'Day',
      frequencyQuantity: 1,
    })

    expect(created).toEqual({ id: '0', title: 'Read' })
    expect(useOnboardingDraftStore.getState().habits).toHaveLength(1)
  })

  it('omits the import action in pre-auth mode', () => {
    const { result } = renderHook(() => useBufferOnboardingActions())
    expect(result.current.onImport).toBeUndefined()
  })

  it('marks the draft done and routes to signup on finish', async () => {
    const { result } = renderHook(() => useBufferOnboardingActions())

    await result.current.finishOnboarding()

    expect(useOnboardingDraftStore.getState().onboardingLocallyDone).toBe(true)
    expect(pushMock).toHaveBeenCalledWith('/login?from=onboarding')
  })

  it('buffers the first log against the created habit index', async () => {
    const { result } = renderHook(() => useBufferOnboardingActions())

    await result.current.createHabit({ title: 'Run', frequencyUnit: 'Day', frequencyQuantity: 1 })
    await result.current.logHabit('0')

    expect(useOnboardingDraftStore.getState().firstLog?.habitIndex).toBe(0)
  })
})

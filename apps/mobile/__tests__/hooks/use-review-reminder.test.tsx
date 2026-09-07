import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import type { Profile } from '@orbit/shared/types'
import { useReviewReminderStore } from '@/stores/review-reminder-store'
import { useReviewReminder } from '@/hooks/use-review-reminder'

const TestRenderer = require('react-test-renderer')

const FALLBACK_PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=org.useorbit.app'

const mocks = vi.hoisted(() => ({
  openURL: vi.fn(),
  platform: { OS: 'android' } as { OS: string },
  hasAction: vi.fn(),
  requestReview: vi.fn(),
  storeUrl: vi.fn(),
}))

vi.mock('react-native', async () => {
  const actual = await import('../../test-mocks/react-native')
  return { ...actual, Linking: { openURL: mocks.openURL }, Platform: mocks.platform }
})

vi.mock('expo-store-review', () => ({
  hasAction: mocks.hasAction,
  requestReview: mocks.requestReview,
  storeUrl: mocks.storeUrl,
}))

interface Holder {
  current: ReturnType<typeof useReviewReminder>
}

function renderReview(profile?: Profile | null): Holder {
  const holder = { current: null as unknown as ReturnType<typeof useReviewReminder> }
  function Harness() {
    holder.current = useReviewReminder(profile)
    return null
  }
  TestRenderer.act(() => {
    TestRenderer.create(<Harness />)
  })
  return holder
}

function seedEligibleState(): void {
  useReviewReminderStore.setState({
    completionCount: 10,
    activeDays: ['2026-07-01', '2026-07-02'],
    dismissedUntil: null,
    acceptedAt: null,
  })
}

const eligibleProfile = createMockProfile({ hasCompletedOnboarding: true })

describe('mobile useReviewReminder', () => {
  beforeEach(() => {
    mocks.openURL.mockReset().mockResolvedValue(undefined)
    mocks.hasAction.mockReset()
    mocks.requestReview.mockReset().mockResolvedValue(undefined)
    mocks.storeUrl.mockReset()
    mocks.platform.OS = 'android'
    useReviewReminderStore.getState().reset()
  })

  it('is eligible once the engagement floor is met and onboarding is complete', () => {
    seedEligibleState()
    const hook = renderReview(eligibleProfile)
    expect(hook.current.isEligible).toBe(true)
  })

  it('is not eligible before onboarding completes', () => {
    seedEligibleState()
    const hook = renderReview(createMockProfile({ hasCompletedOnboarding: false }))
    expect(hook.current.isEligible).toBe(false)
  })

  it('is not eligible with no profile', () => {
    seedEligibleState()
    const hook = renderReview(null)
    expect(hook.current.isEligible).toBe(false)
  })

  it('is not eligible below the completion floor', () => {
    useReviewReminderStore.setState({
      completionCount: 3,
      activeDays: ['2026-07-01', '2026-07-02'],
      dismissedUntil: null,
      acceptedAt: null,
    })
    const hook = renderReview(eligibleProfile)
    expect(hook.current.isEligible).toBe(false)
  })

  it('dismiss snoozes the reminder by setting a future dismissedUntil', () => {
    seedEligibleState()
    const hook = renderReview(eligibleProfile)

    TestRenderer.act(() => {
      hook.current.dismiss()
    })

    expect(useReviewReminderStore.getState().dismissedUntil).not.toBeNull()
  })

  it('requestReview uses the native in-app flow when available and records the accept', async () => {
    mocks.hasAction.mockResolvedValue(true)
    const hook = renderReview(eligibleProfile)

    let outcome: boolean | undefined
    await TestRenderer.act(async () => {
      outcome = await hook.current.requestReview()
    })

    expect(outcome).toBe(true)
    expect(mocks.requestReview).toHaveBeenCalledTimes(1)
    expect(mocks.openURL).not.toHaveBeenCalled()
    expect(useReviewReminderStore.getState().acceptedAt).not.toBeNull()
  })

  it('falls back to the store URL when the native flow is unavailable', async () => {
    mocks.hasAction.mockResolvedValue(false)
    mocks.storeUrl.mockReturnValue('https://play.google.com/store/apps/details?id=custom')
    const hook = renderReview(eligibleProfile)

    let outcome: boolean | undefined
    await TestRenderer.act(async () => {
      outcome = await hook.current.requestReview()
    })

    expect(outcome).toBe(true)
    expect(mocks.openURL).toHaveBeenCalledWith('https://play.google.com/store/apps/details?id=custom')
    expect(useReviewReminderStore.getState().acceptedAt).not.toBeNull()
  })

  it('falls back to the hardcoded Play URL on Android when no store URL is provided', async () => {
    mocks.hasAction.mockResolvedValue(false)
    mocks.storeUrl.mockReturnValue(null)
    const hook = renderReview(eligibleProfile)

    let outcome: boolean | undefined
    await TestRenderer.act(async () => {
      outcome = await hook.current.requestReview()
    })

    expect(outcome).toBe(true)
    expect(mocks.openURL).toHaveBeenCalledWith(FALLBACK_PLAY_STORE_URL)
  })

  it('returns false without opening anything when no fallback URL exists off Android', async () => {
    mocks.hasAction.mockResolvedValue(false)
    mocks.storeUrl.mockReturnValue(null)
    mocks.platform.OS = 'ios'
    const hook = renderReview(eligibleProfile)

    let outcome: boolean | undefined
    await TestRenderer.act(async () => {
      outcome = await hook.current.requestReview()
    })

    expect(outcome).toBe(false)
    expect(mocks.openURL).not.toHaveBeenCalled()
  })

  it('recovers to the URL fallback when the native availability check throws', async () => {
    mocks.hasAction.mockRejectedValue(new Error('module missing'))
    mocks.storeUrl.mockReturnValue('https://play.google.com/store/apps/details?id=custom')
    const hook = renderReview(eligibleProfile)

    let outcome: boolean | undefined
    await TestRenderer.act(async () => {
      outcome = await hook.current.requestReview()
    })

    expect(outcome).toBe(true)
    expect(mocks.openURL).toHaveBeenCalledTimes(1)
  })

  it('returns false when opening the fallback URL fails', async () => {
    mocks.hasAction.mockResolvedValue(false)
    mocks.storeUrl.mockReturnValue('https://play.google.com/store/apps/details?id=custom')
    mocks.openURL.mockRejectedValue(new Error('no browser'))
    const hook = renderReview(eligibleProfile)

    let outcome: boolean | undefined
    await TestRenderer.act(async () => {
      outcome = await hook.current.requestReview()
    })

    expect(outcome).toBe(false)
  })
})

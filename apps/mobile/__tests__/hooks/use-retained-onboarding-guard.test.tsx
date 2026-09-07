import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import type { Profile } from '@orbit/shared/types/profile'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => {
  const habitCount = { count: 0, isLoaded: true }
  const patchProfile = vi.fn()
  return {
    habitCount,
    patchProfile,
    useProfile: vi.fn(() => ({ patchProfile })),
    useHabitCountLoaded: vi.fn(() => habitCount),
    performQueuedApiMutation: vi.fn(async () => undefined),
  }
})

vi.mock('@/hooks/use-profile', () => ({ useProfile: mocks.useProfile }))
vi.mock('@/hooks/use-habit-queries', () => ({
  useHabitCountLoaded: mocks.useHabitCountLoaded,
}))
vi.mock('@/lib/queued-api-mutation', () => ({
  performQueuedApiMutation: mocks.performQueuedApiMutation,
}))

import { useRetainedOnboardingGuard } from '@/hooks/use-retained-onboarding-guard'

let lastResult: boolean | undefined

function Harness({
  profile,
  suppressed,
}: {
  profile: Profile | undefined
  suppressed: boolean
}) {
  lastResult = useRetainedOnboardingGuard(profile, suppressed)
  return null
}

function profile(hasCompletedOnboarding: boolean): Profile {
  return createMockProfile({ hasCompletedOnboarding })
}

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

async function render(p: Profile | undefined, suppressed: boolean) {
  let renderer!: { update: (el: React.ReactElement) => void; unmount: () => void }
  await TestRenderer.act(async () => {
    renderer = TestRenderer.create(<Harness profile={p} suppressed={suppressed} />)
    await flush()
  })
  return renderer
}

describe('mobile useRetainedOnboardingGuard', () => {
  beforeEach(() => {
    mocks.habitCount.count = 0
    mocks.habitCount.isLoaded = true
    mocks.patchProfile.mockClear()
    mocks.performQueuedApiMutation.mockClear()
    lastResult = undefined
  })

  it('shows the overlay for a not-onboarded account with no habits', async () => {
    await render(profile(false), false)
    expect(lastResult).toBe(true)
    expect(mocks.performQueuedApiMutation).not.toHaveBeenCalled()
  })

  it('auto-completes instead of showing when the account already has habits', async () => {
    mocks.habitCount.count = 3
    await render(profile(false), false)
    await TestRenderer.act(async () => {
      await flush()
    })
    expect(lastResult).toBe(false)
    expect(mocks.performQueuedApiMutation).toHaveBeenCalledWith({
      type: 'completeOnboarding',
      scope: 'profile',
      endpoint: '/api/profile/onboarding',
      method: 'PUT',
      payload: undefined,
      dedupeKey: 'profile-onboarding-complete',
    })
    expect(mocks.patchProfile).toHaveBeenCalledWith({ hasCompletedOnboarding: true })
  })

  it('waits while the habit count is loading', async () => {
    mocks.habitCount.isLoaded = false
    await render(profile(false), false)
    expect(lastResult).toBe(false)
    expect(mocks.performQueuedApiMutation).not.toHaveBeenCalled()
  })

  it('does nothing once onboarding is already complete', async () => {
    mocks.habitCount.count = 3
    await render(profile(true), false)
    expect(lastResult).toBe(false)
    expect(mocks.performQueuedApiMutation).not.toHaveBeenCalled()
  })

  it('freezes the no-habits decision so habits created mid-flow keep the overlay open', async () => {
    const stable = profile(false)
    const renderer = await render(stable, false)
    expect(lastResult).toBe(true)

    mocks.habitCount.count = 1
    await TestRenderer.act(async () => {
      renderer.update(<Harness profile={stable} suppressed={false} />)
      await flush()
    })

    expect(lastResult).toBe(true)
    expect(mocks.performQueuedApiMutation).not.toHaveBeenCalled()
  })
})

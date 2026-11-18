import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { API } from '@orbit/shared/api'
import { claimOrbitLiveSlot, mayOrbitRunLoop } from '@orbit/shared/utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useMascotMotionSwitch, useOrbitMotionSync } from '@/hooks/use-mascot-motion'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => ({ performQueuedApiMutation: vi.fn() }))

vi.mock('@/lib/queued-api-mutation', () => ({ performQueuedApiMutation: mocks.performQueuedApiMutation }))

function mount(profile: ReturnType<typeof createMockProfile>) {
  let current: ReturnType<typeof useMascotMotionSwitch> | undefined
  const patchProfile = vi.fn()
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
  function Harness() {
    const [state, setState] = React.useState(profile)
    current = useMascotMotionSwitch(state, (patch) => {
      patchProfile(patch)
      setState((previous) => ({ ...previous, ...patch }))
    })
    useOrbitMotionSync(state)
    return null
  }
  TestRenderer.act(() => {
    TestRenderer.create(<QueryClientProvider client={queryClient}><Harness /></QueryClientProvider>)
  })
  return { patchProfile, get control() { return current! } }
}

describe('the Orbit em movimento switch on Android', () => {
  beforeEach(() => {
    mocks.performQueuedApiMutation.mockReset()
  })

  it('is on for a profile that never set the value, and the loop may run', () => {
    const claim = Symbol('claim')
    const release = claimOrbitLiveSlot(claim)
    const { control } = mount(createMockProfile())
    expect(control.enabled).toBe(true)
    expect(mayOrbitRunLoop(claim)).toBe(true)
    release()
  })

  it('starts with the loop off for a profile with the value false', () => {
    const claim = Symbol('claim')
    const release = claimOrbitLiveSlot(claim)
    const { control } = mount(createMockProfile({ mascotMotionEnabled: false }))
    expect(control.enabled).toBe(false)
    expect(mayOrbitRunLoop(claim)).toBe(false)
    release()
  })

  it('applies the change at once, stops the loop and queues one write', async () => {
    mocks.performQueuedApiMutation.mockResolvedValue(undefined)
    const claim = Symbol('claim')
    const release = claimOrbitLiveSlot(claim)
    const harness = mount(createMockProfile({ mascotMotionEnabled: true }))
    expect(mayOrbitRunLoop(claim)).toBe(true)
    TestRenderer.act(() => harness.control.toggle())
    expect(harness.patchProfile).toHaveBeenCalledWith({ mascotMotionEnabled: false })
    expect(harness.control.enabled).toBe(false)
    expect(mayOrbitRunLoop(claim)).toBe(false)
    await vi.waitFor(() => expect(mocks.performQueuedApiMutation).toHaveBeenCalledTimes(1))
    expect(mocks.performQueuedApiMutation).toHaveBeenCalledWith({
      type: 'setMascotMotion',
      scope: 'profile',
      endpoint: API.profile.mascotMotion,
      method: 'PUT',
      payload: { enabled: false },
      dedupeKey: 'profile-mascot-motion',
    })
    release()
  })

  it('restores the previous value and the loop when the write fails', async () => {
    let reject!: (error: Error) => void
    mocks.performQueuedApiMutation.mockReturnValue(new Promise((_resolve, fail) => { reject = fail }))
    const claim = Symbol('claim')
    const release = claimOrbitLiveSlot(claim)
    const harness = mount(createMockProfile({ mascotMotionEnabled: true }))
    TestRenderer.act(() => harness.control.toggle())
    expect(harness.patchProfile).toHaveBeenLastCalledWith({ mascotMotionEnabled: false })
    expect(mayOrbitRunLoop(claim)).toBe(false)
    await vi.waitFor(() => expect(mocks.performQueuedApiMutation).toHaveBeenCalledTimes(1))
    await TestRenderer.act(async () => { reject(new Error('offline')); await Promise.resolve() })
    await vi.waitFor(() => expect(harness.patchProfile).toHaveBeenLastCalledWith({ mascotMotionEnabled: true }))
    expect(harness.control.enabled).toBe(true)
    expect(mayOrbitRunLoop(claim)).toBe(true)
    release()
  })
})

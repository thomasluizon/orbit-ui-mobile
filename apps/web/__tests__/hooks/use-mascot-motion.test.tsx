import React from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { claimOrbitLiveSlot, mayOrbitRunLoop } from '@orbit/shared/utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/stores/auth-store'
import { useMascotMotionSwitch, useOrbitMotionSync } from '@/hooks/use-mascot-motion'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

const mocks = vi.hoisted(() => ({ updateMascotMotion: vi.fn() }))

vi.mock('@/lib/actions/profile', () => ({ updateMascotMotion: mocks.updateMascotMotion }))

beforeEach(() => {
  mocks.updateMascotMotion.mockReset()
  useAuthStore.getState().setAuth({ userId: 'account-a', name: 'Alex', email: 'alex@example.com' })
})

function mount(profile: ReturnType<typeof createMockProfile>) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const patchProfile = vi.fn()
  const rendered = renderHook(() => {
    const [current, setCurrent] = React.useState(profile)
    useOrbitMotionSync(current)
    return useMascotMotionSwitch(current, (patch) => {
      patchProfile(patch)
      setCurrent((previous) => ({ ...previous, ...patch }))
    })
  }, { wrapper })
  return { ...rendered, patchProfile }
}

describe('the Orbit em movimento switch on web', () => {
  it('is on for a profile that never set the value, and the loop may run', () => {
    const claim = Symbol('claim')
    const release = claimOrbitLiveSlot(claim)
    const { result } = mount(createMockProfile())
    expect(result.current.enabled).toBe(true)
    expect(mayOrbitRunLoop(claim)).toBe(true)
    release()
  })

  it('starts with the loop off for a profile with the value false', () => {
    const claim = Symbol('claim')
    const release = claimOrbitLiveSlot(claim)
    const { result } = mount(createMockProfile({ mascotMotionEnabled: false }))
    expect(result.current.enabled).toBe(false)
    expect(mayOrbitRunLoop(claim)).toBe(false)
    release()
  })

  it('applies the change at once, stops the loop and sends one write', async () => {
    mocks.updateMascotMotion.mockReturnValue(new Promise(() => {}))
    const claim = Symbol('claim')
    const release = claimOrbitLiveSlot(claim)
    const { result, patchProfile } = mount(createMockProfile({ mascotMotionEnabled: true }))
    expect(mayOrbitRunLoop(claim)).toBe(true)
    act(() => result.current.toggle())
    expect(patchProfile).toHaveBeenCalledWith({ mascotMotionEnabled: false })
    expect(result.current.enabled).toBe(false)
    expect(mayOrbitRunLoop(claim)).toBe(false)
    await waitFor(() => expect(mocks.updateMascotMotion).toHaveBeenCalledTimes(1))
    expect(mocks.updateMascotMotion.mock.calls[0]![0]).toEqual({ enabled: false })
    release()
  })

  it('restores the previous value and the loop when the write fails', async () => {
    mocks.updateMascotMotion.mockRejectedValue(new Error('offline'))
    const claim = Symbol('claim')
    const release = claimOrbitLiveSlot(claim)
    const { result, patchProfile } = mount(createMockProfile({ mascotMotionEnabled: true }))
    act(() => result.current.toggle())
    expect(mayOrbitRunLoop(claim)).toBe(false)
    await waitFor(() => expect(patchProfile).toHaveBeenLastCalledWith({ mascotMotionEnabled: true }))
    expect(result.current.enabled).toBe(true)
    expect(mayOrbitRunLoop(claim)).toBe(true)
    release()
  })
})

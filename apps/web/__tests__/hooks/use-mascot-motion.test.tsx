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

function mount(profile: ReturnType<typeof createMockProfile>, patchProfile = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const rendered = renderHook(() => {
    useOrbitMotionSync(profile)
    return useMascotMotionSwitch(profile, patchProfile)
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

  it('applies the change at once and sends one write', async () => {
    mocks.updateMascotMotion.mockReturnValue(new Promise(() => {}))
    const { result, patchProfile } = mount(createMockProfile({ mascotMotionEnabled: true }))
    act(() => result.current.toggle())
    expect(patchProfile).toHaveBeenCalledWith({ mascotMotionEnabled: false })
    await waitFor(() => expect(result.current.pending).toBe(true))
    expect(mocks.updateMascotMotion).toHaveBeenCalledTimes(1)
    expect(mocks.updateMascotMotion.mock.calls[0]![0]).toEqual({ enabled: false })
  })

  it('restores the previous value when the write fails', async () => {
    mocks.updateMascotMotion.mockRejectedValue(new Error('offline'))
    const { result, patchProfile } = mount(createMockProfile({ mascotMotionEnabled: true }))
    act(() => result.current.toggle())
    await waitFor(() => expect(patchProfile).toHaveBeenLastCalledWith({ mascotMotionEnabled: true }))
  })
})

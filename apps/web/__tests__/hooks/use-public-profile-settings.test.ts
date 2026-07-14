import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { profileKeys } from '@orbit/shared/query'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import type { PublicProfileSettings } from '@orbit/shared/types/public-profile'
import { usePublicProfileSettings } from '@/hooks/use-public-profile-settings'

vi.mock('@/app/actions/profile', () => ({
  updatePublicProfile: vi.fn(),
}))

const settings: PublicProfileSettings = {
  enabled: true,
  slug: 'ada-l',
  shareUrl: 'https://app.useorbit.org/u/ada-l',
  showStreak: true,
  showLevel: false,
  showAchievements: true,
  showTopHabits: false,
}

function createHarness() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
  return { queryClient, wrapper }
}

describe('usePublicProfileSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('writes the returned settings into the cached profile and invalidates', async () => {
    const { updatePublicProfile } = await import('@/app/actions/profile')
    vi.mocked(updatePublicProfile).mockResolvedValue(settings)

    const { queryClient, wrapper } = createHarness()
    queryClient.setQueryData(profileKeys.detail(), createMockProfile())
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => usePublicProfileSettings(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({
        enabled: true,
        showStreak: true,
        showLevel: false,
        showAchievements: true,
        showTopHabits: false,
        regenerate: true,
      })
    })

    expect(updatePublicProfile).toHaveBeenCalledWith(expect.objectContaining({ regenerate: true }))
    const cached = queryClient.getQueryData<{ publicProfile?: PublicProfileSettings }>(profileKeys.detail())
    expect(cached?.publicProfile).toEqual(settings)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: profileKeys.all })
  })

  it('leaves the cache untouched when there is no cached profile yet', async () => {
    const { updatePublicProfile } = await import('@/app/actions/profile')
    vi.mocked(updatePublicProfile).mockResolvedValue(settings)

    const { queryClient, wrapper } = createHarness()
    const { result } = renderHook(() => usePublicProfileSettings(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({
        enabled: false,
        showStreak: false,
        showLevel: false,
        showAchievements: false,
        showTopHabits: false,
        regenerate: false,
      })
    })

    expect(queryClient.getQueryData(profileKeys.detail())).toBeUndefined()
  })

  it('propagates a failed update', async () => {
    const { updatePublicProfile } = await import('@/app/actions/profile')
    vi.mocked(updatePublicProfile).mockRejectedValue(new Error('server down'))
    const { wrapper } = createHarness()
    const { result } = renderHook(() => usePublicProfileSettings(), { wrapper })

    act(() => {
      result.current.mutate({
        enabled: true,
        showStreak: true,
        showLevel: true,
        showAchievements: true,
        showTopHabits: true,
        regenerate: false,
      })
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

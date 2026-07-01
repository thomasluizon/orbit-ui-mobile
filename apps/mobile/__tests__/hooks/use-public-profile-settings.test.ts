import { beforeEach, describe, expect, it, vi } from 'vitest'
import { profileKeys } from '@orbit/shared/query'
import type { Profile } from '@orbit/shared/types/profile'
import type {
  PublicProfileSettings,
  UpdatePublicProfileRequest,
} from '@orbit/shared/types/public-profile'
import { usePublicProfileSettings } from '@/hooks/use-public-profile-settings'

const mocks = vi.hoisted(() => {
  const store: { profile: unknown } = { profile: undefined }
  const queryClient = {
    setQueryData: vi.fn((key: readonly unknown[], updater: unknown) => {
      if (JSON.stringify(key) !== JSON.stringify(profileKeys.detail())) return
      store.profile =
        typeof updater === 'function'
          ? (updater as (old: unknown) => unknown)(store.profile)
          : updater
    }),
    invalidateQueries: vi.fn(async () => {}),
  }
  return {
    store,
    queryClient,
    useQueryClient: vi.fn(() => queryClient),
    useMutation: vi.fn((config: unknown) => config),
    apiClient: vi.fn(),
  }
})

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: mocks.useQueryClient,
  useMutation: mocks.useMutation,
}))

vi.mock('@/lib/api-client', () => ({
  apiClient: mocks.apiClient,
}))

type MutationConfig = {
  mutationFn: (input: UpdatePublicProfileRequest) => Promise<PublicProfileSettings>
  onSuccess?: (data: PublicProfileSettings) => void
  onSettled?: () => void
}

const serverSettings: PublicProfileSettings = {
  enabled: true,
  slug: 'ABCDEFGHJKLMNPQRSTUV12',
  shareUrl: 'https://app.useorbit.org/u/ABCDEFGHJKLMNPQRSTUV12',
  showStreak: true,
  showLevel: true,
  showAchievements: false,
  showTopHabits: true,
}

describe('usePublicProfileSettings', () => {
  beforeEach(() => {
    mocks.store.profile = {
      name: 'Ana',
      publicProfile: {
        enabled: false,
        slug: null,
        shareUrl: null,
        showStreak: true,
        showLevel: true,
        showAchievements: true,
        showTopHabits: false,
      },
    }
    mocks.apiClient.mockReset()
    mocks.queryClient.setQueryData.mockClear()
    mocks.queryClient.invalidateQueries.mockClear()
  })

  it('PUTs the request to the public-profile endpoint and returns the settings', async () => {
    const mutation = usePublicProfileSettings() as unknown as MutationConfig
    mocks.apiClient.mockResolvedValue(serverSettings)

    const input: UpdatePublicProfileRequest = {
      enabled: true,
      showStreak: true,
      showLevel: true,
      showAchievements: false,
      showTopHabits: true,
      regenerate: false,
    }
    const result = await mutation.mutationFn(input)

    expect(result).toEqual(serverSettings)
    expect(mocks.apiClient).toHaveBeenCalledWith(
      '/api/profile/public',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify(input) }),
    )
  })

  it('writes the returned settings into the cached profile', () => {
    const mutation = usePublicProfileSettings() as unknown as MutationConfig

    mutation.onSuccess?.(serverSettings)

    expect((mocks.store.profile as Profile).publicProfile).toEqual(serverSettings)
  })

  it('invalidates the profile query on settle', () => {
    const mutation = usePublicProfileSettings() as unknown as MutationConfig

    mutation.onSettled?.()

    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: profileKeys.all })
  })
})

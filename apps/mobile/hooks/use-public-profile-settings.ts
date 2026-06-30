import { useMutation, useQueryClient } from '@tanstack/react-query'
import { profileKeys } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import type { Profile } from '@orbit/shared/types/profile'
import type {
  PublicProfileSettings,
  UpdatePublicProfileRequest,
} from '@orbit/shared/types/public-profile'
import { apiClient } from '@/lib/api-client'

/**
 * Persists the user's public-profile sharing settings (enable, four visibility flags,
 * regenerate). Writes the server-returned slug/share URL into the cached profile, then
 * invalidates the profile query so every surface reflects the new state.
 */
export function usePublicProfileSettings() {
  const queryClient = useQueryClient()

  return useMutation<PublicProfileSettings, Error, UpdatePublicProfileRequest>({
    mutationFn: (input) =>
      apiClient<PublicProfileSettings>(API.profile.public, {
        method: 'PUT',
        body: JSON.stringify(input),
        headers: { 'Content-Type': 'application/json' },
      }),

    onSuccess: (settings) => {
      queryClient.setQueryData<Profile>(profileKeys.detail(), (old) =>
        old ? { ...old, publicProfile: settings } : old,
      )
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: profileKeys.all })
    },
  })
}

import { useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { API } from '@orbit/shared/api'
import type { Profile } from '@orbit/shared/types/profile'
import { setOrbitMotionEnabled } from '@orbit/shared/utils'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'

/** Feeds the profile value into the idle loop. An account that never set it has the loop on. */
export function useOrbitMotionSync(profile: Profile | undefined): void {
  const enabled = profile?.mascotMotionEnabled
  useEffect(() => {
    setOrbitMotionEnabled(enabled)
  }, [enabled])
}

/** The `Orbit em movimento` switch: the change applies at once, waits in the offline queue and rolls back when the write fails. */
export function useMascotMotionSwitch(
  profile: Profile | undefined,
  patchProfile: (patch: Partial<Profile>) => void,
) {
  const enabled = profile?.mascotMotionEnabled ?? true
  // react-doctor-disable-next-line query-mutation-missing-invalidation -- The optimistic profile cache update mirrors the stored boolean and rolls back on error, as the other profile switches do. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  const mutation = useMutation({
    mutationFn: (next: boolean) => performQueuedApiMutation({
      type: 'setMascotMotion',
      scope: 'profile',
      endpoint: API.profile.mascotMotion,
      method: 'PUT',
      payload: { enabled: next },
      dedupeKey: 'profile-mascot-motion',
    }),
    onMutate: (next) => {
      const previous = profile?.mascotMotionEnabled
      patchProfile({ mascotMotionEnabled: next })
      return { previous }
    },
    onError: (_error, _next, context) => {
      patchProfile({ mascotMotionEnabled: context?.previous })
    },
  })
  return { enabled, pending: mutation.isPending, toggle: () => mutation.mutate(!enabled) }
}

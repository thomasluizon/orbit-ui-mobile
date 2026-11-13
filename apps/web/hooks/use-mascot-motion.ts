'use client'

import { useEffect } from 'react'
import type { Profile } from '@orbit/shared/types/profile'
import { setOrbitMotionEnabled } from '@orbit/shared/utils'
import { updateMascotMotion } from '@/lib/actions/profile'
import { useAccountScopedMutation } from '@/hooks/use-account-scoped-mutation'

/** Feeds the profile value into the idle loop. An account that never set it has the loop on. */
export function useOrbitMotionSync(profile: Profile | undefined): void {
  const enabled = profile?.mascotMotionEnabled
  useEffect(() => {
    setOrbitMotionEnabled(enabled)
  }, [enabled])
}

/** The `Orbit em movimento` switch: the change applies at once and rolls back when the write fails. */
export function useMascotMotionSwitch(
  profile: Profile | undefined,
  patchProfile: (patch: Partial<Profile>) => void,
) {
  const enabled = profile?.mascotMotionEnabled ?? true
  const mutation = useAccountScopedMutation({
    mutationFn: (next: boolean, intendedAccountId) => updateMascotMotion({ enabled: next }, intendedAccountId),
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

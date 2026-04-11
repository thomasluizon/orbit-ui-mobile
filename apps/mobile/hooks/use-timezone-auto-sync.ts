import { useEffect } from 'react'
import { AppState } from 'react-native'
import { useQueryClient } from '@tanstack/react-query'
import { API } from '@orbit/shared/api'
import { profileKeys } from '@orbit/shared/query'
import type { Profile } from '@orbit/shared/types/profile'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'

// Single-instance timezone auto-sync. Call exactly once from the root layout.
// Compares the device timezone against the cached profile on mount and on
// AppState 'active'; queues PUT /api/profile/timezone only when they differ.
export function useTimezoneAutoSync(profile: Profile | undefined) {
  const queryClient = useQueryClient()

  useEffect(() => {
    const checkAndSync = () => {
      const current = queryClient.getQueryData<Profile>(profileKeys.detail())
      if (!current) return
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
      if (!detected || detected === 'UTC') return
      if (current.timeZone === detected) return
      performQueuedApiMutation({
        type: 'setTimeZone',
        scope: 'profile',
        endpoint: API.profile.timezone,
        method: 'PUT',
        payload: { timeZone: detected },
        dedupeKey: 'profile-timezone-auto',
      })
        .then(() => {
          queryClient.setQueryData<Profile>(profileKeys.detail(), (old) =>
            old ? { ...old, timeZone: detected } : old,
          )
        })
        .catch(() => {
          // Silently ignore -- timezone update is best-effort
        })
    }

    if (profile) checkAndSync()

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') checkAndSync()
    })
    return () => subscription.remove()
  }, [profile, queryClient])
}

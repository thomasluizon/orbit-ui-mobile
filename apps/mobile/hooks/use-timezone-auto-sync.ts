import { useEffect } from 'react'
import { AppState } from 'react-native'
import { useQueryClient } from '@tanstack/react-query'
import { API } from '@orbit/shared/api'
import { habitKeys, profileKeys } from '@orbit/shared/query'
import type { Profile } from '@orbit/shared/types/profile'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'

async function queueTimezoneSyncIfNeeded(
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<void> {
  const current = queryClient.getQueryData<Profile>(profileKeys.detail())
  if (!current) return

  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
  if (!detected || detected === 'UTC' || current.timeZone === detected) return

  try {
    await performQueuedApiMutation({
      type: 'setTimeZone',
      scope: 'profile',
      endpoint: API.profile.timezone,
      method: 'PUT',
      payload: { timeZone: detected },
      dedupeKey: 'profile-timezone-auto',
    })
    queryClient.setQueryData<Profile>(profileKeys.detail(), (old) =>
      old ? { ...old, timeZone: detected } : old,
    )
    void queryClient.invalidateQueries({ queryKey: habitKeys.all })
  } catch {
  }
}

export function useTimezoneAutoSync(profile: Profile | undefined) {
  const queryClient = useQueryClient()

  useEffect(() => {
    const checkAndSync = () => {
      void queueTimezoneSyncIfNeeded(queryClient)
    }

    if (profile) checkAndSync()

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') checkAndSync()
    })
    return () => subscription.remove()
  }, [profile, queryClient])
}

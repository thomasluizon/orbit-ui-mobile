import { useEffect } from 'react'
import { AppState } from 'react-native'
import { useQueryClient } from '@tanstack/react-query'
import { API } from '@orbit/shared/api'
import { gamificationKeys, habitKeys, profileKeys } from '@orbit/shared/query'
import type { Profile } from '@orbit/shared/types/profile'
import { formatAPIDateInTimeZone, millisecondsUntilNextDay } from '@orbit/shared/utils'
import { isQueuedResult, performQueuedApiMutation } from '@/lib/queued-api-mutation'

async function queueTimezoneSyncIfNeeded(
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<void> {
  const current = queryClient.getQueryData<Profile>(profileKeys.detail())
  if (!current) return

  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
  if (!detected || detected === 'UTC' || current.timeZone != null) return

  try {
    const result = await performQueuedApiMutation({
      type: 'setTimeZone',
      scope: 'profile',
      endpoint: API.profile.timezone,
      method: 'PUT',
      payload: { timeZone: detected },
      dedupeKey: 'profile-timezone-auto',
    })
    if (isQueuedResult(result)) return
    queryClient.setQueryData<Profile>(profileKeys.detail(), (old) =>
      old ? { ...old, timeZone: detected } : old,
    )
    void queryClient.invalidateQueries({ queryKey: gamificationKeys.all, refetchType: 'none' })
    void queryClient.invalidateQueries({ queryKey: habitKeys.all })
  } catch {
  }
}

export function useTimezoneAutoSync(profile: Profile | undefined) {
  const queryClient = useQueryClient()
  const timeZone = profile?.timeZone

  useEffect(() => {
    if (timeZone === undefined) return
    let accountDay = formatAPIDateInTimeZone(new Date(), timeZone)
    let rolloverTimer: ReturnType<typeof globalThis.setTimeout>
    const checkAccountDay = () => {
      const nextDay = formatAPIDateInTimeZone(new Date(), timeZone)
      if (nextDay === accountDay) return
      accountDay = nextDay
      void queryClient.invalidateQueries({ queryKey: gamificationKeys.all })
    }
    const scheduleRollover = () => {
      globalThis.clearTimeout(rolloverTimer)
      rolloverTimer = globalThis.setTimeout(() => {
        checkAccountDay()
        scheduleRollover()
      }, millisecondsUntilNextDay(new Date(), timeZone))
    }
    scheduleRollover()
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return
      checkAccountDay()
      scheduleRollover()
    })
    return () => {
      globalThis.clearTimeout(rolloverTimer)
      subscription.remove()
    }
  }, [queryClient, timeZone])

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

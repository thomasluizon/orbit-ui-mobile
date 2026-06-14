'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { habitKeys, profileKeys } from '@orbit/shared/query'
import type { Profile } from '@orbit/shared/types/profile'
import { updateTimezone } from '@/app/actions/profile'

async function syncTimezoneIfNeeded(
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<void> {
  const current = queryClient.getQueryData<Profile>(profileKeys.detail())
  if (!current) return

  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
  if (!detected || detected === 'UTC' || current.timeZone === detected) return

  try {
    await updateTimezone({ timeZone: detected })
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
      void syncTimezoneIfNeeded(queryClient)
    }

    if (profile) checkAndSync()

    const browserWindow = globalThis.window
    if (browserWindow === undefined) return

    browserWindow.addEventListener('focus', checkAndSync)
    return () => browserWindow.removeEventListener('focus', checkAndSync)
  }, [profile, queryClient])
}

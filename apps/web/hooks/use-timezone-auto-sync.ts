'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { habitKeys, profileKeys } from '@orbit/shared/query'
import type { Profile } from '@orbit/shared/types/profile'
import { updateTimezone } from '@/lib/actions/profile'
import { captureAccountIntent, reportAccountChanged } from '@/lib/client-action'
import { reportsAccountChanged } from '@/app/actions/action-result'

async function syncTimezoneIfNeeded(
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<void> {
  const current = queryClient.getQueryData<Profile>(profileKeys.detail())
  if (!current) return

  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
  if (!detected || detected === 'UTC' || current.timeZone === detected) return
  const intent = captureAccountIntent()

  try {
    await intent.run(() => updateTimezone({ timeZone: detected }))
    if (!intent.stillCurrent()) return
    queryClient.setQueryData<Profile>(profileKeys.detail(), (old) =>
      old ? { ...old, timeZone: detected } : old,
    )
    void queryClient.invalidateQueries({ queryKey: habitKeys.all })
  } catch (error) {
    if (reportsAccountChanged(error)) reportAccountChanged()
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
    browserWindow.addEventListener('focus', checkAndSync)
    return () => browserWindow.removeEventListener('focus', checkAndSync)
  }, [profile, queryClient])
}

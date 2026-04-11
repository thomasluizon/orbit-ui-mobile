'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { profileKeys } from '@orbit/shared/query'
import type { Profile } from '@orbit/shared/types/profile'
import { updateTimezone } from '@/app/actions/profile'

// Single-instance timezone auto-sync. Call exactly once from the app shell.
// Compares the device timezone against the cached profile on mount and on
// window focus; sends PUT /api/profile/timezone only when they differ.
export function useTimezoneAutoSync(profile: Profile | undefined) {
  const queryClient = useQueryClient()

  useEffect(() => {
    const checkAndSync = () => {
      const current = queryClient.getQueryData<Profile>(profileKeys.detail())
      if (!current) return
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
      if (!detected || detected === 'UTC') return
      if (current.timeZone === detected) return
      updateTimezone({ timeZone: detected })
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

    if (typeof window === 'undefined') return
    window.addEventListener('focus', checkAndSync)
    return () => window.removeEventListener('focus', checkAndSync)
  }, [profile, queryClient])
}

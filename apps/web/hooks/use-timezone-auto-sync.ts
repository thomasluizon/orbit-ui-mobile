'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { useQueryClient } from '@tanstack/react-query'
import { gamificationKeys, habitKeys, profileKeys } from '@orbit/shared/query'
import type { Profile } from '@orbit/shared/types/profile'
import { updateTimezone } from '@/lib/actions/profile'
import { getHeldAccountId } from '@/stores/auth-store'
import { getAccountGeneration } from '@/lib/session-epoch'
import { reportsAccountChanged } from '@/app/actions/action-result'
import { useAppToast } from '@/hooks/use-app-toast'

async function syncTimezoneIfNeeded(
  queryClient: ReturnType<typeof useQueryClient>,
  onAccountChanged: () => void,
): Promise<void> {
  const intendedAccountId = getHeldAccountId()
  const accountGeneration = getAccountGeneration()
  const current = queryClient.getQueryData<Profile>(profileKeys.detail())
  if (!current) return

  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
  if (!detected || detected === 'UTC' || current.timeZone != null) return

  try {
    await updateTimezone({ timeZone: detected }, intendedAccountId)
    if (getHeldAccountId() !== intendedAccountId || getAccountGeneration() !== accountGeneration) return
    queryClient.setQueryData<Profile>(profileKeys.detail(), (old) =>
      old ? { ...old, timeZone: detected } : old,
    )
    void queryClient.invalidateQueries({ queryKey: gamificationKeys.all, refetchType: 'none' })
    void queryClient.invalidateQueries({ queryKey: habitKeys.all })
  } catch (error) {
    if (reportsAccountChanged(error)) onAccountChanged()
  }
}

export function useTimezoneAutoSync(profile: Profile | undefined) {
  const t = useTranslations()
  const { showPersistentError } = useAppToast()
  const queryClient = useQueryClient()

  useEffect(() => {
    const checkAndSync = () => {
      void syncTimezoneIfNeeded(queryClient, () => {
        showPersistentError(t('errors.api.accountChanged'), t('common.dismiss'))
      })
    }

    if (profile) checkAndSync()

    const browserWindow = globalThis.window
    browserWindow.addEventListener('focus', checkAndSync)
    return () => browserWindow.removeEventListener('focus', checkAndSync)
  }, [profile, queryClient, showPersistentError, t])
}

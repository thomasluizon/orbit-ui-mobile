'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { profileKeys } from '@orbit/shared/query'
import type { Profile } from '@orbit/shared/types/profile'
import { buildAccountScopedStorageKey } from '@orbit/shared/utils'
import { completeOnboarding } from '@/lib/actions/profile'
import { getHeldAccountId, useHeldAccountId } from '@/stores/auth-store'
import { getAccountGeneration } from '@/lib/session-epoch'
import { useOffline } from '@/hooks/use-offline'
import { useAppToast } from '@/hooks/use-app-toast'
import { useTranslations } from 'next-intl'

const COMPLETION_PENDING_KEY = 'orbit_onboarding_completion_pending'
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function completionKey(accountId: string) {
  return buildAccountScopedStorageKey(COMPLETION_PENDING_KEY, accountId)
}

export async function completeOnboardingOrQueue(accountId: string | null) {
  if (!navigator.onLine && accountId !== null) {
    localStorage.setItem(completionKey(accountId), '1')
    listeners.forEach((listener) => listener())
    return
  }
  await completeOnboarding(accountId)
}

export function useOnboardingCompletionQueue() {
  const accountId = useHeldAccountId()
  const { isOnline } = useOffline()
  const queryClient = useQueryClient()
  const { showError } = useAppToast()
  const t = useTranslations()
  const queued = useSyncExternalStore(subscribe, () => accountId !== null && localStorage.getItem(completionKey(accountId)) === '1', () => false)
  useEffect(() => {
    if (!queued || !isOnline || accountId === null) return
    const generation = getAccountGeneration()
    void completeOnboarding(accountId).then(() => {
      if (getHeldAccountId() !== accountId || getAccountGeneration() !== generation) return
      localStorage.removeItem(completionKey(accountId))
      listeners.forEach((listener) => listener())
      queryClient.setQueryData<Profile>(profileKeys.detail(), (current) => current ? { ...current, hasCompletedOnboarding: true } : current)
    }).catch(() => {
      if (getAccountGeneration() === generation) showError(t('onboarding.flow.completionFailed'))
    })
  }, [accountId, isOnline, queryClient, queued, showError, t])
  return queued
}

'use client'

import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { profileKeys, subscriptionKeys } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import type { Profile } from '@orbit/shared/types/profile'
import { fetchJson } from '@/lib/api-fetch'
import { useHeldAccountId, getHeldAccountId } from '@/stores/auth-store'
import { getAccountGeneration } from '@/lib/session-epoch'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { useAppToast } from '@/hooks/use-app-toast'

const SETTLEMENT_BACKOFF_MS = [1000, 2000, 4000, 8000]

/**
 * Settles a return from Stripe checkout. `purchaseConfirmed` turns true only after the profile read reports a paid Pro plan.
 * A trial already has Pro access, so the read of a trial person settles only when the trial gives way to the plan.
 * With `toastOnSuccess` off, the caller owns the feedback, such as the result dialog of the upgrade route.
 */
export function useStripeCheckoutReturn({ toastOnSuccess = true }: { toastOnSuccess?: boolean } = {}) {
  const queryClient = useQueryClient()
  const t = useTranslations()
  const { showSuccess } = useAppToast()
  const accountId = useHeldAccountId()
  const returnAccount = useRef<{ id: string; generation: number } | null>(null)
  const [retryAttempt, setRetryAttempt] = useState(0)
  const [returnState, setReturnState] = useAccountScopedState({ hasReturnError: false, isSettling: false, purchaseConfirmed: false })
  useEffect(() => {
    if (accountId === null || new URLSearchParams(globalThis.location.search).get('subscription') !== 'success') return
    const generation = getAccountGeneration()
    returnAccount.current ??= { id: accountId, generation }
    if (returnAccount.current.id !== accountId || returnAccount.current.generation !== generation) return
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    const isCurrentAccount = () => !cancelled && getAccountGeneration() === generation && getHeldAccountId() === accountId
    const handleFailure = () => {
      if (isCurrentAccount()) setReturnState({ hasReturnError: true, isSettling: false, purchaseConfirmed: false })
    }
    const settle = async (attempt: number): Promise<void> => {
      if (!isCurrentAccount()) return
      const [profile] = await Promise.all([
        queryClient.fetchQuery({ queryKey: profileKeys.detail(), queryFn: () => fetchJson<Profile>(API.profile.get), staleTime: 0 }),
        queryClient.invalidateQueries({ queryKey: subscriptionKeys.all }, { throwOnError: true }),
      ])
      if (!isCurrentAccount()) return
      if (!profile.hasProAccess || profile.isTrialActive) {
        const delay = SETTLEMENT_BACKOFF_MS[attempt]
        if (delay === undefined) handleFailure()
        else retryTimer = setTimeout(() => { void settle(attempt + 1).catch(handleFailure) }, delay)
        return
      }
      const url = new URL(globalThis.location.href)
      if (url.searchParams.get('subscription') !== 'success') return
      url.searchParams.delete('subscription')
      globalThis.history.replaceState(globalThis.history.state, '', url)
      setReturnState({ hasReturnError: false, isSettling: false, purchaseConfirmed: true })
      if (toastOnSuccess) showSuccess(t('upgrade.purchaseSuccess'))
    }
    void Promise.resolve().then(() => {
      if (!isCurrentAccount()) return
      setReturnState({ hasReturnError: false, isSettling: true, purchaseConfirmed: false })
      return settle(0)
    }).catch(handleFailure)
    return () => {
      cancelled = true
      clearTimeout(retryTimer)
    }
  }, [accountId, queryClient, retryAttempt, setReturnState, showSuccess, t, toastOnSuccess])
  return { ...returnState, retryReturn: () => setRetryAttempt((attempt) => attempt + 1) }
}

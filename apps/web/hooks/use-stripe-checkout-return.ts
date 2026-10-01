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

export function useStripeCheckoutReturn() {
  const queryClient = useQueryClient()
  const t = useTranslations()
  const { showSuccess } = useAppToast()
  const accountId = useHeldAccountId()
  const returnAccount = useRef<{ id: string; generation: number } | null>(null)
  const [retryAttempt, setRetryAttempt] = useState(0)
  const [returnState, setReturnState] = useAccountScopedState({ hasReturnError: false, isSettling: false })
  const settlementPending = useRef(false)
  useEffect(() => {
    if (settlementPending.current || accountId === null || new URLSearchParams(globalThis.location.search).get('subscription') !== 'success') return
    const generation = getAccountGeneration()
    returnAccount.current ??= { id: accountId, generation }
    if (returnAccount.current.id !== accountId || returnAccount.current.generation !== generation) return
    const isCurrentAccount = () => getAccountGeneration() === generation && getHeldAccountId() === accountId
    settlementPending.current = true
    void Promise.resolve().then(async () => {
      setReturnState((previous) => ({ ...previous, isSettling: true }))
      await Promise.all([
        queryClient.fetchQuery({ queryKey: profileKeys.detail(), queryFn: () => fetchJson<Profile>(API.profile.get), staleTime: 0 }),
        queryClient.invalidateQueries({ queryKey: subscriptionKeys.all }, { throwOnError: true }),
      ])
      if (!isCurrentAccount()) return
      const url = new URL(globalThis.location.href)
      if (url.searchParams.get('subscription') !== 'success') return
      url.searchParams.delete('subscription')
      globalThis.history.replaceState(globalThis.history.state, '', url)
      setReturnState({ hasReturnError: false, isSettling: false })
      showSuccess(t('upgrade.purchaseSuccess'))
    }).catch(() => {
      if (isCurrentAccount()) setReturnState({ hasReturnError: true, isSettling: false })
    }).finally(() => { settlementPending.current = false })
  }, [accountId, queryClient, retryAttempt, setReturnState, showSuccess, t])
  return { ...returnState, retryReturn: () => setRetryAttempt((attempt) => attempt + 1) }
}

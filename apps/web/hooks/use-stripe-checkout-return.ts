'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { profileKeys, subscriptionKeys } from '@orbit/shared/query'
import { useHeldAccountId, getHeldAccountId } from '@/stores/auth-store'
import { getAccountGeneration } from '@/lib/session-epoch'
import { useAppToast } from '@/hooks/use-app-toast'

export function useStripeCheckoutReturn() {
  const queryClient = useQueryClient()
  const t = useTranslations()
  const { showSuccess } = useAppToast()
  const accountId = useHeldAccountId()
  useEffect(() => {
    if (accountId === null || new URLSearchParams(globalThis.location.search).get('subscription') !== 'success') return
    const url = new URL(globalThis.location.href)
    const generation = getAccountGeneration()
    url.searchParams.delete('subscription')
    globalThis.history.replaceState(globalThis.history.state, '', url)
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: profileKeys.all }),
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.all }),
    ]).then(() => {
      if (getAccountGeneration() === generation && getHeldAccountId() === accountId) showSuccess(t('upgrade.purchaseSuccess'))
    })
  }, [accountId, queryClient, showSuccess, t])
}

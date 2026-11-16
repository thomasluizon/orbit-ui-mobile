'use client'

import { useCallback, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { API } from '@orbit/shared/api'
import { createApiClientError, getClientTimeZone, getFriendlyErrorMessage } from '@orbit/shared/utils'
import { fetchWithThrottle } from '@/lib/throttle-fetch'
import { getHeldAccountId } from '@/stores/auth-store'
import { getAccountGeneration } from '@/lib/session-epoch'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { useOffline } from '@/hooks/use-offline'

type SubscriptionInterval = 'monthly' | 'yearly'

export function useStripeCheckout(beforeRedirect?: () => Promise<void>) {
  const t = useTranslations()
  const { isOnline } = useOffline()
  const [checkoutLoading, setCheckoutLoading] = useAccountScopedState<SubscriptionInterval | null>(null)
  const checkoutPendingRef = useRef<number | null>(null)
  const [checkoutError, setCheckoutError] = useAccountScopedState('')
  const checkout = useCallback(
    async (interval: SubscriptionInterval) => {
      const checkoutAccount = getAccountGeneration()
      const checkoutOwner = getHeldAccountId()
      if (checkoutPendingRef.current === checkoutAccount || !isOnline || checkoutOwner === null) return
      checkoutPendingRef.current = checkoutAccount
      setCheckoutLoading(interval)
      setCheckoutError('')
      try {
        const timeZone = getClientTimeZone()
        const checkoutUrl = timeZone
          ? `${API.subscription.checkout}?timeZone=${encodeURIComponent(timeZone)}`
          : API.subscription.checkout
        const response = await fetchWithThrottle(checkoutUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Orbit-Held-Account-Id': checkoutOwner,
          },
          body: JSON.stringify({ interval }),
        })
        if (!response.ok) {
          const errorBody: unknown = await response.json().catch(() => null)
          throw createApiClientError(
            response.status,
            errorBody,
            `Failed with status ${response.status}`,
          )
        }
        const responseBody = (await response.json()) as { url: string }
        if (getAccountGeneration() !== checkoutAccount) return
        if (responseBody.url) {
          await beforeRedirect?.()
          if (getAccountGeneration() === checkoutAccount && getHeldAccountId() === checkoutOwner) globalThis.location.href = responseBody.url
        }
      } catch (error: unknown) {
        if (getAccountGeneration() !== checkoutAccount) return
        setCheckoutError(getFriendlyErrorMessage(error, t, 'auth.genericError', 'generic'))
      } finally {
        if (checkoutPendingRef.current === checkoutAccount) {
          checkoutPendingRef.current = null
          setCheckoutLoading(null)
        }
      }
    },
    [beforeRedirect, isOnline, setCheckoutError, setCheckoutLoading, t],
  )

  return { checkout, checkoutLoading, checkoutError }
}

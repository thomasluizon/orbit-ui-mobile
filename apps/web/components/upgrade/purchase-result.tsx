'use client'

import { useCallback, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import type { SubscriptionStatus } from '@orbit/shared/types/profile'
import type { BillingDetails } from '@orbit/shared/types/subscription'
import { formatPurchaseResult, resolvePurchaseResult, type PurchaseResult as PurchaseResultSentence } from '@orbit/shared/utils'
import { ResultDialog } from '@/components/ui/result-dialog'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { getHeldAccountId } from '@/stores/auth-store'

const PURCHASE_FROM_KEY = 'orbit.upgrade.purchase-from'

/** Stripe returns to one fixed address. The `from` of the visit that started the checkout waits in session storage, under its account. */
function rememberPurchaseFrom(accountId: string | null, from: string | null): void {
  if (accountId === null || from === null) globalThis.sessionStorage.removeItem(PURCHASE_FROM_KEY)
  else globalThis.sessionStorage.setItem(PURCHASE_FROM_KEY, `${accountId} ${from}`)
}

function readPurchaseFrom(accountId: string | null): string | null {
  const stored = globalThis.sessionStorage.getItem(PURCHASE_FROM_KEY)
  if (stored === null || accountId === null) return null
  const separator = stored.indexOf(' ')
  return stored.slice(0, separator) === accountId ? stored.slice(separator + 1) : null
}

const subscribeToNothing = () => () => {}

/** What the checkout runs before it leaves for Stripe: it remembers the `from` of this visit. With the guided flows off, nothing runs. */
export function usePurchaseOrigin(guided: boolean, from: string | null): (() => Promise<void>) | undefined {
  const remember = useCallback(() => {
    rememberPurchaseFrom(getHeldAccountId(), from)
    return Promise.resolve()
  }, [from])
  return guided ? remember : undefined
}

interface PurchaseResultProps {
  /** True after the return from the provider settled and the profile read reports Pro. */
  purchaseConfirmed: boolean
  /** The subscription read. Null while it loads or after it failed. */
  status: SubscriptionStatus | null
  billing: BillingDetails | null
  accountId: string | null
  from: string | null
  timeZone: string | null | undefined
  /** The route a `from` value names, or null for a value that names no known place. */
  knownOrigin: (from: string | null) => string | null
}

/**
 * The result of a confirmed purchase: what the person has now and until when. It opens only after the
 * subscription read reports Pro. Its one action returns the person to the place the `from` of the visit
 * names, or opens Hoje when it names none. The visit went through the Stripe checkout page, so that place
 * replaces the finished upgrade entry and Back never returns to it.
 */
export function PurchaseResult({ purchaseConfirmed, status, billing, ...dialog }: Readonly<PurchaseResultProps>) {
  const router = useRouter()
  const [dismissed, setDismissed] = useAccountScopedState(false)
  const result = purchaseConfirmed && !dismissed ? resolvePurchaseResult(status, billing) : null
  if (!result) return null
  return <PurchaseResultDialog {...dialog} result={result} onOpen={(route) => { setDismissed(true); router.replace(route) }} onClose={() => setDismissed(true)} />
}

function PurchaseResultDialog({ result, accountId, from, timeZone, knownOrigin, onOpen, onClose }: Readonly<Pick<PurchaseResultProps, 'accountId' | 'from' | 'timeZone' | 'knownOrigin'> & {
  result: PurchaseResultSentence
  onOpen: (route: string) => void
  onClose: () => void
}>) {
  const t = useTranslations()
  const locale = useLocale()
  const storedFrom = useSyncExternalStore(subscribeToNothing, () => readPurchaseFrom(accountId), () => null)
  const origin = knownOrigin(storedFrom ?? from)
  return (
    <ResultDialog
      title={t('result.title')}
      sentence={formatPurchaseResult(result, locale, timeZone, t)}
      primaryLabel={t(origin ? 'common.back' : 'result.account.openToday')}
      onPrimary={() => {
        rememberPurchaseFrom(null, null)
        onOpen(origin ?? '/')
      }}
      onClose={onClose}
    />
  )
}

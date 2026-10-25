import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'
import { Platform } from 'react-native'
import { useAccountId } from '@/lib/account-scope'
import { selectStoreOffer, useStoreBillingConnection } from './use-play-billing'

type PurchasedListener = () => Promise<void> | void
const StoreBillingContext = createContext<(ReturnType<typeof useStoreBillingConnection> & {
  subscribe: (listener: PurchasedListener) => () => void
}) | null>(null)

function ConnectedStoreBilling({ children }: Readonly<{ children: ReactNode }>) {
  const listeners = useRef(new Set<PurchasedListener>())
  const billing = useStoreBillingConnection({ onPurchased: async () => {
    await Promise.all([...listeners.current].map(async (listener) => listener()))
  } })
  const subscribe = (listener: PurchasedListener) => {
    listeners.current.add(listener)
    return () => { listeners.current.delete(listener) }
  }
  return <StoreBillingContext.Provider value={{ ...billing, subscribe }}>{children}</StoreBillingContext.Provider>
}

export function StoreBillingProvider({ children }: Readonly<{ children: ReactNode }>) {
  const accountId = useAccountId()
  if (accountId === null) return children
  return <ConnectedStoreBilling key={accountId}>{children}</ConnectedStoreBilling>
}

export function useStoreBilling(options?: { preferReferralOffer?: boolean; onPurchased?: PurchasedListener }) {
  const billing = useContext(StoreBillingContext)
  const onPurchased = options?.onPurchased
  const subscribe = billing?.subscribe
  useEffect(() => {
    if (onPurchased && subscribe) return subscribe(onPurchased)
  }, [onPurchased, subscribe])
  if (!billing) throw new Error('Store billing provider missing')
  const preferReferral = Platform.OS !== 'ios' && (options?.preferReferralOffer ?? false)
  return { ...billing,
    monthlyOffer: selectStoreOffer(billing.offers, 'monthly', preferReferral),
    yearlyOffer: selectStoreOffer(billing.offers, 'yearly', preferReferral),
    purchase: (interval: 'monthly' | 'yearly') => billing.purchase(interval, preferReferral),
  }
}

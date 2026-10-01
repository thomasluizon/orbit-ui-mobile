import { useEffect } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { buildAccountScopedStorageKey, ONBOARDING_PRO_PENDING_KEY } from '@orbit/shared/utils'
import { useAccountId } from '@/lib/account-scope'
import { captureError } from '@/lib/sentry'

const usePendingAccounts = create<{ accounts: Record<string, boolean> }>(() => ({ accounts: {} }))

export async function setOnboardingProPending(accountId: string, pending: boolean) {
  const key = buildAccountScopedStorageKey(ONBOARDING_PRO_PENDING_KEY, accountId)
  if (pending) await AsyncStorage.setItem(key, '1')
  else await AsyncStorage.removeItem(key)
  usePendingAccounts.setState((state) => ({ accounts: { ...state.accounts, [accountId]: pending } }))
}

export function useOnboardingProPending() {
  const accountId = useAccountId()
  const pending = usePendingAccounts((state) => accountId === null ? false : state.accounts[accountId])
  useEffect(() => {
    if (accountId === null || pending !== undefined) return
    let cancelled = false
    void AsyncStorage.getItem(buildAccountScopedStorageKey(ONBOARDING_PRO_PENDING_KEY, accountId)).then((value) => {
      if (cancelled) return
      usePendingAccounts.setState((state) => ({ accounts: { ...state.accounts, [accountId]: state.accounts[accountId] ?? value === '1' } }))
    }).catch((error: unknown) => {
      captureError(error)
      if (!cancelled) usePendingAccounts.setState((state) => ({ accounts: { ...state.accounts, [accountId]: state.accounts[accountId] ?? false } }))
    })
    return () => { cancelled = true }
  }, [accountId, pending])
  return pending
}

'use client'

import { useSyncExternalStore } from 'react'
import { buildAccountScopedStorageKey, ONBOARDING_PRO_PENDING_KEY } from '@orbit/shared/utils'
import { useHeldAccountId } from '@/stores/auth-store'

const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  globalThis.addEventListener('storage', listener)
  return () => { listeners.delete(listener); globalThis.removeEventListener('storage', listener) }
}

export function setOnboardingProPending(accountId: string, pending: boolean) {
  const key = buildAccountScopedStorageKey(ONBOARDING_PRO_PENDING_KEY, accountId)
  if (pending) localStorage.setItem(key, '1')
  else localStorage.removeItem(key)
  listeners.forEach((listener) => listener())
}

export function useOnboardingProPending() {
  const accountId = useHeldAccountId()
  return useSyncExternalStore(subscribe, () => accountId !== null && localStorage.getItem(buildAccountScopedStorageKey(ONBOARDING_PRO_PENDING_KEY, accountId)) === '1', () => false)
}

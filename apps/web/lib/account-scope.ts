import { useSyncExternalStore } from 'react'

let accountId: string | null = null
const listeners = new Set<() => void>()

export function setAccountId(nextAccountId: string | null): void {
  if (accountId === nextAccountId) return
  accountId = nextAccountId
  for (const listener of listeners) listener()
}

export function getAccountId(): string | null {
  return accountId
}

export function useAccountId(): string | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getAccountId,
    () => null,
  )
}

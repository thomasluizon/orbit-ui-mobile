import { useSyncExternalStore } from 'react'
import { createAccountScope } from '@orbit/shared/stores'
import { configCache } from './config-cache'

const accountScope = createAccountScope()

export function setAccountId(accountId: string | null): void {
  configCache.setAccount(accountId)
  accountScope.set(accountId)
}
export const getAccountId = accountScope.get

export function useAccountId(): string | null {
  return useSyncExternalStore(accountScope.subscribe, accountScope.get, () => null)
}

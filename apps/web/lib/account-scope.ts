import { useSyncExternalStore } from 'react'
import { createAccountScope } from '@orbit/shared/stores'

const accountScope = createAccountScope()

export const setAccountId = accountScope.set
export const getAccountId = accountScope.get

export function useAccountId(): string | null {
  return useSyncExternalStore(accountScope.subscribe, accountScope.get, () => null)
}

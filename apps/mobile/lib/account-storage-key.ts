import { getAccountId } from './account-scope'

export function accountStorageKey(baseKey: string): string {
  return `${baseKey}:${getAccountId() ?? 'signed-out'}`
}

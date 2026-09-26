/**
 * Names a persisted entry after the account that owns it. Both platforms keep a store that
 * outlives an account: web `localStorage` survives somebody else signing in to the same tab,
 * and `AsyncStorage` survives it on the device, so neither is emptied by the account reset
 * that clears the query cache.
 */
export function buildAccountScopedStorageKey(baseKey: string, accountId: string): string {
  return `${baseKey}:${accountId}`
}

export interface AccountScopedFlagState {
  /** The flag already stands for this account, so the once-per-account action must not run again. */
  seen: boolean
  /** A key written before this fix holds the flag: rewrite it under this account and drop the old one. */
  adoptsLegacy: boolean
}

/** Attribute an unscoped legacy flag to the signed-in account before consuming it. */
export function readAccountScopedFlag(
  scopedValue: string | null,
  legacyValue: string | null,
): AccountScopedFlagState {
  if (scopedValue !== null) return { seen: true, adoptsLegacy: false }
  if (legacyValue !== null) return { seen: true, adoptsLegacy: true }
  return { seen: false, adoptsLegacy: false }
}

/**
 * Names a persisted entry after the account that owns it.
 *
 * Both platforms keep a store that outlives an account: web `localStorage` survives somebody else
 * signing in to the same tab, and `AsyncStorage` survives it on the device, so neither is emptied
 * by the account reset that clears the query cache. A key with no account in it is therefore read
 * by the next account as its own, which is how one person's dismissed notice silences the next
 * person's.
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

/**
 * Reads a once-per-account flag across the rename, so the fix costs nobody a notice they already
 * dismissed. The legacy key names no account, and the account signed in now is the only one this
 * device can attribute it to, so that account inherits it and the key is then consumed. Every later
 * account reads an absent flag and gets the notice it is owed.
 *
 * The caller passes both reads and performs the writes, because one platform's storage is
 * synchronous and the other's is not, and only the decision between them has to match.
 */
export function readAccountScopedFlag(
  scopedValue: string | null,
  legacyValue: string | null,
): AccountScopedFlagState {
  if (scopedValue !== null) return { seen: true, adoptsLegacy: false }
  if (legacyValue !== null) return { seen: true, adoptsLegacy: true }
  return { seen: false, adoptsLegacy: false }
}

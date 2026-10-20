import { createSessionCounter } from '@orbit/shared/utils/session-scope'

const sessionCounter = createSessionCounter()
const accountCounter = createSessionCounter()

/**
 * The one session identity both platforms share. Web counts sessions in a bare number and mobile
 * pairs an epoch with a credential version, so account-scoped work reads this instead of either
 * store's own shape.
 */
export function getSessionEpoch(): number {
  return sessionCounter.read()
}

/**
 * Moves the device on to the next session. It rises on EVERY credential change, a teardown
 * included, so a mutation callback the previous session started writes nothing into the next
 * session's cache.
 */
export function advanceSessionEpoch(): void {
  sessionCounter.advance()
}

/**
 * Counts the accounts this device has held. It rises only where the previous account's typing is
 * forgotten, which is a sign out and a login. A rejected refresh that keeps the session alive
 * leaves it where it is, so a transient network failure cannot throw away a pasted image and a
 * half-written message.
 */
export function getAccountGeneration(): number {
  return accountCounter.read()
}

/** Moves the device on to the next account and tells every listener. */
export function advanceAccountGeneration(): void {
  accountCounter.advance()
}

/**
 * Registers a listener for the next account and returns its removal, matching the
 * `useSyncExternalStore` subscribe contract. A store reset reaches only what a store holds, and the
 * root layout never unmounts, so account-scoped state kept in a React hook subscribes here instead
 * of waiting for a reset that cannot reach it.
 */
export function subscribeToAccountGeneration(onAccountChange: () => void): () => void {
  return accountCounter.subscribe(onAccountChange)
}

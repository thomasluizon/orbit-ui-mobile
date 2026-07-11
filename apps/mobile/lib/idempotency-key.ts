let pendingIdempotencyKey: string | null = null

/**
 * Sets the idempotency key the next `apiClient` call will attach. The offline-mutation layer sets this
 * immediately before invoking a mutation's `execute`, so a queued mutation's first online attempt and
 * every later replay carry the same key and the server dedupes them. The key must be minted per logical
 * mutation and stay stable across retries. See https://github.com/thomasluizon/orbit-ui-mobile/issues/243.
 */
export function setPendingIdempotencyKey(key: string | null): void {
  pendingIdempotencyKey = key
}

/**
 * Returns and clears the pending idempotency key. `apiClient` reads this synchronously at entry — before
 * any `await` — so the key set right before an `execute()` is consumed by that execute's first request
 * without racing concurrently-issued mutations, provided the execute calls `apiClient` synchronously.
 */
export function consumePendingIdempotencyKey(): string | null {
  const key = pendingIdempotencyKey
  pendingIdempotencyKey = null
  return key
}

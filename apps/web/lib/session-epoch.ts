let sessionEpoch = 0
const sessionEpochListeners = new Set<() => void>()

/**
 * The one session identity both platforms share. Web counts sessions in a bare number and mobile
 * pairs an epoch with a credential version, so account-scoped work reads this instead of either
 * store's own shape.
 */
export function getSessionEpoch(): number {
  return sessionEpoch
}

/**
 * Moves the tab on to the next session and tells every listener. A store reset reaches only what a
 * store holds, and the app shell never unmounts, so account-scoped state kept in a React hook
 * subscribes here instead of waiting for a reset that cannot reach it.
 */
export function advanceSessionEpoch(): void {
  sessionEpoch += 1
  for (const onSessionEpochChange of [...sessionEpochListeners]) onSessionEpochChange()
}

/**
 * Registers a listener for the next session and returns its removal, matching the
 * `useSyncExternalStore` subscribe contract.
 */
export function subscribeToSessionEpoch(onSessionEpochChange: () => void): () => void {
  sessionEpochListeners.add(onSessionEpochChange)
  return () => {
    sessionEpochListeners.delete(onSessionEpochChange)
  }
}

/**
 * A mutation callback outlives the account that started it. TanStack Query runs `onError` and
 * `onSettled` from the options snapshot the mutation captured, and `queryClient.clear()` empties the
 * caches without cancelling a retryer or suppressing a callback. So a request account A started can
 * still reject after A signs out and B signs in, and its callback would then write A's snapshot into
 * B's cache. Every such write proves first that it still belongs to the session that started it.
 *
 * Each platform counts sessions in its own shape, so the runner reads the current epoch through the
 * reader it is built with rather than importing a store.
 */
export function createSessionScopedRunner(
  readCurrentSessionEpoch: () => number,
): <TResult>(sessionEpoch: number, operation: () => TResult) => TResult | undefined {
  return function runForSession<TResult>(
    sessionEpoch: number,
    operation: () => TResult,
  ): TResult | undefined {
    if (sessionEpoch !== readCurrentSessionEpoch()) return undefined
    return operation()
  }
}

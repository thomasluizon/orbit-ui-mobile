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

export interface SessionCounter {
  read: () => number
  advance: () => void
  subscribe: (onChange: () => void) => () => void
}

/**
 * A counted identity both platforms keep one copy of per runtime, with listeners for the React
 * state no store can reach. Two of them run side by side: the session epoch, which moves on every
 * credential change so a callback the previous session started writes nothing, and the account
 * generation, which moves only when the person at the keyboard can differ so a session that drops
 * and recovers keeps what they were typing.
 */
export function createSessionCounter(): SessionCounter {
  let count = 0
  const listeners = new Set<() => void>()

  return {
    read: () => count,
    advance: () => {
      count += 1
      for (const onChange of [...listeners]) onChange()
    },
    subscribe: (onChange: () => void) => {
      listeners.add(onChange)
      return () => {
        listeners.delete(onChange)
      }
    },
  }
}

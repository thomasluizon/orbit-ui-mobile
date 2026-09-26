export interface AccountScope {
  get: () => string | null
  set: (nextAccountId: string | null) => void
  subscribe: (listener: () => void) => () => void
}

export function createAccountScope(): AccountScope {
  let accountId: string | null = null
  const listeners = new Set<() => void>()
  return {
    get: () => accountId,
    set: (nextAccountId) => {
      if (accountId === nextAccountId) return
      accountId = nextAccountId
      for (const listener of listeners) listener()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

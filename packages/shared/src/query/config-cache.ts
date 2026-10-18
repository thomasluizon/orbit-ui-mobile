import { z } from 'zod'
import { appConfigSchema, DEFAULT_CONFIG, type AppConfig } from '../types/config'

interface ConfigStorage {
  read: () => Promise<string | null>
  write: (value: string) => Promise<void>
  clear: () => Promise<void>
}

export interface ConfigSnapshot {
  accountId: string | null
  generation: number
  config: AppConfig | undefined
}

export interface ConfigCache {
  getSnapshot: () => ConfigSnapshot
  getServerSnapshot: () => ConfigSnapshot
  subscribe: (listener: () => void) => () => void
  setAccount: (accountId: string | null) => void
  fetch: (scope: ConfigSnapshot, request: () => Promise<unknown>, signal?: AbortSignal) => Promise<AppConfig>
}

const storedConfigSchema = z.object({ accountId: z.string(), config: appConfigSchema })
const initialSnapshot: ConfigSnapshot = { accountId: null, generation: 0, config: undefined }

export function createConfigCache(reportError: (error: unknown) => void, storage?: ConfigStorage): ConfigCache {
  let snapshot = initialSnapshot
  let requestSequence = 0
  let storageQueue = Promise.resolve()
  const listeners = new Set<() => void>()
  const publish = (next: ConfigSnapshot) => {
    snapshot = next
    for (const listener of listeners) listener()
  }
  const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = storageQueue.then(operation)
    storageQueue = result.then(() => {}, reportError)
    return result
  }
  const isCurrent = (scope: ConfigSnapshot) => scope.accountId === snapshot.accountId
    && scope.generation === snapshot.generation

  async function restore(scope: ConfigSnapshot): Promise<void> {
    if (!storage || snapshot.config) return
    try {
      const raw = await enqueue(storage.read)
      if (!raw || !isCurrent(scope)) return
      const stored = storedConfigSchema.parse(JSON.parse(raw))
      if (stored.accountId === scope.accountId) publish({ ...snapshot, config: stored.config })
      else await enqueue(storage.clear)
    } catch (error) {
      reportError(error)
      if (isCurrent(scope)) await enqueue(storage.clear).catch(() => {})
    }
  }

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => initialSnapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    setAccount: (accountId: string | null) => {
      if (snapshot.accountId === accountId) {
        if (storage && accountId === null) void enqueue(storage.clear).catch(() => {})
        return
      }
      const previousAccountId = snapshot.accountId
      publish({ accountId, generation: snapshot.generation + 1, config: undefined })
      if (storage && previousAccountId !== null) void enqueue(storage.clear).catch(() => {})
    },
    fetch: async (scope: ConfigSnapshot, request: () => Promise<unknown>, signal?: AbortSignal): Promise<AppConfig> => {
      if (!scope.accountId || !isCurrent(scope) || signal?.aborted) return DEFAULT_CONFIG
      const sequence = ++requestSequence
      const canCommit = () => isCurrent(scope) && sequence === requestSequence && !signal?.aborted
      await restore(scope)
      if (!canCommit()) return DEFAULT_CONFIG
      try {
        const config = appConfigSchema.parse(await request())
        if (!canCommit()) return DEFAULT_CONFIG
        publish({ ...snapshot, config })
        if (storage) {
          void enqueue(async () => {
            if (canCommit()) await storage.write(JSON.stringify({ accountId: scope.accountId, config }))
          }).catch(() => {})
        }
        return config
      } catch (error) {
        reportError(error)
        throw error
      }
    },
  }
}

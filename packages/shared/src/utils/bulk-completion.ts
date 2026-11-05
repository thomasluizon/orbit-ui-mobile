import type { ParentPromptContinuation } from '../types/sync'
import { extractBackendStatus } from './error-utils'
import { isNetworkUnavailableError } from './network-error'

export interface BulkRetryChunk<T> {
  items: T[]
  idempotencyKey: string
}

export type BulkCompletionInput<T> = T[] | {
  items: T[]
  retryChunks?: BulkRetryChunk<T>[]
  parentPromptContinuation?: ParentPromptContinuation
}

export function normalizeBulkCompletionInput<T>(input: BulkCompletionInput<T>): {
  items: T[]
  retryChunks?: BulkRetryChunk<T>[]
  parentPromptContinuation?: ParentPromptContinuation
} {
  return Array.isArray(input) ? { items: input } : input
}

export function buildBulkCompletionChunks<T extends { habitId: string; date?: string }>(
  input: BulkCompletionInput<T>,
  createIdempotencyKey: () => string,
): (BulkRetryChunk<T> & { indices: number[] })[] {
  const { items, retryChunks = [] } = normalizeBulkCompletionInput(input)
  const retainedIds = new Set(retryChunks.flatMap(chunk => chunk.items.map(bulkItemIdentity)))
  const remaining = items.filter(item => !retainedIds.has(bulkItemIdentity(item)))
  const chunks = [...retryChunks]
  for (let index = 0; index < remaining.length; index += 100) {
    chunks.push({ items: remaining.slice(index, index + 100), idempotencyKey: createIdempotencyKey() })
  }
  return chunks.map(chunk => ({
    ...chunk,
    indices: chunk.items.map(item => items.findIndex(request => bulkItemIdentity(request) === bulkItemIdentity(item))),
  }))
}

interface BulkCompletionItem {
  habitId: string
  date?: string
}

function bulkItemIdentity(item: BulkCompletionItem): string {
  return JSON.stringify([item.habitId, item.date])
}

class BulkCompletionReplay {
  private readonly chunksByItem = new Map<string, BulkRetryChunk<BulkCompletionItem>>()

  prepare(input: BulkCompletionInput<BulkCompletionItem>, createIdempotencyKey: () => string): (BulkRetryChunk<BulkCompletionItem> & { indices: number[] })[] {
    const { items, retryChunks = [] } = normalizeBulkCompletionInput(input)
    const retained = new Set<BulkRetryChunk<BulkCompletionItem>>()
    for (const item of items) {
      const chunk = this.chunksByItem.get(bulkItemIdentity(item))
      if (chunk) retained.add(chunk)
    }
    for (const chunk of retryChunks) {
      if (!chunk.items.some(item => this.chunksByItem.has(bulkItemIdentity(item)))) retained.add(chunk)
    }
    return buildBulkCompletionChunks({ items, retryChunks: [...retained] }, createIdempotencyKey)
  }

  markAttempted(chunk: BulkRetryChunk<BulkCompletionItem>): void {
    for (const item of chunk.items) this.chunksByItem.set(bulkItemIdentity(item), chunk)
  }

  resolve(idempotencyKey: string): void {
    for (const [identity, chunk] of this.chunksByItem) {
      if (chunk.idempotencyKey === idempotencyKey) this.chunksByItem.delete(identity)
    }
  }
}

const replayOwners = new WeakMap<object, { generation: number; log: BulkCompletionReplay; skip: BulkCompletionReplay }>()

export function getBulkCompletionReplay(owner: object, generation: number, mode: 'log' | 'skip'): BulkCompletionReplay {
  let scope = replayOwners.get(owner)
  if (!scope || scope.generation !== generation) {
    scope = { generation, log: new BulkCompletionReplay(), skip: new BulkCompletionReplay() }
    replayOwners.set(owner, scope)
  }
  return scope[mode]
}

export function isBulkGatewayFailure(error: unknown): boolean {
  return [502, 503, 504].includes(extractBackendStatus(error) ?? 0) ||
    error instanceof TypeError || isNetworkUnavailableError(error) ||
    (error instanceof Error && /^(failed to fetch|fetch failed|network request failed|network request timed out|load failed)$/i.test(error.message))
}

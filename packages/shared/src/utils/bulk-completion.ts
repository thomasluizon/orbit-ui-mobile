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

export function buildBulkCompletionChunks<T extends { habitId: string }>(
  input: BulkCompletionInput<T>,
  createIdempotencyKey: () => string,
): (BulkRetryChunk<T> & { indices: number[] })[] {
  const { items, retryChunks = [] } = normalizeBulkCompletionInput(input)
  const retainedIds = new Set(retryChunks.flatMap(chunk => chunk.items.map(item => item.habitId)))
  const remaining = items.filter(item => !retainedIds.has(item.habitId))
  const chunks = [...retryChunks]
  for (let index = 0; index < remaining.length; index += 100) {
    chunks.push({ items: remaining.slice(index, index + 100), idempotencyKey: createIdempotencyKey() })
  }
  return chunks.map(chunk => ({
    ...chunk,
    indices: chunk.items.map(item => items.findIndex(request => request.habitId === item.habitId)),
  }))
}

export function isBulkGatewayFailure(error: unknown): boolean {
  return [502, 503, 504].includes(extractBackendStatus(error) ?? 0) ||
    error instanceof TypeError || isNetworkUnavailableError(error) ||
    (error instanceof Error && /^(failed to fetch|fetch failed|network request failed|network request timed out|load failed)$/i.test(error.message))
}

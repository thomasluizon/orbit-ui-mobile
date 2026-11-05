import { randomUUID } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('keeps bulk keys distinct across app instances sharing a timestamp without Web Crypto', async () => {
  vi.stubGlobal('crypto', undefined)
  vi.spyOn(Date, 'now').mockReturnValue(1000)
  async function startApp() {
    vi.resetModules()
    const { buildBulkCompletionChunks } = await import('../utils/bulk-completion')
    return buildBulkCompletionChunks([{ habitId: 'habit' }], randomUUID)[0]!.idempotencyKey
  }
  expect(await startApp()).not.toBe(await startApp())
})

it('splits fresh selections at the bulk limit and maps retained chunks by habit and date', async () => {
  const { buildBulkCompletionChunks } = await import('../utils/bulk-completion')
  const items = Array.from({ length: 205 }, (_, index) => ({ habitId: `habit-${index}`, date: '2026-09-12' }))
  const chunks = buildBulkCompletionChunks(items, randomUUID)
  expect(chunks.map(chunk => chunk.items.length)).toEqual([100, 100, 5])
  expect(chunks[2]?.indices).toEqual([200, 201, 202, 203, 204])
  const original = chunks[1]!
  const nextDate = { ...items[100]!, date: '2026-09-13' }
  const retry = buildBulkCompletionChunks({
    items: [nextDate, items[101]!, items[100]!], retryChunks: [original],
  }, randomUUID)
  expect(retry[0]?.items).toEqual(original.items)
  expect(retry[0]?.idempotencyKey).toBe(original.idempotencyKey)
  expect(retry[0]?.indices.slice(0, 3)).toEqual([2, 1, -1])
  expect(retry[1]?.items).toEqual([nextDate])
  expect(retry[1]?.indices).toEqual([0])
  expect(retry[1]?.idempotencyKey).not.toBe(original.idempotencyKey)
})

it('preserves the parent continuation when normalizing a bulk request', async () => {
  const { normalizeBulkCompletionInput } = await import('../utils/bulk-completion')
  const input = { items: [{ habitId: 'parent' }], parentPromptContinuation: [{ habitId: 'root', date: '2026-09-12', mode: 'log' as const }] }
  expect(normalizeBulkCompletionInput(input)).toBe(input)
  expect(normalizeBulkCompletionInput(input.items)).toEqual({ items: input.items })
})

it('owns unresolved replay across callers, selection changes and unrelated requests until resolution', async () => {
  const { getBulkCompletionReplay } = await import('../utils/bulk-completion')
  const owner = {}
  const original = [{ habitId: 'first', date: '2026-09-12' }, { habitId: 'second', date: '2026-09-12' }]
  const log = getBulkCompletionReplay(owner, 1, 'log')
  const chunk = log.prepare(original, randomUUID)[0]!
  log.markAttempted(chunk)
  const nextDate = { ...original[0]!, date: '2026-09-13' }
  const unrelated = log.prepare([nextDate], randomUUID)[0]!
  log.markAttempted(unrelated)
  const recovery = getBulkCompletionReplay(owner, 1, 'log').prepare([original[1]!], randomUUID)
  expect(recovery).toEqual([{ ...chunk, indices: [-1, 0] }])
  expect(getBulkCompletionReplay(owner, 1, 'log').prepare([], randomUUID)).toEqual([])
  log.resolve(unrelated.idempotencyKey)
  expect(log.prepare(original.slice().reverse(), randomUUID)[0]).toEqual({ ...chunk, indices: [1, 0] })
  expect(getBulkCompletionReplay(owner, 1, 'skip').prepare(original, randomUUID)[0]?.idempotencyKey).not.toBe(chunk.idempotencyKey)
  expect(getBulkCompletionReplay({}, 1, 'log').prepare(original, randomUUID)[0]?.idempotencyKey).not.toBe(chunk.idempotencyKey)
  log.resolve(chunk.idempotencyKey)
  expect(log.prepare({ items: original, retryChunks: [chunk] }, randomUUID)[0]?.idempotencyKey).toBe(chunk.idempotencyKey)
  expect(log.prepare({ items: original, retryChunks: [chunk] }, randomUUID)).toHaveLength(1)
  log.resolve(chunk.idempotencyKey)
  expect(log.prepare(original, randomUUID)[0]?.idempotencyKey).not.toBe(chunk.idempotencyKey)
  const nextAccount = getBulkCompletionReplay(owner, 2, 'log').prepare(original, randomUUID)[0]!
  expect(nextAccount.idempotencyKey).not.toBe(chunk.idempotencyKey)
})

it.each(['log', 'skip'] as const)('does not retain unattempted %s suffixes after a definitive first-chunk rejection', async mode => {
  const { getBulkCompletionReplay } = await import('../utils/bulk-completion')
  const replay = getBulkCompletionReplay({}, 1, mode)
  const items = Array.from({ length: 205 }, (_, index) => ({ habitId: `habit-${index}`, date: '2026-09-12' }))
  const chunks = replay.prepare(items, randomUUID)
  replay.markAttempted(chunks[0]!)
  replay.resolve(chunks[0]!.idempotencyKey)

  const selection = [items[100]!]
  const next = replay.prepare(selection, randomUUID)
  expect(next).toHaveLength(1)
  expect(next[0]?.items).toHaveLength(1)
  expect(next[0]?.items).toEqual(selection)
  expect(next[0]?.idempotencyKey).not.toBe(chunks[1]!.idempotencyKey)
})

it.each([502, 503, 504])('recognizes gateway %i as recoverable', async status => {
  const { createApiClientError } = await import('../utils/error-utils')
  const { isBulkGatewayFailure } = await import('../utils/bulk-completion')
  expect(isBulkGatewayFailure(createApiClientError(status, null, 'Unavailable'))).toBe(true)
})

it('distinguishes network failures from definitive rejections', async () => {
  const { createApiClientError } = await import('../utils/error-utils')
  const { isBulkGatewayFailure } = await import('../utils/bulk-completion')
  for (const error of [new TypeError('Failed to fetch'), new Error('Network request failed'), new Error('fetch failed')]) {
    expect(isBulkGatewayFailure(error)).toBe(true)
  }
  for (const error of [createApiClientError(400, null, 'Rejected'), new Error('Rejected'), null]) {
    expect(isBulkGatewayFailure(error)).toBe(false)
  }
})

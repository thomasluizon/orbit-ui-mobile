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

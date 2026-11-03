import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { captureException } from '@sentry/nextjs'
import { configKeys } from '@orbit/shared/query'
import { createApiClientError } from '@orbit/shared/utils'
import { createQueryClient } from '@/lib/query-client'
import { configCache } from '@/lib/config-cache'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))
const client = createQueryClient()
beforeEach(() => { vi.mocked(captureException).mockClear(); configCache.setAccount('network-account') })
afterEach(() => { client.clear(); configCache.setAccount(null) })

it.each([
  { error: new TypeError('Failed to fetch'), reports: false },
  { error: new TypeError('Load failed'), reports: false },
  { error: new TypeError('Network request failed'), reports: false },
  { error: createApiClientError(500, null, 'Internal server error'), reports: true },
  { error: new TypeError('Cannot read properties of undefined'), reports: true },
])('reports config failures only when actionable: $error.message', async ({ error, reports }) => {
  const scope = configCache.getSnapshot()
  await expect(client.fetchQuery({
    queryKey: configKeys.detail(scope.accountId, scope.generation), retry: false,
    queryFn: () => configCache.fetch(scope, () => Promise.reject(error)),
  })).rejects.toBe(error)
  expect(captureException).toHaveBeenCalledTimes(reports ? 1 : 0)
  if (reports) expect(captureException).toHaveBeenCalledWith(error)
})

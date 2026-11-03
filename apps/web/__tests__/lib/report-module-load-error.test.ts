import { beforeEach, expect, it, vi } from 'vitest'
import { captureException } from '@sentry/nextjs'
import { reloadStaleBuildOnce } from '@/lib/stale-build-recovery'
import { reportModuleLoadError } from '@/lib/report-module-load-error'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))
vi.mock('@/lib/stale-build-recovery', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/stale-build-recovery')>(),
  reloadStaleBuildOnce: vi.fn(),
}))

beforeEach(() => vi.clearAllMocks())

it.each([true, false])('reports handled module failures and recovers a missing build: %s', missing => {
  const error = new Error('Loading module failed')
  if (missing) error.name = 'ChunkLoadError'
  reportModuleLoadError(error)
  expect(captureException).toHaveBeenCalledExactlyOnceWith(error)
  expect(reloadStaleBuildOnce).toHaveBeenCalledTimes(missing ? 1 : 0)
})

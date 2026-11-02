import { afterEach, expect, it, vi } from 'vitest'
import { QueryClient, onlineManager } from '@tanstack/query-core'
import { withAccountGuard, resolveHabitLogDate } from '@/hooks/use-habit-mutation-shared'
import { setAccountId } from '@/lib/account-scope'
import { captureError } from '@/lib/sentry'
import { fetchProfile } from '@/hooks/use-profile'

vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }))
vi.mock('@/hooks/use-profile', () => ({ fetchProfile: vi.fn() }))

afterEach(() => {
  setAccountId(null)
  vi.clearAllMocks()
})

it('rejects a guarded mutation when the account changes while it awaits a response', async () => {
  setAccountId('first')
  let finish: (value: string) => void = () => {}
  const result = withAccountGuard(() => new Promise<string>((resolve) => { finish = resolve }))
  setAccountId('second')
  finish('response')
  await expect(result).rejects.toThrow('Account changed')
})

it('returns the result while the captured account remains current', async () => {
  setAccountId('first')
  expect(withAccountGuard(() => 'response')).toBe('response')
  await expect(withAccountGuard(() => Promise.resolve('response'))).resolves.toBe('response')
})

it('reports a profile failure once and leaves the day undefined', async () => {
  onlineManager.setOnline(true)
  const error = new TypeError('Network request failed')
  vi.mocked(fetchProfile).mockRejectedValueOnce(error)
  const client = new QueryClient()
  try {
    const date = await withAccountGuard((account) => resolveHabitLogDate(client, new Date(), account))
    expect(date).toBeUndefined()
    expect(captureError).toHaveBeenCalledExactlyOnceWith(error)
  } finally {
    client.clear()
  }
})

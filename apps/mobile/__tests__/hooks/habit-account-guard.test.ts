import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { QueryClient, onlineManager } from '@tanstack/query-core'
import { QueryClientProvider } from '@tanstack/react-query'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { habitKeys } from '@orbit/shared/query'
import { withAccountGuard, resolveHabitLogDate } from '@/hooks/use-habit-mutation-shared'
import { useHabitMutation } from '@/hooks/use-habit-mutation'
import { setAccountId } from '@/lib/account-scope'
import { advanceAccountGeneration } from '@/lib/session-epoch'
import { captureError } from '@/lib/sentry'
import { fetchProfile } from '@/hooks/use-profile'

vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }))
vi.mock('@/hooks/use-profile', () => ({ fetchProfile: vi.fn() }))

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')

afterEach(() => {
  setAccountId(null)
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

it.each(['success', 'failure'] as const)('preserves a server %s without writing or restoring the replacement account cache', async (outcome) => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  setAccountId('first')
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  const key = habitKeys.list({})
  const original = [createMockHabit({ id: 'original' })]
  client.setQueryData(key, original)
  let finish!: () => void
  const error = new Error('Server rejected write')
  const request = new Promise<string>((resolve, reject) => {
    finish = () => outcome === 'success' ? resolve('response') : reject(error)
  })
  const onSuccess = vi.fn(() => { client.setQueryData(key, original) })
  const onError = vi.fn(() => { client.setQueryData(key, original) })
  const onSettled = vi.fn(() => { void client.invalidateQueries() })
  let write!: ReturnType<typeof useHabitMutation<string>>
  function Probe() {
    write = useHabitMutation<string>({ mutationFn: () => request, onSuccess, onError, onSettled })
    return null
  }
  let renderer: ReturnType<typeof TestRenderer.create> | undefined
  let pending: Promise<unknown> | undefined
  try {
    await TestRenderer.act(() => {
      renderer = TestRenderer.create(React.createElement(QueryClientProvider, { client }, React.createElement(Probe)))
    })
    await TestRenderer.act(() => {
      pending = write.mutateAsync().then(value => ({ value }), error => ({ error }))
    })
    advanceAccountGeneration()
    setAccountId('second')
    client.clear()
    const replacement = [createMockHabit({ id: 'replacement' })]
    client.setQueryData(key, replacement)
    const before = client.getQueryState(key)
    await TestRenderer.act(async () => {
      finish()
      expect(await pending).toEqual(outcome === 'success' ? { value: 'response' } : { error })
    })
    expect(client.getQueryData(key)).toEqual(replacement)
    expect(client.getQueryState(key)).toEqual(before)
    expect(onSuccess).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
    expect(onSettled).not.toHaveBeenCalled()
  } finally {
    await TestRenderer.act(async () => { finish(); await pending; renderer?.unmount() })
    client.clear()
  }
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

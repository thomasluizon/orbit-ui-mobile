import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, expect, it, vi } from 'vitest'
import { habitKeys } from '@orbit/shared/query'
import { apiClient } from '@/lib/api-client'
import { useCorrectHabitDose } from '@/hooks/use-correct-habit-dose'
const TestRenderer = require('react-test-renderer')
vi.mock('@/lib/api-client', () => ({ apiClient: vi.fn() }))
beforeEach(() => vi.mocked(apiClient).mockReset())
it('corrects one dose and refreshes authoritative habit reads', async () => {
  vi.mocked(apiClient).mockResolvedValue(undefined)
  const client = new QueryClient()
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  let mutation: ReturnType<typeof useCorrectHabitDose>
  function Harness() { mutation = useCorrectHabitDose('habit'); return null }
  let tree: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(<QueryClientProvider client={client}><Harness /></QueryClientProvider>) })
  const input = { logId: 'log', takenAtUtc: '2026-10-29T02:00:30.125Z' }
  await TestRenderer.act(async () => { await mutation.mutateAsync(input) })
  expect(apiClient).toHaveBeenCalledExactlyOnceWith('/api/habits/habit/logs/log/dose', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ takenAtUtc: input.takenAtUtc }), isCurrent: expect.any(Function) }))
  expect(invalidate).toHaveBeenCalledWith({ queryKey: habitKeys.all })
  TestRenderer.act(() => tree.unmount())
  client.clear()
})

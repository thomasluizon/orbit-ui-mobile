import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { API } from '@orbit/shared/api'
import { dateInterpretationSchema } from '@orbit/shared/types/habit'
import { profileKeys, subscriptionKeys } from '@orbit/shared/query'
import { useDateInterpretation } from '@/hooks/use-date-interpretation'
import { advanceAccountGeneration } from '@/lib/session-epoch'

const TestRenderer = require('react-test-renderer')
const request = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api-client', () => ({ apiClient: request }))
const reply = { date: '2026-10-26', referenceDate: '2026-10-20' }

async function mount() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  let mutation!: ReturnType<typeof useDateInterpretation>
  function Harness() { mutation = useDateInterpretation(); return null }
  let tree!: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(() => { tree = TestRenderer.create(<QueryClientProvider client={client}><Harness /></QueryClientProvider>) })
  return { getMutation: () => mutation, invalidate, tree }
}

beforeEach(() => { request.mockReset() })
describe('direct metered date transport', () => {
  it.each([false, true])('refreshes allowance on terminal success and failure %s with no retry', async (failure) => {
    if (failure) request.mockRejectedValue(new Error('provider failed'))
    else request.mockResolvedValue(reply)
    const harness = await mount()
    const input = { phrase: 'after vacation', language: 'en' }
    await TestRenderer.act(async () => {
      const attempt = harness.getMutation().mutateAsync(input)
      if (failure) await expect(attempt).rejects.toThrow('provider failed')
      else expect(await attempt).toEqual(reply)
    })
    expect(request).toHaveBeenCalledExactlyOnceWith(API.habits.interpretDate, expect.objectContaining({ method: 'POST', body: JSON.stringify(input), isCurrent: expect.any(Function) }), dateInterpretationSchema)
    expect(harness.invalidate).toHaveBeenCalledWith({ queryKey: profileKeys.detail() })
    expect(harness.invalidate).toHaveBeenCalledWith({ queryKey: subscriptionKeys.status() })
    await TestRenderer.act(() => harness.tree.unmount())
  })
  it('does not charge a replacement account when it changes before mutation execution', async () => {
    request.mockResolvedValue(reply)
    const harness = await mount()
    await TestRenderer.act(async () => {
      const pending = harness.getMutation().mutateAsync({ phrase: 'after vacation', language: 'en' })
      advanceAccountGeneration()
      await expect(pending).rejects.toThrow('Account changed')
    })
    expect(request).not.toHaveBeenCalled()
    await TestRenderer.act(() => harness.tree.unmount())
  })
  it('invalidates neither allowance cache after an account switch', async () => {
    let finish!: (value: typeof reply) => void
    request.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    const harness = await mount()
    let pending!: Promise<unknown>
    await TestRenderer.act(async () => { pending = harness.getMutation().mutateAsync({ phrase: 'after vacation', language: 'en' }); await Promise.resolve() })
    const current = request.mock.lastCall![1].isCurrent
    advanceAccountGeneration()
    expect(current()).toBe(false)
    await TestRenderer.act(async () => { finish(reply); await pending })
    expect(harness.invalidate).not.toHaveBeenCalled()
    await TestRenderer.act(() => harness.tree.unmount())
  })
})

import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { API } from '@orbit/shared/api'
import { dateInterpretationSchema } from '@orbit/shared/types/habit'
import { profileKeys, subscriptionKeys } from '@orbit/shared/query'
import { getFriendlyErrorKey } from '@orbit/shared/utils'
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
  return { getMutation: () => mutation, invalidate, tree, client }
}

function observeExecution(client: QueryClient) {
  return new Promise<{ status: string; isPaused: boolean }>((resolve) => {
    const unsubscribe = client.getMutationCache().subscribe((event) => {
      if (event.type !== 'updated' || !['pause', 'error', 'success'].includes(event.action.type)) return
      unsubscribe()
      resolve({ status: event.mutation.state.status, isPaused: event.mutation.state.isPaused })
    })
  })
}

beforeEach(() => { request.mockReset(); onlineManager.setOnline(true) })
afterEach(() => { onlineManager.setOnline(true) })
describe('direct metered date transport', () => {
  it.each([true, false])('settles offline without replay and requires a fresh consultation: initially online %s', async (initiallyOnline) => {
    request.mockResolvedValue(reply)
    const harness = await mount()
    try {
      await TestRenderer.act(async () => {
        const execution = observeExecution(harness.client)
        onlineManager.setOnline(initiallyOnline)
        const input = { phrase: 'after vacation', language: 'en' }
        const attempt = harness.getMutation().mutateAsync(input).catch((error: unknown) => error)
        onlineManager.setOnline(false)
        const offline = { ...await execution, transportCalls: request.mock.calls.length }
        onlineManager.setOnline(true)
        await harness.client.resumePausedMutations()
        const outcome = await attempt
        expect({ offline, callsAfterReconnect: request.mock.calls.length }).toEqual({
          offline: { status: 'error', isPaused: false, transportCalls: 0 }, callsAfterReconnect: 0,
        })
        expect(outcome).toBeInstanceOf(TypeError)
        expect(getFriendlyErrorKey(outcome, 'habits.form.aiSuggestError', 'habit')).toBe('habits.form.aiSuggestError')
        expect(harness.invalidate).toHaveBeenCalledWith({ queryKey: profileKeys.detail() })
        expect(harness.invalidate).toHaveBeenCalledWith({ queryKey: subscriptionKeys.status() })
        expect(await harness.getMutation().mutateAsync(input)).toEqual(reply)
        expect(request).toHaveBeenCalledOnce()
      })
    } finally {
      await TestRenderer.act(() => harness.tree.unmount())
      harness.client.clear()
    }
  })
  it('does not send an aborted consultation', async () => {
    const harness = await mount()
    const abort = new AbortController()
    abort.abort()
    try {
      await TestRenderer.act(async () => {
        await expect(harness.getMutation().mutateAsync({ phrase: 'after vacation', language: 'en', signal: abort.signal })).rejects.toThrow('Date consultation cancelled')
      })
      expect(request).not.toHaveBeenCalled()
    } finally {
      await TestRenderer.act(() => harness.tree.unmount())
      harness.client.clear()
    }
  })
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

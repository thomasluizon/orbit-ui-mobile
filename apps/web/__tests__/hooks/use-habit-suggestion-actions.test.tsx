import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { profileKeys, subscriptionKeys } from '@orbit/shared/query'
import { habitSuggestionDraftFixture as draft, makeHabitSuggestionMessage, makeHabitSuggestionPreview } from '@orbit/shared/test-support/chat-fixtures'
import { useHabitSuggestionActions } from '@/hooks/use-habit-suggestion-actions'
import { accountIntentWithOrigin } from '@/lib/client-action'
import { advanceAccountGeneration } from '@/lib/session-epoch'
import { useAuthStore } from '@/stores/auth-store'
import { useChatStore } from '@/stores/chat-store'

const mocks = vi.hoisted(() => ({ refine: vi.fn(), preview: vi.fn() }))
vi.mock('@/app/actions/habit-suggestions', () => ({ refineHabitSuggestion: mocks.refine, previewHabitSuggestions: mocks.preview }))

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return { ...renderHook(() => useHabitSuggestionActions('suggestions', 'pt-BR'), { wrapper }), invalidate }
}

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.getState().setAuth({ userId: 'account-a', name: 'Person', email: 'person@example.com' })
  useChatStore.setState({ messages: [makeHabitSuggestionMessage()] })
  mocks.refine.mockResolvedValue({ ok: true, data: { ...draft, title: 'Read a page' } })
  mocks.preview.mockResolvedValue({ ok: true, data: { response: makeHabitSuggestionPreview() } })
})

describe('web habit suggestion action adapter', () => {
  it('returns the refinement and refreshes allowance for the intended account', async () => {
    const { result, invalidate } = mount()
    expect(await result.current.refine(draft, 'one page')).toEqual({ ...draft, title: 'Read a page' })
    expect(mocks.refine).toHaveBeenCalledExactlyOnceWith(draft, 'one page', 'pt-BR', accountIntentWithOrigin('account-a'))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: subscriptionKeys.status() })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: profileKeys.detail() })
  })

  it.each([false, true])('returns the preview with all=%s and preserves the account intent', async all => {
    const { result } = mount()
    expect(await result.current.preview([draft], all)).toEqual({ response: makeHabitSuggestionPreview() })
    expect(mocks.preview).toHaveBeenCalledExactlyOnceWith([draft], all, 'pt-BR', accountIntentWithOrigin('account-a'))
  })

  it('returns a conflict for the caller to mark the unavailable card', async () => {
    mocks.preview.mockResolvedValueOnce({ ok: true, data: { conflictIndex: 0 } })
    const { result } = mount()
    expect(await result.current.preview([draft], true)).toEqual({ conflictIndex: 0 })
  })

  it.each(['refine', 'preview'] as const)('rejects a failed %s action', async operation => {
    mocks[operation].mockResolvedValueOnce({ ok: false, status: 503, error: 'Unavailable', sessionRefreshFailed: false })
    const { result, invalidate } = mount()
    const request = operation === 'refine' ? result.current.refine(draft, 'one page') : result.current.preview([draft], false)
    await expect(request).rejects.toThrow('Unavailable')
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('does not refresh the next account when an in-flight refinement completes', async () => {
    let finish!: (value: unknown) => void
    mocks.refine.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const { result, invalidate } = mount()
    const request = result.current.refine(draft, 'one page')
    advanceAccountGeneration()
    finish({ ok: true, data: draft })
    expect(await request).toEqual(draft)
    expect(result.current.isCurrent()).toBe(false)
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('recognizes an account identity change', () => {
    const { result } = mount()
    expect(result.current.isCurrent()).toBe(true)
    useAuthStore.getState().setAuth({ userId: 'account-b', name: 'Person', email: 'person@example.com' })
    expect(result.current.isCurrent()).toBe(false)
  })

  it('transitions only the owning message', () => {
    const other = { ...makeHabitSuggestionMessage(), id: 'other' }
    useChatStore.setState({ messages: [makeHabitSuggestionMessage(), other] })
    const { result } = mount()
    result.current.transition(message => ({ ...message, appliedHabitSuggestions: [draft.id] }))
    expect(useChatStore.getState().messages[0]?.appliedHabitSuggestions).toEqual([draft.id])
    expect(useChatStore.getState().messages[1]).toEqual(other)
  })
})

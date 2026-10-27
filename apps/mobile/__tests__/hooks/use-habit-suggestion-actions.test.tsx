import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { API } from '@orbit/shared/api'
import { profileKeys, subscriptionKeys } from '@orbit/shared/query'
import { ApiClientError } from '@orbit/shared/utils'
import { habitSuggestionDraftSchema } from '@orbit/shared/types'
import { habitSuggestionDraftFixture as draft, makeHabitSuggestionMessage, makeHabitSuggestionPreview, makeHabitSuggestionBatchPreview } from '@orbit/shared/test-support/chat-fixtures'
import { useHabitSuggestionActions } from '@/hooks/use-habit-suggestion-actions'
import { advanceAccountGeneration } from '@/lib/session-epoch'
import { useChatStore } from '@/stores/chat-store'

const mocks = vi.hoisted(() => ({ api: vi.fn() }))
vi.mock('@/lib/api-client', () => ({ apiClient: mocks.api }))
let tree: ReactTestRenderer & { unmount: () => void }

async function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  let actions!: ReturnType<typeof useHabitSuggestionActions>
  function Harness() { actions = useHabitSuggestionActions('suggestions', 'pt-BR'); return null }
  await act(() => { tree = create(<QueryClientProvider client={client}><Harness /></QueryClientProvider>) as typeof tree })
  return { actions, invalidate }
}

beforeEach(() => {
  mocks.api.mockReset()
  useChatStore.setState({ messages: [makeHabitSuggestionMessage()] })
})
afterEach(async () => { await act(() => tree.unmount()) })

describe('mobile habit suggestion action adapter', () => {
  it('sends the refinement with boundary validation and refreshes allowance', async () => {
    const refined = { ...draft, title: 'Read a page' }
    mocks.api.mockResolvedValueOnce(refined)
    const { actions, invalidate } = await mount()
    expect(await actions.refine(draft, 'one page')).toEqual(refined)
    expect(mocks.api).toHaveBeenCalledExactlyOnceWith(API.chat.refineHabitSuggestion, {
      method: 'POST', isCurrent: actions.isCurrent,
      body: JSON.stringify({ draft, instruction: 'one page', language: 'pt-BR' }),
    }, habitSuggestionDraftSchema)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: subscriptionKeys.status() })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: profileKeys.detail() })
  })

  it.each([false, true])('returns a validated preview for all=%s', async all => {
    const response = all ? makeHabitSuggestionBatchPreview() : makeHabitSuggestionPreview()
    mocks.api.mockResolvedValueOnce(response)
    const { actions } = await mount()
    expect(await actions.preview([draft], all)).toEqual({ response })
    expect(mocks.api).toHaveBeenCalledExactlyOnceWith(all ? API.chat.previewAllHabitSuggestions : API.chat.previewHabitSuggestion, {
      method: 'POST', isCurrent: actions.isCurrent,
      body: JSON.stringify(all ? { drafts: [draft], language: 'pt-BR' } : { draft, language: 'pt-BR' }),
    })
  })

  it('returns the unavailable draft index for a batch conflict', async () => {
    mocks.api.mockRejectedValueOnce(new ApiClientError(400, 'Unavailable', { data: {
      error: 'Unavailable', errorCode: 'HABIT_SUGGESTION_UNAVAILABLE', draftIndex: 1,
    } }))
    const { actions } = await mount()
    expect(await actions.preview([draft], true)).toEqual({ conflictIndex: 1 })
  })

  it.each([
    { error: 'Unavailable', errorCode: 'OTHER', draftIndex: 0 },
    { error: 'Unavailable', errorCode: 'HABIT_SUGGESTION_UNAVAILABLE', draftIndex: -1 },
    null,
  ])('rejects an unrecognized conflict payload %j', async payload => {
    const failure = new ApiClientError(400, 'Unavailable', { data: payload })
    mocks.api.mockRejectedValueOnce(failure)
    const { actions } = await mount()
    await expect(actions.preview([draft], true)).rejects.toBe(failure)
  })

  it('rejects a malformed preview instead of reporting success', async () => {
    mocks.api.mockResolvedValueOnce({ operation: {} })
    const { actions } = await mount()
    await expect(actions.preview([draft], false)).rejects.toThrow()
  })

  it.each(['refine', 'preview'] as const)('propagates an unexpected %s failure', async operation => {
    const failure = new Error('Offline')
    mocks.api.mockRejectedValueOnce(failure)
    const { actions, invalidate } = await mount()
    const request = operation === 'refine' ? actions.refine(draft, 'one page') : actions.preview([draft], false)
    await expect(request).rejects.toBe(failure)
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('does not refresh the next account after an in-flight refinement', async () => {
    let finish!: (value: unknown) => void
    mocks.api.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const { actions, invalidate } = await mount()
    expect(actions.isCurrent()).toBe(true)
    const request = actions.refine(draft, 'one page')
    advanceAccountGeneration()
    finish(draft)
    expect(await request).toEqual(draft)
    expect(actions.isCurrent()).toBe(false)
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('transitions only the owning message', async () => {
    const other = { ...makeHabitSuggestionMessage(), id: 'other' }
    useChatStore.setState({ messages: [makeHabitSuggestionMessage(), other] })
    const { actions } = await mount()
    actions.transition(message => ({ ...message, appliedHabitSuggestions: [draft.id] }))
    expect(useChatStore.getState().messages[0]?.appliedHabitSuggestions).toEqual([draft.id])
    expect(useChatStore.getState().messages[1]).toEqual(other)
  })
})

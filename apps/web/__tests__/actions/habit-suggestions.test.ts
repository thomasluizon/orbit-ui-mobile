import { beforeEach, describe, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'
import { ApiClientError } from '@orbit/shared/utils'
import { agentExecuteOperationResponseSchema, habitSuggestionDraftSchema } from '@orbit/shared/types'
import { habitSuggestionDraftFixture as draft, makeHabitSuggestionPreview, makeHabitSuggestionBatchPreview } from '@orbit/shared/test-support/chat-fixtures'
import { refineHabitSuggestion, previewHabitSuggestions } from '@/app/actions/habit-suggestions'

const mocks = vi.hoisted(() => ({ mutate: vi.fn() }))
vi.mock('@/lib/server-fetch', () => ({ serverAuthMutate: mocks.mutate }))

beforeEach(() => { mocks.mutate.mockReset() })

describe('habit suggestion server actions', () => {
  it('sends a validated draft, instruction and language for refinement', async () => {
    const refined = { ...draft, title: 'Read a page' }
    mocks.mutate.mockResolvedValueOnce(refined)
    expect(await refineHabitSuggestion(draft, 'one page', 'pt-BR', 'account-a')).toEqual({ ok: true, data: refined })
    expect(mocks.mutate).toHaveBeenCalledExactlyOnceWith(API.chat.refineHabitSuggestion, {
      method: 'POST', body: JSON.stringify({ draft, instruction: 'one page', language: 'pt-BR' }),
    }, 'account-a', habitSuggestionDraftSchema)
  })

  it.each([false, true])('sends the %s batch flag to the corresponding preview endpoint', async all => {
    const response = all ? makeHabitSuggestionBatchPreview() : makeHabitSuggestionPreview()
    mocks.mutate.mockResolvedValueOnce(response)
    expect(await previewHabitSuggestions([draft], all, 'en', 'account-a')).toEqual({ ok: true, data: { response } })
    expect(mocks.mutate).toHaveBeenCalledExactlyOnceWith(all ? API.chat.previewAllHabitSuggestions : API.chat.previewHabitSuggestion, {
      method: 'POST', body: JSON.stringify(all ? { drafts: [draft], language: 'en' } : { draft, language: 'en' }),
    }, 'account-a', agentExecuteOperationResponseSchema)
  })

  it.each(['refine', 'preview'] as const)('rejects an invalid draft before sending %s', async operation => {
    const invalid = { ...draft, dueDate: 'invalid' }
    const result = operation === 'refine'
      ? await refineHabitSuggestion(invalid, 'one page', 'en', 'account-a')
      : await previewHabitSuggestions([invalid], true, 'en', 'account-a')
    expect(result.ok).toBe(false)
    expect(mocks.mutate).not.toHaveBeenCalled()
  })

  it('returns the unavailable draft index for a batch conflict', async () => {
    mocks.mutate.mockRejectedValueOnce(new ApiClientError(400, 'Unavailable', { data: {
      error: 'Unavailable', errorCode: 'HABIT_SUGGESTION_UNAVAILABLE', draftIndex: 1,
    } }))
    expect(await previewHabitSuggestions([draft], true, 'en', 'account-a')).toEqual({ ok: true, data: { conflictIndex: 1 } })
  })

  it.each([
    { error: 'Unavailable', errorCode: 'OTHER', draftIndex: 0 },
    { error: 'Unavailable', errorCode: 'HABIT_SUGGESTION_UNAVAILABLE', draftIndex: -1 },
    null,
  ])('keeps unrecognized conflict payload %j as a failure', async payload => {
    mocks.mutate.mockRejectedValueOnce(new ApiClientError(400, 'Unavailable', { data: payload }))
    expect(await previewHabitSuggestions([draft], true, 'en', 'account-a')).toMatchObject({ ok: false, status: 400, error: 'Unavailable' })
  })

  it.each(['refine', 'preview'] as const)('serializes an unexpected %s failure', async operation => {
    mocks.mutate.mockRejectedValueOnce(new Error('Offline'))
    const result = operation === 'refine'
      ? await refineHabitSuggestion(draft, 'one page', 'en', 'account-a')
      : await previewHabitSuggestions([draft], false, 'en', 'account-a')
    expect(result).toMatchObject({ ok: false, status: 500, error: 'Offline' })
  })
})

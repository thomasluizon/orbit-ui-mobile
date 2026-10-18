import { describe, expect, it, vi } from 'vitest'
import { createTagSuggestionActions, createTagSuggestionState, tagSuggestionStatusKey, type TagSuggestionOptions, type TagSuggestionState } from '../hooks/tag-suggestions-core'
import type { SuggestedTag, SuggestTagsResponse } from '../types/habit'

const proposal: SuggestedTag = { name: 'Health', color: '#7c3aed', id: 'existing', isExisting: true }

function createSubject(overrides: Partial<TagSuggestionOptions> = {}) {
  let state = createTagSuggestionState()
  const actions = createTagSuggestionActions((update) => { state = typeof update === 'function' ? update(state) : update })
  const options = { title: ' Run ', description: ' Outside ', language: 'en', disabled: false, request: vi.fn().mockResolvedValue({ tags: [] }), accept: vi.fn().mockResolvedValue(undefined), ...overrides }
  return { actions, options, state: () => state }
}

describe('tag suggestion coordination', () => {
  it.each([{ title: '   ' }, { disabled: true }])('does not request unavailable suggestions: %j', async (overrides) => {
    const subject = createSubject(overrides)
    await subject.actions.suggest(subject.options)
    expect(subject.options.request).not.toHaveBeenCalled()
    expect(subject.state().pending).toBeNull()
  })

  it('ignores duplicate requests and acceptance while a request is pending', async () => {
    let resolve!: (response: { tags: [] }) => void
    const subject = createSubject({ request: vi.fn(() => new Promise<{ tags: [] }>((complete) => { resolve = complete })) })
    const pending = subject.actions.suggest(subject.options)
    await subject.actions.suggest(subject.options)
    await subject.actions.acceptSuggestion({ name: 'Health', color: '#7c3aed', id: 'existing', isExisting: true }, subject.options)
    expect(subject.options.request).toHaveBeenCalledTimes(1)
    expect(subject.options.accept).not.toHaveBeenCalled()
    resolve({ tags: [] })
    await pending
    expect(subject.state().noResults).toBe(true)
  })

  it('rejects acceptance while disabled without removing proposals', async () => {
    const proposal = { name: 'Health', color: '#7c3aed', id: 'existing', isExisting: true }
    const subject = createSubject({ request: vi.fn().mockResolvedValue({ tags: [proposal] }) })
    await subject.actions.suggest(subject.options)
    await subject.actions.acceptSuggestion(proposal, { ...subject.options, disabled: true })
    expect(subject.options.accept).not.toHaveBeenCalled()
    expect(subject.state().suggestions).toEqual([proposal])
  })

  it('starts without suggestions, a pending operation, an empty result, or an error', () => {
    expect(createTagSuggestionState()).toEqual({ suggestions: [], pending: null, noResults: false, error: null })
  })

  it.each([
    { description: ' Outside ', expectedDescription: 'Outside' },
    { description: '   ', expectedDescription: null },
    { description: '', expectedDescription: null },
  ])('trims request text and publishes returned suggestions for $description', async ({ description, expectedDescription }) => {
    const subject = createSubject({ description, language: 'pt-BR', request: vi.fn().mockResolvedValue({ tags: [proposal] }) })
    await subject.actions.suggest(subject.options)
    expect(subject.options.request).toHaveBeenCalledWith({ title: 'Run', description: expectedDescription, language: 'pt-BR' })
    expect(subject.state()).toEqual({ suggestions: [proposal], pending: null, noResults: false, error: null })
  })

  it('replaces old proposals and clears the empty result when requesting again', async () => {
    let resolve!: (response: SuggestTagsResponse) => void
    const request = vi.fn<TagSuggestionOptions['request']>().mockResolvedValueOnce({ tags: [proposal] })
      .mockImplementationOnce(() => new Promise((complete) => { resolve = complete }))
      .mockResolvedValueOnce({ tags: [proposal] })
    const subject = createSubject({ request })
    await subject.actions.suggest(subject.options)
    const pending = subject.actions.suggest(subject.options)
    expect(subject.state()).toEqual({ suggestions: [], pending: 'suggest', noResults: false, error: null })
    resolve({ tags: [] })
    await pending
    expect(subject.state()).toEqual({ suggestions: [], pending: null, noResults: true, error: null })
    await subject.actions.suggest(subject.options)
    expect(subject.state()).toEqual({ suggestions: [proposal], pending: null, noResults: false, error: null })
  })

  it('reports a request failure and allows a successful retry that clears the error', async () => {
    const cause = new Error('Suggestion request failed')
    let resolve!: (response: SuggestTagsResponse) => void
    const request = vi.fn<TagSuggestionOptions['request']>().mockRejectedValueOnce(cause)
      .mockImplementationOnce(() => new Promise((complete) => { resolve = complete }))
    const subject = createSubject({ request })
    await subject.actions.suggest(subject.options)
    expect(subject.state()).toEqual({ suggestions: [], pending: null, noResults: false, error: { cause, operation: 'suggest' } })
    const retry = subject.actions.suggest(subject.options)
    expect(subject.state()).toEqual({ suggestions: [], pending: 'suggest', noResults: false, error: null })
    resolve({ tags: [proposal] })
    await retry
    expect(subject.state()).toEqual({ suggestions: [proposal], pending: null, noResults: false, error: null })
  })

  it('removes matching duplicate names after acceptance while preserving other names and case', async () => {
    const duplicate = { ...proposal, id: 'duplicate' }
    const lowercase = { ...proposal, name: 'health', id: 'lowercase' }
    const other = { ...proposal, name: 'Outside', id: null, isExisting: false }
    const subject = createSubject({ request: vi.fn().mockResolvedValue({ tags: [proposal, duplicate, lowercase, other] }) })
    await subject.actions.suggest(subject.options)
    await subject.actions.acceptSuggestion(proposal, subject.options)
    expect(subject.options.accept).toHaveBeenCalledWith(proposal)
    expect(subject.state()).toEqual({ suggestions: [lowercase, other], pending: null, noResults: false, error: null })
  })

  it('keeps suggestions visible and prevents concurrent actions until acceptance finishes', async () => {
    let resolve!: () => void
    const subject = createSubject({
      request: vi.fn().mockResolvedValue({ tags: [proposal] }),
      accept: vi.fn(() => new Promise<void>((complete) => { resolve = complete })),
    })
    await subject.actions.suggest(subject.options)
    const pending = subject.actions.acceptSuggestion(proposal, subject.options)
    expect(subject.state()).toEqual({ suggestions: [proposal], pending: 'accept', noResults: false, error: null })
    await subject.actions.acceptSuggestion(proposal, subject.options)
    await subject.actions.suggest(subject.options)
    expect(subject.options.accept).toHaveBeenCalledTimes(1)
    expect(subject.options.request).toHaveBeenCalledTimes(1)
    expect(subject.state().suggestions).toEqual([proposal])
    resolve()
    await pending
    expect(subject.state()).toEqual({ suggestions: [], pending: null, noResults: false, error: null })
    await subject.actions.suggest(subject.options)
    expect(subject.state().suggestions).toEqual([proposal])
    expect(subject.options.request).toHaveBeenCalledTimes(2)
  })

  it('retains a failed acceptance for retry and clears its error when retrying', async () => {
    const cause = new Error('Tag creation failed')
    let resolve!: () => void
    const accept = vi.fn<TagSuggestionOptions['accept']>().mockRejectedValueOnce(cause)
      .mockImplementationOnce(() => new Promise<void>((complete) => { resolve = complete }))
    const subject = createSubject({ request: vi.fn().mockResolvedValue({ tags: [proposal] }), accept })
    await subject.actions.suggest(subject.options)
    await subject.actions.acceptSuggestion(proposal, subject.options)
    expect(subject.state()).toEqual({ suggestions: [proposal], pending: null, noResults: false, error: { cause, operation: 'accept' } })
    const retry = subject.actions.acceptSuggestion(proposal, subject.options)
    expect(subject.state()).toEqual({ suggestions: [proposal], pending: 'accept', noResults: false, error: null })
    resolve()
    await retry
    expect(subject.state()).toEqual({ suggestions: [], pending: null, noResults: false, error: null })
    expect(accept).toHaveBeenCalledTimes(2)
  })
})

describe('tag suggestion status', () => {
  const cases: { label: string; state: Partial<TagSuggestionState>; atLimit: boolean; needsTitle: boolean; expected: string | null }[] = [
    { label: 'suggestion loading before acceptance constraints', state: { pending: 'suggest', noResults: true, suggestions: [proposal] }, atLimit: true, needsTitle: true, expected: 'habits.form.suggestingTags' },
    { label: 'acceptance loading before acceptance constraints', state: { pending: 'accept', noResults: true, suggestions: [proposal] }, atLimit: true, needsTitle: true, expected: 'common.loading' },
    { label: 'tag limit before missing title or results', state: { noResults: true, suggestions: [proposal] }, atLimit: true, needsTitle: true, expected: 'habits.form.tagLimit' },
    { label: 'missing title before results', state: { noResults: true, suggestions: [proposal] }, atLimit: false, needsTitle: true, expected: 'habits.form.titleRequired' },
    { label: 'empty result', state: { noResults: true }, atLimit: false, needsTitle: false, expected: 'habits.form.noTagSuggestions' },
    { label: 'available suggestions', state: { suggestions: [proposal] }, atLimit: false, needsTitle: false, expected: 'habits.form.suggestedTagsLabel' },
    { label: 'idle', state: {}, atLimit: false, needsTitle: false, expected: null },
  ]

  it.each(cases)('shows the status for $label', ({ state, atLimit, needsTitle, expected }) => {
    expect(tagSuggestionStatusKey({ ...createTagSuggestionState(), ...state }, atLimit, needsTitle)).toBe(expected)
  })
})

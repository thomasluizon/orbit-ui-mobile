import { describe, expect, it, vi } from 'vitest'
import { createTagSuggestionActions, createTagSuggestionState, type TagSuggestionOptions } from '../hooks/tag-suggestions-core'

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
})

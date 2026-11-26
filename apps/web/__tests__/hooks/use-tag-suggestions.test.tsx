import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import type { SuggestTagsResponse } from '@orbit/shared/types/habit'
import { useTagSuggestions } from '@/hooks/use-tag-suggestions'
import { advanceAccountGeneration } from '@/lib/session-epoch'

type Options = Parameters<typeof useTagSuggestions>[0]

const outdoors: SuggestTagsResponse = { tags: [{ name: 'Outdoors', color: '#7c3aed', isExisting: false, id: null }] }

function setup() {
  let resolve!: (response: SuggestTagsResponse) => void
  const request = vi.fn(() => new Promise<SuggestTagsResponse>((complete) => { resolve = complete }))
  const base: Options = {
    title: 'Run',
    description: '',
    language: 'en',
    disabled: false,
    availableTags: [],
    request,
    accept: vi.fn(),
  }
  const view = renderHook((props: Partial<Options>) => useTagSuggestions({ ...base, ...props }), { initialProps: {} })
  return { view, request, resolve: (response: SuggestTagsResponse) => act(async () => resolve(response)) }
}

afterEach(cleanup)

describe('useTagSuggestions context guard', () => {
  it('keeps a result when the context does not change while the request is pending', async () => {
    const { view, request, resolve } = setup()
    act(() => { void view.result.current.suggest() })
    expect(request).toHaveBeenCalledOnce()
    expect(view.result.current.pending).toBe('suggest')
    await resolve(outdoors)
    expect(view.result.current.suggestions).toEqual(outdoors.tags)
    expect(view.result.current.pending).toBeNull()
  })

  it.each([
    ['title', { title: 'Read' }],
    ['description', { description: 'Outside' }],
    ['language', { language: 'pt-BR' }],
  ] as const)('drops an in-flight result when the %s changes', async (_name, change) => {
    const { view, resolve } = setup()
    act(() => { void view.result.current.suggest() })
    view.rerender(change)
    expect(view.result.current.pending).toBeNull()
    await resolve(outdoors)
    expect(view.result.current.suggestions).toEqual([])
    expect(view.result.current.noResults).toBe(false)
    expect(view.result.current.canSuggest).toBe(true)
  })

  it('drops an in-flight result when the title changes and returns to the same trimmed title', async () => {
    const { view, resolve } = setup()
    act(() => { void view.result.current.suggest() })
    view.rerender({ title: 'Read' })
    view.rerender({ title: ' Run ' })
    await resolve(outdoors)
    expect(view.result.current.suggestions).toEqual([])
    expect(view.result.current.pending).toBeNull()
  })

  it('drops an in-flight result when the account generation advances', async () => {
    const { view, resolve } = setup()
    act(() => { void view.result.current.suggest() })
    act(() => advanceAccountGeneration())
    expect(view.result.current.pending).toBeNull()
    await resolve(outdoors)
    expect(view.result.current.suggestions).toEqual([])
    expect(view.result.current.noResults).toBe(false)
  })
})

import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SuggestTagsResponse } from '@orbit/shared/types/habit'
import { useTagSuggestions } from '@/hooks/use-tag-suggestions'
import { advanceAccountGeneration } from '@/lib/session-epoch'

const TestRenderer = require('react-test-renderer')

type Options = Parameters<typeof useTagSuggestions>[0]
type Suggestions = ReturnType<typeof useTagSuggestions>

const outdoors: SuggestTagsResponse = { tags: [{ name: 'Outdoors', color: '#7c3aed', isExisting: false, id: null }] }

async function setup() {
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
  let latest: Suggestions | null = null
  function Harness({ change }: { change: Partial<Options> }) {
    latest = useTagSuggestions({ ...base, ...change })
    return null
  }
  let renderer!: { update: (element: React.ReactElement) => void; unmount: () => void }
  await TestRenderer.act(async () => { renderer = TestRenderer.create(<Harness change={{}} />); await Promise.resolve() })
  mounted.push(renderer)
  return {
    request,
    current: () => {
      if (latest === null) throw new Error('hook did not render')
      return latest
    },
    rerender: (change: Partial<Options>) => TestRenderer.act(async () => { renderer.update(<Harness change={change} />); await Promise.resolve() }),
    suggest: () => TestRenderer.act(async () => { void latest?.suggest(); await Promise.resolve() }),
    resolve: (response: SuggestTagsResponse) => TestRenderer.act(async () => { resolve(response); await Promise.resolve() }),
  }
}

const mounted: { unmount: () => void }[] = []

afterEach(() => {
  mounted.splice(0).forEach((renderer) => renderer.unmount())
  vi.unstubAllGlobals()
})

describe('useTagSuggestions context guard', () => {
  it('keeps a result when the context does not change while the request is pending', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    const hook = await setup()
    await hook.suggest()
    expect(hook.request).toHaveBeenCalledOnce()
    expect(hook.current().pending).toBe('suggest')
    await hook.resolve(outdoors)
    expect(hook.current().suggestions).toEqual(outdoors.tags)
    expect(hook.current().pending).toBeNull()
  })

  it.each([
    ['title', { title: 'Read' }],
    ['description', { description: 'Outside' }],
    ['language', { language: 'pt-BR' }],
  ] as const)('drops an in-flight result when the %s changes', async (_name, change) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    const hook = await setup()
    await hook.suggest()
    await hook.rerender(change)
    expect(hook.current().pending).toBeNull()
    await hook.resolve(outdoors)
    expect(hook.current().suggestions).toEqual([])
    expect(hook.current().noResults).toBe(false)
    expect(hook.current().canSuggest).toBe(true)
  })

  it('drops an in-flight result when the title changes and returns to the same trimmed title', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    const hook = await setup()
    await hook.suggest()
    await hook.rerender({ title: 'Read' })
    await hook.rerender({ title: ' Run ' })
    await hook.resolve(outdoors)
    expect(hook.current().suggestions).toEqual([])
    expect(hook.current().pending).toBeNull()
  })

  it('drops an in-flight result when the account generation advances', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    const hook = await setup()
    await hook.suggest()
    await TestRenderer.act(async () => { advanceAccountGeneration(); await Promise.resolve() })
    expect(hook.current().pending).toBeNull()
    await hook.resolve(outdoors)
    expect(hook.current().suggestions).toEqual([])
    expect(hook.current().noResults).toBe(false)
  })
})

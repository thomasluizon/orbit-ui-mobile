import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { TAG_COLORS } from '@orbit/shared/hooks'
import type { SuggestedTag } from '@orbit/shared/types/habit'
import { useTagSelection, type TagSelectionState } from '@/hooks/use-tag-selection'

const TestRenderer = require('react-test-renderer')

interface Holder {
  current: TagSelectionState
}

function renderTagSelection(initialTagIds: string[] = [], maxTags?: number): Holder {
  const holder = { current: null as unknown as TagSelectionState }
  function Harness() {
    holder.current = useTagSelection(initialTagIds, maxTags)
    return null
  }
  TestRenderer.act(() => {
    TestRenderer.create(<Harness />)
  })
  return holder
}

async function act(callback: () => void | Promise<void>): Promise<void> {
  await TestRenderer.act(async () => {
    await callback()
  })
}

const validColor = TAG_COLORS[1]

describe('mobile useTagSelection', () => {
  it('seeds the selection from the initial ids and toggles ids in and out', async () => {
    const tags = renderTagSelection(['a', 'b'])
    expect(tags.current.selectedTagIds).toEqual(['a', 'b'])

    await act(() => tags.current.toggleTag('c'))
    expect(tags.current.selectedTagIds).toEqual(['a', 'b', 'c'])

    await act(() => tags.current.toggleTag('a'))
    expect(tags.current.selectedTagIds).toEqual(['b', 'c'])
  })

  it('reports the tag limit once the selection is full', async () => {
    const tags = renderTagSelection(['a', 'b'], 2)
    expect(tags.current.atTagLimit).toBe(true)

    const single = renderTagSelection(['a'], 2)
    expect(single.current.atTagLimit).toBe(false)
  })

  it('resets the selection and drafts', async () => {
    const tags = renderTagSelection(['a'])
    await act(() => tags.current.setNewTagName('Focus'))
    await act(() => tags.current.resetTags(['x', 'y']))

    expect(tags.current.selectedTagIds).toEqual(['x', 'y'])
    expect(tags.current.newTagName).toBe('')
    expect(tags.current.newTagColor).toBe(TAG_COLORS[0])
  })

  it('creates and selects a new tag, then clears the draft', async () => {
    const tags = renderTagSelection([])
    await act(() => tags.current.setShowNewTag(true))
    await act(() => tags.current.setNewTagName('Focus'))
    await act(() => tags.current.setNewTagColor(validColor))

    const createTag = vi.fn(async () => 'new-id')
    await act(() => tags.current.createAndSelectTag(createTag))

    expect(createTag).toHaveBeenCalledWith('Focus', validColor)
    expect(tags.current.selectedTagIds).toContain('new-id')
    expect(tags.current.showNewTag).toBe(false)
    expect(tags.current.newTagName).toBe('')
  })

  it('surfaces a validation error and skips creation when the new-tag name is blank', async () => {
    const tags = renderTagSelection([])
    const createTag = vi.fn(async () => 'new-id')

    await act(() => tags.current.createAndSelectTag(createTag))

    expect(createTag).not.toHaveBeenCalled()
    expect(tags.current.tagValidationErrorKey).toBe('habits.form.tagNameRequired')
  })

  it('does not create a tag once the selection is at the limit', async () => {
    const tags = renderTagSelection(['a'], 1)
    await act(() => tags.current.setNewTagName('Focus'))
    await act(() => tags.current.setNewTagColor(validColor))
    const createTag = vi.fn(async () => 'new-id')

    await act(() => tags.current.createAndSelectTag(createTag))

    expect(createTag).not.toHaveBeenCalled()
    expect(tags.current.selectedTagIds).toEqual(['a'])
  })

  it('accepts an existing suggested tag by selecting its id without creating', async () => {
    const tags = renderTagSelection([])
    const createTag = vi.fn(async () => 'new-id')
    const suggestion: SuggestedTag = {
      name: 'Health',
      color: validColor,
      isExisting: true,
      id: 'existing-id',
    }

    await act(() => tags.current.acceptSuggestedTag(suggestion, createTag))

    expect(createTag).not.toHaveBeenCalled()
    expect(tags.current.selectedTagIds).toContain('existing-id')
  })

  it('accepts a novel suggested tag by creating and selecting it', async () => {
    const tags = renderTagSelection([])
    const createTag = vi.fn(async () => 'made-id')
    const suggestion: SuggestedTag = {
      name: 'Health',
      color: validColor,
      isExisting: false,
      id: null,
    }

    await act(() => tags.current.acceptSuggestedTag(suggestion, createTag))

    expect(createTag).toHaveBeenCalledWith('Health', validColor)
    expect(tags.current.selectedTagIds).toContain('made-id')
  })

  it('enters edit mode, saves an edited tag, and leaves edit mode', async () => {
    const tags = renderTagSelection([])
    await act(() => tags.current.startEditTag({ id: 't1', name: 'Old', color: TAG_COLORS[0] }))
    expect(tags.current.editingTagId).toBe('t1')
    expect(tags.current.editTagName).toBe('Old')

    await act(() => tags.current.setEditTagName('New'))
    await act(() => tags.current.setEditTagColor(validColor))
    const updateTag = vi.fn(async () => {})
    await act(() => tags.current.saveEditTag(updateTag))

    expect(updateTag).toHaveBeenCalledWith('t1', 'New', validColor)
    expect(tags.current.editingTagId).toBeNull()
  })

  it('cancels edit mode without persisting', async () => {
    const tags = renderTagSelection([])
    await act(() => tags.current.startEditTag({ id: 't1', name: 'Old', color: TAG_COLORS[0] }))
    await act(() => tags.current.cancelEditTag())

    expect(tags.current.editingTagId).toBeNull()
    expect(tags.current.editTagName).toBe('')
  })

  it('optimistically deselects a deleted tag on success', async () => {
    const tags = renderTagSelection(['t1', 't2'])
    const deleteTag = vi.fn(async () => {})

    await act(() => tags.current.deleteTag('t1', deleteTag))

    expect(deleteTag).toHaveBeenCalledWith('t1')
    expect(tags.current.selectedTagIds).toEqual(['t2'])
  })

  it('restores the selection and rethrows when the delete fails', async () => {
    const tags = renderTagSelection(['t1', 't2'])
    const deleteTag = vi.fn(async () => {
      throw new Error('server down')
    })

    let thrown: unknown
    await act(async () => {
      try {
        await tags.current.deleteTag('t1', deleteTag)
      } catch (error: unknown) {
        thrown = error
      }
    })

    expect(thrown).toBeInstanceOf(Error)
    expect(tags.current.selectedTagIds).toEqual(['t1', 't2'])
  })
})

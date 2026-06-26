import { describe, expect, it, vi } from 'vitest'
import type {
  ApplyTagSelectionState,
  TagSelectionCoreState,
} from '../hooks/tag-selection-core'
import {
  acceptSuggestedTagFlow,
  cancelTagEdit,
  createAndSelectTagFlow,
  createInitialTagSelectionState,
  deleteTagFlow,
  isTagSelectionAtLimit,
  saveEditTagFlow,
  setEditTagColorDraft,
  setEditTagNameDraft,
  setNewTagColorDraft,
  setNewTagNameDraft,
  startTagEdit,
  TAG_COLORS,
  toggleTagSelection,
} from '../hooks/tag-selection-core'

function createStateHarness(initial: TagSelectionCoreState) {
  const harness = {
    state: initial,
    applyState: ((updater) => {
      harness.state = updater(harness.state)
    }) as ApplyTagSelectionState,
  }
  return harness
}

describe('createInitialTagSelectionState', () => {
  it('copies the initial ids and starts with clean drafts', () => {
    const initialIds = ['tag-1']
    const state = createInitialTagSelectionState(initialIds)

    expect(state).toEqual({
      selectedTagIds: ['tag-1'],
      showNewTag: false,
      newTagName: '',
      newTagColor: TAG_COLORS[0],
      editingTagId: null,
      editTagName: '',
      editTagColor: '',
      tagValidationErrorKey: null,
    })
    expect(state.selectedTagIds).not.toBe(initialIds)
  })
})

describe('selection transitions', () => {
  it('toggles a tag id in and out', () => {
    const state = createInitialTagSelectionState(['tag-1'])

    const added = toggleTagSelection(state, 'tag-2')
    expect(added.selectedTagIds).toEqual(['tag-1', 'tag-2'])

    const removed = toggleTagSelection(added, 'tag-1')
    expect(removed.selectedTagIds).toEqual(['tag-2'])
  })

  it('reports the tag limit from the selection size', () => {
    const state = createInitialTagSelectionState(['tag-1', 'tag-2'])

    expect(isTagSelectionAtLimit(state, 2)).toBe(true)
    expect(isTagSelectionAtLimit(state, 3)).toBe(false)
  })
})

describe('edit transitions', () => {
  it('startTagEdit loads the tag into the edit drafts and clears errors', () => {
    const state = {
      ...createInitialTagSelectionState(),
      tagValidationErrorKey: 'habits.form.tagNameRequired',
    }

    const editing = startTagEdit(state, { id: 'tag-1', name: 'Health', color: '#2563eb' })

    expect(editing.editingTagId).toBe('tag-1')
    expect(editing.editTagName).toBe('Health')
    expect(editing.editTagColor).toBe('#2563eb')
    expect(editing.tagValidationErrorKey).toBeNull()
  })

  it('cancelTagEdit clears the edit drafts', () => {
    const state = startTagEdit(createInitialTagSelectionState(), {
      id: 'tag-1',
      name: 'Health',
      color: '#2563eb',
    })

    const cancelled = cancelTagEdit(state)

    expect(cancelled.editingTagId).toBeNull()
    expect(cancelled.editTagName).toBe('')
    expect(cancelled.editTagColor).toBe('')
  })

  it('draft setters clear a stale validation error', () => {
    const state = {
      ...createInitialTagSelectionState(),
      tagValidationErrorKey: 'habits.form.tagNameRequired',
    }

    expect(setNewTagNameDraft(state, 'Focus').tagValidationErrorKey).toBeNull()
    expect(setNewTagColorDraft(state, '#dc2626').tagValidationErrorKey).toBeNull()
    expect(setEditTagNameDraft(state, 'Focus').tagValidationErrorKey).toBeNull()
    expect(setEditTagColorDraft(state, '#dc2626').tagValidationErrorKey).toBeNull()
  })
})

describe('createAndSelectTagFlow', () => {
  it('creates, selects, and resets the new-tag drafts', async () => {
    const harness = createStateHarness({
      ...createInitialTagSelectionState(['tag-1']),
      showNewTag: true,
      newTagName: '  Focus  ',
      newTagColor: '#dc2626',
    })
    const createTag = vi.fn().mockResolvedValue('tag-2')

    await createAndSelectTagFlow(harness.state, 5, createTag, harness.applyState)

    expect(createTag).toHaveBeenCalledWith('Focus', '#dc2626')
    expect(harness.state.selectedTagIds).toEqual(['tag-1', 'tag-2'])
    expect(harness.state.newTagName).toBe('')
    expect(harness.state.showNewTag).toBe(false)
    expect(harness.state.newTagColor).toBe(TAG_COLORS[0])
    expect(harness.state.tagValidationErrorKey).toBeNull()
  })

  it('does nothing when the selection is already at the limit', async () => {
    const harness = createStateHarness(
      createInitialTagSelectionState(['tag-1', 'tag-2']),
    )
    const createTag = vi.fn()

    await createAndSelectTagFlow(harness.state, 2, createTag, harness.applyState)

    expect(createTag).not.toHaveBeenCalled()
  })

  it('surfaces the validation error key without creating', async () => {
    const harness = createStateHarness({
      ...createInitialTagSelectionState(),
      newTagName: '   ',
    })
    const createTag = vi.fn()

    await createAndSelectTagFlow(harness.state, 5, createTag, harness.applyState)

    expect(createTag).not.toHaveBeenCalled()
    expect(harness.state.tagValidationErrorKey).toBe('habits.form.tagNameRequired')
  })

  it('resets the drafts without selecting when creation returns null', async () => {
    const harness = createStateHarness({
      ...createInitialTagSelectionState(),
      newTagName: 'Focus',
      newTagColor: '#dc2626',
    })

    await createAndSelectTagFlow(
      harness.state,
      5,
      vi.fn().mockResolvedValue(null),
      harness.applyState,
    )

    expect(harness.state.selectedTagIds).toEqual([])
    expect(harness.state.newTagName).toBe('')
  })

  it('skips selecting when the limit was reached while creating', async () => {
    const harness = createStateHarness({
      ...createInitialTagSelectionState(['tag-1']),
      newTagName: 'Focus',
      newTagColor: '#dc2626',
    })
    const createTag = vi.fn().mockImplementation(async () => {
      harness.applyState((previous) => ({
        ...previous,
        selectedTagIds: [...previous.selectedTagIds, 'tag-9'],
      }))
      return 'tag-2'
    })

    await createAndSelectTagFlow(harness.state, 2, createTag, harness.applyState)

    expect(harness.state.selectedTagIds).toEqual(['tag-1', 'tag-9'])
  })
})

describe('acceptSuggestedTagFlow', () => {
  it('selects an existing suggestion by its tag id without creating', async () => {
    const harness = createStateHarness(createInitialTagSelectionState(['tag-1']))
    const createTag = vi.fn()

    await acceptSuggestedTagFlow(
      harness.state,
      5,
      { name: 'Health', color: '#10b981', isExisting: true, id: 'tag-2' },
      createTag,
      harness.applyState,
    )

    expect(createTag).not.toHaveBeenCalled()
    expect(harness.state.selectedTagIds).toEqual(['tag-1', 'tag-2'])
  })

  it('creates and selects a new suggestion', async () => {
    const harness = createStateHarness(createInitialTagSelectionState())
    const createTag = vi.fn().mockResolvedValue('tag-9')

    await acceptSuggestedTagFlow(
      harness.state,
      5,
      { name: '  Reading  ', color: '#7c3aed', isExisting: false, id: null },
      createTag,
      harness.applyState,
    )

    expect(createTag).toHaveBeenCalledWith('Reading', '#7c3aed')
    expect(harness.state.selectedTagIds).toEqual(['tag-9'])
  })

  it('does nothing when the selection is already at the limit', async () => {
    const harness = createStateHarness(createInitialTagSelectionState(['tag-1', 'tag-2']))
    const createTag = vi.fn()

    await acceptSuggestedTagFlow(
      harness.state,
      2,
      { name: 'Health', color: '#10b981', isExisting: true, id: 'tag-3' },
      createTag,
      harness.applyState,
    )

    expect(createTag).not.toHaveBeenCalled()
    expect(harness.state.selectedTagIds).toEqual(['tag-1', 'tag-2'])
  })

  it('does not duplicate an already-selected existing tag', async () => {
    const harness = createStateHarness(createInitialTagSelectionState(['tag-1']))

    await acceptSuggestedTagFlow(
      harness.state,
      5,
      { name: 'Health', color: '#10b981', isExisting: true, id: 'tag-1' },
      vi.fn(),
      harness.applyState,
    )

    expect(harness.state.selectedTagIds).toEqual(['tag-1'])
  })

  it('skips selecting when creating a new suggestion returns null', async () => {
    const harness = createStateHarness(createInitialTagSelectionState())

    await acceptSuggestedTagFlow(
      harness.state,
      5,
      { name: 'Reading', color: '#7c3aed', isExisting: false, id: null },
      vi.fn().mockResolvedValue(null),
      harness.applyState,
    )

    expect(harness.state.selectedTagIds).toEqual([])
  })
})

describe('saveEditTagFlow', () => {
  it('persists trimmed edits and leaves edit mode', async () => {
    const harness = createStateHarness(
      startTagEdit(createInitialTagSelectionState(), {
        id: 'tag-1',
        name: 'Health',
        color: '#2563eb',
      }),
    )
    harness.state = setEditTagNameDraft(harness.state, '  Wellness  ')
    const updateTag = vi.fn().mockResolvedValue(undefined)

    await saveEditTagFlow(harness.state, updateTag, harness.applyState)

    expect(updateTag).toHaveBeenCalledWith('tag-1', 'Wellness', '#2563eb')
    expect(harness.state.editingTagId).toBeNull()
    expect(harness.state.tagValidationErrorKey).toBeNull()
  })

  it('does nothing when no tag is being edited', async () => {
    const harness = createStateHarness(createInitialTagSelectionState())
    const updateTag = vi.fn()

    await saveEditTagFlow(harness.state, updateTag, harness.applyState)

    expect(updateTag).not.toHaveBeenCalled()
  })

  it('surfaces the validation error key without persisting', async () => {
    const harness = createStateHarness({
      ...startTagEdit(createInitialTagSelectionState(), {
        id: 'tag-1',
        name: 'Health',
        color: '#2563eb',
      }),
      editTagName: '',
    })
    const updateTag = vi.fn()

    await saveEditTagFlow(harness.state, updateTag, harness.applyState)

    expect(updateTag).not.toHaveBeenCalled()
    expect(harness.state.tagValidationErrorKey).toBe('habits.form.tagNameRequired')
    expect(harness.state.editingTagId).toBe('tag-1')
  })
})

describe('deleteTagFlow', () => {
  it('deselects the tag and clears the error on success', async () => {
    const harness = createStateHarness(
      createInitialTagSelectionState(['tag-1', 'tag-2']),
    )
    const deleteTagFn = vi.fn().mockResolvedValue(undefined)

    await deleteTagFlow(harness.state, 'tag-1', deleteTagFn, harness.applyState)

    expect(deleteTagFn).toHaveBeenCalledWith('tag-1')
    expect(harness.state.selectedTagIds).toEqual(['tag-2'])
  })

  it('leaves edit mode when the deleted tag was being edited', async () => {
    const harness = createStateHarness(
      startTagEdit(createInitialTagSelectionState(['tag-1']), {
        id: 'tag-1',
        name: 'Health',
        color: '#2563eb',
      }),
    )

    await deleteTagFlow(
      harness.state,
      'tag-1',
      vi.fn().mockResolvedValue(undefined),
      harness.applyState,
    )

    expect(harness.state.editingTagId).toBeNull()
  })

  it('restores selection and edit state, then rethrows, when deletion fails', async () => {
    const harness = createStateHarness(
      startTagEdit(createInitialTagSelectionState(['tag-1', 'tag-2']), {
        id: 'tag-1',
        name: 'Health',
        color: '#2563eb',
      }),
    )
    const failure = new Error('delete failed')

    await expect(
      deleteTagFlow(
        harness.state,
        'tag-1',
        vi.fn().mockRejectedValue(failure),
        harness.applyState,
      ),
    ).rejects.toThrow('delete failed')

    expect(harness.state.selectedTagIds).toEqual(['tag-1', 'tag-2'])
    expect(harness.state.editingTagId).toBe('tag-1')
    expect(harness.state.editTagName).toBe('Health')
    expect(harness.state.editTagColor).toBe('#2563eb')
  })

  it('keeps an unrelated edit session when deletion fails', async () => {
    const harness = createStateHarness(
      startTagEdit(createInitialTagSelectionState(['tag-1', 'tag-2']), {
        id: 'tag-2',
        name: 'Focus',
        color: '#dc2626',
      }),
    )

    await expect(
      deleteTagFlow(
        harness.state,
        'tag-1',
        vi.fn().mockRejectedValue(new Error('delete failed')),
        harness.applyState,
      ),
    ).rejects.toThrow('delete failed')

    expect(harness.state.editingTagId).toBe('tag-2')
    expect(harness.state.selectedTagIds).toEqual(['tag-1', 'tag-2'])
  })
})

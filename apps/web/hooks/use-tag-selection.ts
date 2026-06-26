'use client'

import { useState, useMemo, useCallback } from 'react'
import { MAX_TAGS_PER_HABIT } from '@orbit/shared/validation'
import type { SuggestedTag } from '@orbit/shared/types/habit'
import {
  TAG_COLORS,
  type EditableTag,
  type TagSelectionCoreState,
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
  toggleTagSelection,
} from '@orbit/shared/hooks'

export interface TagSelectionState {
  selectedTagIds: string[]
  atTagLimit: boolean
  tagValidationErrorKey: string | null
  toggleTag: (tagId: string) => void
  resetTags: (tagIds?: string[]) => void
  showNewTag: boolean
  setShowNewTag: (show: boolean) => void
  newTagName: string
  setNewTagName: (name: string) => void
  newTagColor: string
  setNewTagColor: (color: string) => void
  tagColors: readonly string[]
  createAndSelectTag: (
    createTag: (name: string, color: string) => Promise<string | null>,
  ) => Promise<void>
  acceptSuggestedTag: (
    suggestion: SuggestedTag,
    createTag: (name: string, color: string) => Promise<string | null>,
  ) => Promise<void>
  editingTagId: string | null
  editTagName: string
  setEditTagName: (name: string) => void
  editTagColor: string
  setEditTagColor: (color: string) => void
  startEditTag: (tag: EditableTag) => void
  saveEditTag: (
    updateTag: (id: string, name: string, color: string) => Promise<void>,
  ) => Promise<void>
  cancelEditTag: () => void
  deleteTag: (
    tagId: string,
    deleteTagFn: (id: string) => Promise<void>,
  ) => Promise<void>
}

export function useTagSelection(
  initialTagIds: string[] = [],
  maxTags = MAX_TAGS_PER_HABIT,
): TagSelectionState {
  const [state, setState] = useState<TagSelectionCoreState>(() =>
    createInitialTagSelectionState(initialTagIds),
  )

  const atTagLimit = useMemo(() => isTagSelectionAtLimit(state, maxTags), [state, maxTags])

  const toggleTag = useCallback((tagId: string) => {
    setState((previous) => toggleTagSelection(previous, tagId))
  }, [])

  const resetTags = useCallback((tagIds: string[] = []) => {
    setState(createInitialTagSelectionState(tagIds))
  }, [])

  const setShowNewTag = useCallback((show: boolean) => {
    setState((previous) => ({ ...previous, showNewTag: show }))
  }, [])

  const setNewTagName = useCallback((name: string) => {
    setState((previous) => setNewTagNameDraft(previous, name))
  }, [])

  const setNewTagColor = useCallback((color: string) => {
    setState((previous) => setNewTagColorDraft(previous, color))
  }, [])

  const setEditTagName = useCallback((name: string) => {
    setState((previous) => setEditTagNameDraft(previous, name))
  }, [])

  const setEditTagColor = useCallback((color: string) => {
    setState((previous) => setEditTagColorDraft(previous, color))
  }, [])

  const startEditTag = useCallback((tag: EditableTag) => {
    setState((previous) => startTagEdit(previous, tag))
  }, [])

  const cancelEditTag = useCallback(() => {
    setState((previous) => cancelTagEdit(previous))
  }, [])

  const createAndSelectTag = useCallback(
    (createTag: (name: string, color: string) => Promise<string | null>) =>
      createAndSelectTagFlow(state, maxTags, createTag, setState),
    [maxTags, state],
  )

  const acceptSuggestedTag = useCallback(
    (
      suggestion: SuggestedTag,
      createTag: (name: string, color: string) => Promise<string | null>,
    ) => acceptSuggestedTagFlow(state, maxTags, suggestion, createTag, setState),
    [maxTags, state],
  )

  const saveEditTag = useCallback(
    (updateTag: (id: string, name: string, color: string) => Promise<void>) =>
      saveEditTagFlow(state, updateTag, setState),
    [state],
  )

  const deleteTag = useCallback(
    (tagId: string, deleteTagFn: (id: string) => Promise<void>) =>
      deleteTagFlow(state, tagId, deleteTagFn, setState),
    [state],
  )

  return {
    selectedTagIds: state.selectedTagIds,
    atTagLimit,
    tagValidationErrorKey: state.tagValidationErrorKey,
    toggleTag,
    resetTags,
    showNewTag: state.showNewTag,
    setShowNewTag,
    newTagName: state.newTagName,
    setNewTagName,
    newTagColor: state.newTagColor,
    setNewTagColor,
    tagColors: TAG_COLORS,
    createAndSelectTag,
    acceptSuggestedTag,
    editingTagId: state.editingTagId,
    editTagName: state.editTagName,
    setEditTagName,
    editTagColor: state.editTagColor,
    setEditTagColor,
    startEditTag,
    saveEditTag,
    cancelEditTag,
    deleteTag,
  }
}

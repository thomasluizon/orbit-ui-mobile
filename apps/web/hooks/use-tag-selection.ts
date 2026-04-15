'use client'

import { useState, useMemo, useCallback } from 'react'
import { toggleSelectedId } from '@orbit/shared/utils'
import { MAX_TAGS_PER_HABIT, validateTagForm } from '@orbit/shared/validation'

const TAG_COLORS = [
  '#7c3aed',
  '#dc2626',
  '#b45309',
  '#047857',
  '#2563eb',
  '#be185d',
  '#4f46e5',
  '#0f766e',
  '#c2410c',
  '#4d7c0f',
] as const

interface EditableTag {
  id: string
  name: string
  color: string
}

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
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([...initialTagIds])
  const [showNewTag, setShowNewTag] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState<string>(TAG_COLORS[0])
  const [editingTagId, setEditingTagId] = useState<string | null>(null)
  const [editTagName, setEditTagName] = useState('')
  const [editTagColor, setEditTagColor] = useState('')
  const [tagValidationErrorKey, setTagValidationErrorKey] = useState<string | null>(null)

  const atTagLimit = useMemo(
    () => selectedTagIds.length >= maxTags,
    [selectedTagIds.length, maxTags],
  )

  const toggleTag = useCallback((tagId: string) => {
    setSelectedTagIds((prev) => toggleSelectedId(prev, tagId))
  }, [])

  const resetTags = useCallback((tagIds: string[] = []) => {
    setSelectedTagIds([...tagIds])
    setEditingTagId(null)
    setEditTagName('')
    setEditTagColor('')
    setShowNewTag(false)
    setNewTagName('')
    setNewTagColor(TAG_COLORS[0])
    setTagValidationErrorKey(null)
  }, [])

  const startEditTag = useCallback((tag: EditableTag) => {
    setEditingTagId(tag.id)
    setEditTagName(tag.name)
    setEditTagColor(tag.color)
    setTagValidationErrorKey(null)
  }, [])

  const handleSetNewTagName = useCallback((name: string) => {
    setNewTagName(name)
    setTagValidationErrorKey(null)
  }, [])

  const handleSetNewTagColor = useCallback((color: string) => {
    setNewTagColor(color)
    setTagValidationErrorKey(null)
  }, [])

  const handleSetEditTagName = useCallback((name: string) => {
    setEditTagName(name)
    setTagValidationErrorKey(null)
  }, [])

  const handleSetEditTagColor = useCallback((color: string) => {
    setEditTagColor(color)
    setTagValidationErrorKey(null)
  }, [])

  const saveEditTag = useCallback(
    async (updateTag: (id: string, name: string, color: string) => Promise<void>) => {
      if (!editingTagId) {
        return
      }

      const validationErrorKey = validateTagForm(editTagName, editTagColor)
      if (validationErrorKey) {
        setTagValidationErrorKey(validationErrorKey)
        return
      }

      await updateTag(editingTagId, editTagName.trim(), editTagColor)
      setEditingTagId(null)
      setTagValidationErrorKey(null)
    },
    [editingTagId, editTagName, editTagColor],
  )

  const cancelEditTag = useCallback(() => {
    setEditingTagId(null)
    setEditTagName('')
    setEditTagColor('')
    setTagValidationErrorKey(null)
  }, [])

  const deleteTag = useCallback(
    async (tagId: string, deleteTagFn: (id: string) => Promise<void>) => {
      const previousSelectedTagIds = selectedTagIds
      const previousEditingState =
        editingTagId === tagId
          ? {
              id: editingTagId,
              name: editTagName,
              color: editTagColor,
            }
          : null

      setSelectedTagIds((prev) => prev.filter((selectedId) => selectedId !== tagId))
      if (editingTagId === tagId) {
        setEditingTagId(null)
      }

      try {
        await deleteTagFn(tagId)
        setTagValidationErrorKey(null)
      } catch (error: unknown) {
        setSelectedTagIds(previousSelectedTagIds)
        if (previousEditingState) {
          setEditingTagId(previousEditingState.id)
          setEditTagName(previousEditingState.name)
          setEditTagColor(previousEditingState.color)
        }
        throw error
      }
    },
    [selectedTagIds, editingTagId, editTagName, editTagColor],
  )

  const createAndSelectTag = useCallback(
    async (createTag: (name: string, color: string) => Promise<string | null>) => {
      if (selectedTagIds.length >= maxTags) {
        return
      }

      const validationErrorKey = validateTagForm(newTagName, newTagColor)
      if (validationErrorKey) {
        setTagValidationErrorKey(validationErrorKey)
        return
      }

      const tagId = await createTag(newTagName.trim(), newTagColor)
      if (tagId) {
        setSelectedTagIds((prev) => (prev.length >= maxTags ? prev : [...prev, tagId]))
      }
      setNewTagName('')
      setShowNewTag(false)
      setNewTagColor(TAG_COLORS[0])
      setTagValidationErrorKey(null)
    },
    [maxTags, newTagColor, newTagName, selectedTagIds.length],
  )

  return {
    selectedTagIds,
    atTagLimit,
    tagValidationErrorKey,
    toggleTag,
    resetTags,
    showNewTag,
    setShowNewTag,
    newTagName,
    setNewTagName: handleSetNewTagName,
    newTagColor,
    setNewTagColor: handleSetNewTagColor,
    tagColors: TAG_COLORS,
    createAndSelectTag,
    editingTagId,
    editTagName,
    setEditTagName: handleSetEditTagName,
    editTagColor,
    setEditTagColor: handleSetEditTagColor,
    startEditTag,
    saveEditTag,
    cancelEditTag,
    deleteTag,
  }
}

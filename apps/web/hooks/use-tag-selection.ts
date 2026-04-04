'use client'

import { useState, useMemo, useCallback } from 'react'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TagSelectionState {
  // Selection state
  selectedTagIds: string[]
  atTagLimit: boolean
  toggleTag: (tagId: string) => void
  resetTags: (tagIds?: string[]) => void

  // New tag form
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

  // Edit tag
  editingTagId: string | null
  editTagName: string
  setEditTagName: (name: string) => void
  editTagColor: string
  setEditTagColor: (color: string) => void
  startEditTag: (tag: { id: string; name: string; color: string }) => void
  saveEditTag: (
    updateTag: (id: string, name: string, color: string) => Promise<void>,
  ) => Promise<void>
  cancelEditTag: () => void
  deleteTag: (
    tagId: string,
    deleteTagFn: (id: string) => Promise<void>,
  ) => Promise<void>
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Manages tag selection state for habit forms.
 * Operations that talk to the server (create, update, delete) accept
 * callback functions so this hook stays decoupled from the tags store/API.
 *
 * @param initialTagIds - Tag IDs to start with (for editing)
 * @param maxTags - Maximum number of tags allowed per habit
 */
export function useTagSelection(
  initialTagIds: string[] = [],
  maxTags = 5,
): TagSelectionState {
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([...initialTagIds])
  const [showNewTag, setShowNewTag] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState('#7c3aed')
  const [editingTagId, setEditingTagId] = useState<string | null>(null)
  const [editTagName, setEditTagName] = useState('')
  const [editTagColor, setEditTagColor] = useState('')

  const atTagLimit = useMemo(
    () => selectedTagIds.length >= maxTags,
    [selectedTagIds.length, maxTags],
  )

  const toggleTag = useCallback((tagId: string) => {
    setSelectedTagIds((prev) => {
      const idx = prev.indexOf(tagId)
      if (idx >= 0) {
        return prev.filter((id) => id !== tagId)
      }
      return [...prev, tagId]
    })
  }, [])

  const resetTags = useCallback((tagIds: string[] = []) => {
    setSelectedTagIds([...tagIds])
    setEditingTagId(null)
    setShowNewTag(false)
    setNewTagName('')
  }, [])

  const startEditTag = useCallback(
    (tag: { id: string; name: string; color: string }) => {
      setEditingTagId(tag.id)
      setEditTagName(tag.name)
      setEditTagColor(tag.color)
    },
    [],
  )

  const saveEditTag = useCallback(
    async (updateTag: (id: string, name: string, color: string) => Promise<void>) => {
      if (!editingTagId || !editTagName.trim()) return
      await updateTag(editingTagId, editTagName.trim(), editTagColor)
      setEditingTagId(null)
    },
    [editingTagId, editTagName, editTagColor],
  )

  const cancelEditTag = useCallback(() => {
    setEditingTagId(null)
  }, [])

  const deleteTag = useCallback(
    async (tagId: string, deleteTagFn: (id: string) => Promise<void>) => {
      setSelectedTagIds((prev) => prev.filter((id) => id !== tagId))
      if (editingTagId === tagId) setEditingTagId(null)
      await deleteTagFn(tagId)
    },
    [editingTagId],
  )

  const createAndSelectTag = useCallback(
    async (createTag: (name: string, color: string) => Promise<string | null>) => {
      if (!newTagName.trim()) return
      const id = await createTag(newTagName.trim(), newTagColor)
      if (id) {
        setSelectedTagIds((prev) => [...prev, id])
      }
      setNewTagName('')
      setShowNewTag(false)
    },
    [newTagName, newTagColor],
  )

  return {
    selectedTagIds,
    atTagLimit,
    toggleTag,
    resetTags,
    showNewTag,
    setShowNewTag,
    newTagName,
    setNewTagName,
    newTagColor,
    setNewTagColor,
    tagColors: TAG_COLORS,
    createAndSelectTag,
    editingTagId,
    editTagName,
    setEditTagName,
    editTagColor,
    setEditTagColor,
    startEditTag,
    saveEditTag,
    cancelEditTag,
    deleteTag,
  }
}

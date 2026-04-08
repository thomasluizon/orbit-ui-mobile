import { useState, useMemo, useCallback } from 'react'
import { toggleSelectedId } from '@orbit/shared/utils'

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
  maxTags = 10,
): TagSelectionState {
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([...initialTagIds])
  const [showNewTag, setShowNewTag] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState<string>(TAG_COLORS[0])
  const [editingTagId, setEditingTagId] = useState<string | null>(null)
  const [editTagName, setEditTagName] = useState('')
  const [editTagColor, setEditTagColor] = useState('')

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
  }, [])

  const startEditTag = useCallback((tag: EditableTag) => {
    setEditingTagId(tag.id)
    setEditTagName(tag.name)
    setEditTagColor(tag.color)
  }, [])

  const saveEditTag = useCallback(
    async (updateTag: (id: string, name: string, color: string) => Promise<void>) => {
      if (!editingTagId || !editTagName.trim()) {
        return
      }

      await updateTag(editingTagId, editTagName.trim(), editTagColor)
      setEditingTagId(null)
    },
    [editingTagId, editTagName, editTagColor],
  )

  const cancelEditTag = useCallback(() => {
    setEditingTagId(null)
    setEditTagName('')
    setEditTagColor('')
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
      } catch (error) {
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
      if (!newTagName.trim()) {
        return
      }

      const tagId = await createTag(newTagName.trim(), newTagColor)
      if (tagId) {
        setSelectedTagIds((prev) => [...prev, tagId])
      }
      setNewTagName('')
      setShowNewTag(false)
      setNewTagColor(TAG_COLORS[0])
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

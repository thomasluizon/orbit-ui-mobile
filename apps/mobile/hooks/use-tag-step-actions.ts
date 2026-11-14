import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { validateTagForm } from '@orbit/shared/validation'
import { extractBackendStatus, getFriendlyErrorMessage } from '@orbit/shared/utils'
import { useBackendFieldErrors } from '@/hooks/use-backend-field-errors'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { useCreateTag, useDeleteTag, useSuggestTags, useTags, useUpdateTag } from '@/hooks/use-tags'
import { useTagSuggestions } from '@/hooks/use-tag-suggestions'
import type { TagSelectionState } from '@/hooks/use-tag-selection'
import { captureError } from '@/lib/sentry'

interface TagStepRequest {
  title: string
  description: string
}

/** The tag mutations of the tag step. Each error stays beside its control, because a flow step has no toast to point at. */
export function useTagStepActions(tags: TagSelectionState, { title, description }: TagStepRequest) {
  const { t, i18n } = useTranslation()
  const translate = useCallback((key: string, values?: Record<string, string | number | Date>) => t(key, values), [t])
  const { tags: availableTags } = useTags()
  const createTag = useCreateTag()
  const updateTag = useUpdateTag()
  const deleteTag = useDeleteTag()
  const suggestTags = useSuggestTags()
  const pending = createTag.isPending || updateTag.isPending || deleteTag.isPending
  const newTagErrors = useBackendFieldErrors({ name: tags.newTagName }, { name: 'Name' })
  const editTagErrors = useBackendFieldErrors({ name: tags.editTagName }, { name: 'Name' })
  const [newTagHint, setNewTagHint] = useAccountScopedState<string | undefined>(undefined)
  const [editTagHint, setEditTagHint] = useAccountScopedState<string | undefined>(undefined)
  const [deleteError, setDeleteError] = useAccountScopedState<string | null>(null)
  const suggestions = useTagSuggestions({
    availableTags, title, description, language: i18n.language, disabled: pending || tags.atTagLimit,
    request: suggestTags.mutateAsync,
    accept: (suggestion) => tags.acceptSuggestedTag(suggestion, async (name, color) => (await createTag.mutateAsync({ name, color })).id),
  })

  const changeNewTagName = (name: string) => { setNewTagHint(undefined); tags.setNewTagName(name) }
  const changeEditTagName = (name: string) => { setEditTagHint(undefined); tags.setEditTagName(name) }
  const discardEditor = () => {
    newTagErrors.clearBackendErrors()
    editTagErrors.clearBackendErrors()
    setEditTagHint(undefined)
    tags.cancelEditTag()
  }

  async function createNewTag() {
    const validationError = validateTagForm(tags.newTagName, tags.newTagColor)
    if (validationError) { setNewTagHint(translate(validationError)); return }
    try {
      await tags.createAndSelectTag(async (name, color) => (await createTag.mutateAsync({ name, color })).id)
    } catch (error: unknown) {
      if (!newTagErrors.reportBackendErrors(error).handled) setNewTagHint(getFriendlyErrorMessage(error, translate, 'toast.errors.validation', 'tag'))
    }
  }

  async function saveEditedTag() {
    try {
      await tags.saveEditTag(async (id, name, color) => { await updateTag.mutateAsync({ tagId: id, name, color }) })
    } catch (error: unknown) {
      if (!editTagErrors.reportBackendErrors(error).handled) setEditTagHint(getFriendlyErrorMessage(error, translate, 'toast.errors.validation', 'tag'))
    }
  }

  async function deleteExistingTag(id: string) {
    setDeleteError(null)
    try {
      await tags.deleteTag(id, async (tagId) => { await deleteTag.mutateAsync(tagId) })
    } catch (error: unknown) {
      setDeleteError(getFriendlyErrorMessage(error, translate, 'toast.errors.unknown', 'tag'))
      if (extractBackendStatus(error) !== 409) captureError(error)
    }
  }

  return {
    availableTags,
    pending,
    creating: createTag.isPending,
    renaming: updateTag.isPending,
    suggestions,
    newTagError: newTagErrors.fieldErrors.name ?? newTagHint,
    newTagFocusRequest: newTagErrors.focusRequest,
    editTagError: editTagErrors.fieldErrors.name ?? editTagHint,
    editTagFocusRequest: editTagErrors.focusRequest,
    deleteError,
    changeNewTagName,
    changeEditTagName,
    discardEditor,
    createNewTag,
    saveEditedTag,
    deleteExistingTag,
  }
}

export type TagStepActions = ReturnType<typeof useTagStepActions>

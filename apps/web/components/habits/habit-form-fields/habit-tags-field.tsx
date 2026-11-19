'use client'

import * as Sentry from '@sentry/nextjs'
import { useCallback } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { createTagRequests, hasTagDraftChanges } from '@orbit/shared/hooks'
import { useAstraAllowanceCopy } from '@/hooks/use-astra-allowance-copy'
import { useAppToast } from '@/hooks/use-app-toast'
import { useBackendFieldErrors } from '@/hooks/use-backend-field-errors'
import { useCreateTag, useDeleteTag, useSuggestTags, useTags, useUpdateTag } from '@/hooks/use-tags'
import { useTagSuggestions } from '@/hooks/use-tag-suggestions'
import { useSubmitHold } from '@/hooks/use-submit-hold'
import type { TagSelectionState } from '@/hooks/use-tag-selection'
import { TagEditorRow } from './tag-editor-row'
import { TagPickerField } from './tag-picker-field'
import { TagSuggestions } from './tag-suggestions'

interface HabitTagEditorOptions {
  tags: TagSelectionState
  title: string
  description: string
}

/**
 * The tag state of a habit: requests, suggestions, the submit hold and the backend errors.
 * The always-mounted form calls it, so a collapse of "More details" keeps fetched suggestions and a held request.
 */
export function useHabitTagEditor({ tags, title, description }: HabitTagEditorOptions) {
  const t = useTranslations()
  const language = useLocale()
  const { showError } = useAppToast()
  const translate = useCallback((key: string, values?: Record<string, string | number | Date>) => t(key, values), [t])
  const newTagErrors = useBackendFieldErrors({ name: tags.newTagName }, { name: 'Name' })
  const editTagErrors = useBackendFieldErrors({ name: tags.editTagName }, { name: 'Name' })
  const { tags: availableTags = [] } = useTags()
  const initialTagName = availableTags.find(tag => tag.id === tags.editingTagId)?.name ?? ''
  const createTag = useCreateTag()
  const updateTag = useUpdateTag()
  const deleteTag = useDeleteTag()
  const tagSubmission = useSubmitHold()
  const tagMutationPending = tagSubmission.waiting || createTag.isPending || updateTag.isPending || deleteTag.isPending
  const suggestTags = useSuggestTags()
  const tagSuggestions = useTagSuggestions({
    availableTags,
    title, description, language, disabled: tagMutationPending || tags.atTagLimit,
    request: suggestTags.mutateAsync,
    accept: (suggestion) => tags.acceptSuggestedTag(suggestion, async (name, color) => (await createTag.mutateAsync({ name, color })).id),
  })

  const discardTagEditor = () => {
    newTagErrors.clearBackendErrors()
    editTagErrors.clearBackendErrors()
    tags.setNewTagName('')
    tags.setShowNewTag(false)
    tags.cancelEditTag()
  }

  const showHint = (message: string | null | undefined) => { if (message) showError(message) }
  const { createNewTag, saveEditedTag, deleteExistingTag } = createTagRequests({
    tags,
    translate,
    createTag: async (name, color) => (await createTag.mutateAsync({ name, color })).id,
    updateTag: async (tagId, name, color) => { await updateTag.mutateAsync({ tagId, name, color }) },
    deleteTag: async (tagId) => { await deleteTag.mutateAsync(tagId) },
    createHold: tagSubmission,
    renameHold: tagSubmission,
    newTagErrors,
    editTagErrors,
    setNewTagHint: showHint,
    setEditTagHint: showHint,
    setDeleteError: showHint,
    reportError: (error) => { Sentry.captureException(error) },
  })

  return {
    availableTags,
    initialTagName,
    editorDirty: hasTagDraftChanges(tags, initialTagName),
    newTagErrors,
    editTagErrors,
    submitting: tagSubmission.waiting,
    pending: tagMutationPending,
    suggestions: tagSuggestions,
    discardTagEditor,
    createNewTag,
    deleteExistingTag,
    saveEditedTag,
  }
}

export type HabitTagEditor = ReturnType<typeof useHabitTagEditor>

interface HabitTagsFieldProps {
  tags: TagSelectionState
  tagEditor: HabitTagEditor
}

/** The tag picker of a habit: select up to the limit, create, rename, delete, suggest and preview. */
export function HabitTagsField({ tags, tagEditor }: Readonly<HabitTagsFieldProps>) {
  const t = useTranslations()
  const allowanceText = useAstraAllowanceCopy()
  const { newTagErrors, editTagErrors, initialTagName, discardTagEditor } = tagEditor

  const editor = tags.showNewTag ? (
    <TagEditorRow
      error={newTagErrors.fieldErrors.name}
      focusRequest={newTagErrors.focusRequest}
      value={tags.newTagName}
      placeholder={t('habits.form.tagName')}
      pending={tagEditor.submitting}
      inputAriaLabel={t('habits.form.tagName')}
      cancelAriaLabel={t('common.cancel')}
      actionLabel={t('common.add')}
      onChange={tags.setNewTagName}
      onCommit={() => void tagEditor.createNewTag()}
      onCancel={discardTagEditor}
    />
  ) : tags.editingTagId ? (
    <TagEditorRow
      error={editTagErrors.fieldErrors.name}
      focusRequest={editTagErrors.focusRequest}
      initialValue={initialTagName} value={tags.editTagName}
      pending={tagEditor.submitting}
      inputAriaLabel={t('habits.form.tagName')}
      cancelAriaLabel={t('common.cancel')}
      actionLabel={t('common.save')}
      onChange={tags.setEditTagName}
      onCommit={() => void tagEditor.saveEditedTag()}
      onCancel={discardTagEditor}
    />
  ) : undefined

  return (
    <section>
      <TagPickerField editorDirty={tagEditor.editorDirty} onDiscardEditor={discardTagEditor} suggestions={<TagSuggestions translateError={allowanceText} suggestions={tagEditor.suggestions} atLimit={tags.atTagLimit} disabled={tagEditor.pending} />} tags={tagEditor.availableTags} selectedIds={tags.selectedTagIds} atLimit={tags.atTagLimit} disabled={tagEditor.pending} onToggle={tags.toggleTag} onCreate={() => tags.setShowNewTag(true)} onEdit={tags.startEditTag} onDelete={(id) => void tagEditor.deleteExistingTag(id)} editLabel={t('habits.form.editTag')} deleteLabel={t('habits.form.deleteTag')} editor={editor} />
      {tags.atTagLimit ? <p className="text-sm text-[var(--fg-3)]">{t('habits.form.tagLimit')}</p> : null}
    </section>
  )
}

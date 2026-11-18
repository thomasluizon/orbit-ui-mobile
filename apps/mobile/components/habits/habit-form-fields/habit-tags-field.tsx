import { useCallback, useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { hasTagDraftChanges } from '@orbit/shared/hooks'
import { extractBackendStatus, getFriendlyErrorMessage } from '@orbit/shared/utils'
import { validateTagForm } from '@orbit/shared/validation'
import { useAstraAllowanceCopy } from '@/hooks/use-astra-allowance-copy'
import { useAppToast } from '@/hooks/use-app-toast'
import { useBackendFieldErrors } from '@/hooks/use-backend-field-errors'
import { useCreateTag, useDeleteTag, useSuggestTags, useTags, useUpdateTag } from '@/hooks/use-tags'
import { useTagSuggestions } from '@/hooks/use-tag-suggestions'
import { useSubmitHold } from '@/hooks/use-submit-hold'
import type { TagSelectionState } from '@/hooks/use-tag-selection'
import { captureError } from '@/lib/sentry'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useHabitFormInteraction } from './habit-form-interaction'
import { createStyles as createFormStyles } from './styles'
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
  const { disabled, isDisabled } = useHabitFormInteraction()
  const { t, i18n } = useTranslation()
  const { showError } = useAppToast()
  const translate = useCallback((key: string, values?: Record<string, unknown>) => t(key, values), [t])
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
    title, description, language: i18n.language, disabled: disabled || tagMutationPending || tags.atTagLimit,
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

  function createNewTag() {
    if (isDisabled()) return
    return tagSubmission.run(async (startRequest) => {
      const validationError = validateTagForm(tags.newTagName, tags.newTagColor)
      if (validationError) {
        showError(translate(validationError))
        return 'stay'
      }
      startRequest()
      try {
        await tags.createAndSelectTag(async (name, color) => (await createTag.mutateAsync({ name, color })).id)
      } catch (error: unknown) {
        if (!newTagErrors.reportBackendErrors(error).handled) showError(getFriendlyErrorMessage(error, translate, 'toast.errors.validation', 'tag'))
      }
      return 'stay'
    })
  }

  async function deleteExistingTag(id: string) {
    try {
      await tags.deleteTag(id, async (tagId) => { await deleteTag.mutateAsync(tagId) })
    } catch (error: unknown) {
      showError(getFriendlyErrorMessage(error, translate, 'toast.errors.unknown', 'tag'))
      if (extractBackendStatus(error) !== 409) captureError(error)
    }
  }

  function saveEditedTag() {
    if (isDisabled()) return
    return tagSubmission.run(async (startRequest) => {
      startRequest()
      try {
        await tags.saveEditTag(async (id, name, color) => { await updateTag.mutateAsync({ tagId: id, name, color }) })
      } catch (error: unknown) {
        if (!editTagErrors.reportBackendErrors(error).handled) showError(getFriendlyErrorMessage(error, translate, 'toast.errors.validation', 'tag'))
      }
      return 'stay'
    })
  }

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
  const { disabled, guard } = useHabitFormInteraction()
  const { t } = useTranslation()
  const allowanceText = useAstraAllowanceCopy()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(() => createTokensV2(currentScheme, currentTheme), [currentScheme, currentTheme])
  const formStyles = useMemo(() => createFormStyles(tokens), [tokens])
  const { newTagErrors, editTagErrors, initialTagName, discardTagEditor } = tagEditor

  const editor = tags.showNewTag
    ? <TagEditorRow error={newTagErrors.fieldErrors.name} focusRequest={newTagErrors.focusRequest} value={tags.newTagName} placeholder={t('habits.form.tagName')} disabled={disabled} pending={tagEditor.submitting} inputAriaLabel={t('habits.form.tagName')} cancelAriaLabel={t('common.cancel')} actionLabel={t('common.add')} onChange={guard(tags.setNewTagName)} onCommit={() => void tagEditor.createNewTag()} onCancel={discardTagEditor} styles={formStyles} tokens={tokens} />
    : tags.editingTagId
      ? <TagEditorRow error={editTagErrors.fieldErrors.name} focusRequest={editTagErrors.focusRequest} initialValue={initialTagName} value={tags.editTagName} disabled={disabled} pending={tagEditor.submitting} inputAriaLabel={t('habits.form.tagName')} cancelAriaLabel={t('common.cancel')} actionLabel={t('common.save')} onChange={guard(tags.setEditTagName)} onCommit={() => void tagEditor.saveEditedTag()} onCancel={discardTagEditor} styles={formStyles} tokens={tokens} />
      : undefined

  return (
    <View>
      <TagPickerField editorDirty={tagEditor.editorDirty} onDiscardEditor={discardTagEditor} suggestions={<TagSuggestions translateError={allowanceText} suggestions={tagEditor.suggestions} atLimit={tags.atTagLimit} disabled={disabled || tagEditor.pending} />} tags={tagEditor.availableTags} selectedIds={tags.selectedTagIds} atLimit={tags.atTagLimit} disabled={disabled || tagEditor.pending} onToggle={guard(tags.toggleTag)} onCreate={() => tags.setShowNewTag(true)} onEdit={tags.startEditTag} onDelete={(id) => void tagEditor.deleteExistingTag(id)} editLabel={t('habits.form.editTag')} deleteLabel={t('habits.form.deleteTag')} editor={editor} />
      {tags.atTagLimit ? <Text style={[styles.hint, { color: tokens.fg3 }]}>{t('habits.form.tagLimit')}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  hint: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 21 },
})

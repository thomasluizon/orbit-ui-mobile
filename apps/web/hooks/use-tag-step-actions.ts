'use client'

import { useCallback } from 'react'
import * as Sentry from '@sentry/nextjs'
import { useLocale, useTranslations } from 'next-intl'
import { createTagRequests } from '@orbit/shared/hooks'
import { useBackendFieldErrors } from '@/hooks/use-backend-field-errors'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { useCreateTag, useDeleteTag, useSuggestTags, useTags, useUpdateTag } from '@/hooks/use-tags'
import { useTagSuggestions } from '@/hooks/use-tag-suggestions'
import { useSubmitHold } from '@/hooks/use-submit-hold'
import type { TagSelectionState } from '@/hooks/use-tag-selection'

interface TagStepRequest {
  title: string
  description: string
}

/** The tag mutations of the tag step. Each error stays beside its control, because a flow step has no toast to point at. */
export function useTagStepActions(tags: TagSelectionState, { title, description }: TagStepRequest) {
  const t = useTranslations()
  const language = useLocale()
  const translate = useCallback((key: string, values?: Record<string, string | number | Date>) => t(key, values), [t])
  const { tags: availableTags } = useTags()
  const createTag = useCreateTag()
  const updateTag = useUpdateTag()
  const deleteTag = useDeleteTag()
  const suggestTags = useSuggestTags()
  const createHold = useSubmitHold()
  const renameHold = useSubmitHold()
  const pending = createHold.waiting || renameHold.waiting || createTag.isPending || updateTag.isPending || deleteTag.isPending
  const newTagErrors = useBackendFieldErrors({ name: tags.newTagName }, { name: 'Name' })
  const editTagErrors = useBackendFieldErrors({ name: tags.editTagName }, { name: 'Name' })
  const [newTagHint, setNewTagHint] = useAccountScopedState<string | undefined>(undefined)
  const [editTagHint, setEditTagHint] = useAccountScopedState<string | undefined>(undefined)
  const [deleteError, setDeleteError] = useAccountScopedState<string | null>(null)
  const suggestions = useTagSuggestions({
    availableTags, title, description, language, disabled: pending || tags.atTagLimit,
    request: suggestTags.mutateAsync,
    accept: (suggestion) => tags.acceptSuggestedTag(suggestion, async (name, color) => (await createTag.mutateAsync({ name, color })).id),
  })

  const requests = createTagRequests({
    tags,
    translate,
    createTag: async (name, color) => (await createTag.mutateAsync({ name, color })).id,
    updateTag: async (tagId, name, color) => { await updateTag.mutateAsync({ tagId, name, color }) },
    deleteTag: async (tagId) => { await deleteTag.mutateAsync(tagId) },
    createHold,
    renameHold,
    newTagErrors,
    editTagErrors,
    setNewTagHint,
    setEditTagHint,
    setDeleteError,
    reportError: (error) => { Sentry.captureException(error) },
  })

  return {
    availableTags,
    pending,
    creating: createHold.waiting,
    renaming: renameHold.waiting,
    suggestions,
    newTagError: newTagErrors.fieldErrors.name ?? newTagHint,
    newTagFocusRequest: newTagErrors.focusRequest,
    editTagError: editTagErrors.fieldErrors.name ?? editTagHint,
    editTagFocusRequest: editTagErrors.focusRequest,
    deleteError,
    ...requests,
  }
}

export type TagStepActions = ReturnType<typeof useTagStepActions>

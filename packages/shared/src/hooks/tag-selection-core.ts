import type { SuggestedTag } from '../types/habit'
import { toggleSelectedId } from '../utils/habit-form-state'
import { validateTagForm } from '../validation/tag-form'

/**
 * Framework-agnostic tag-selection core shared by the web and mobile
 * `useTagSelection` hooks. The hooks own a single
 * `TagSelectionCoreState` container and delegate every transition and
 * async flow here; `applyState` mirrors React's functional `setState`.
 */

export const TAG_COLORS = [
  '#7f46f7',
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

export interface EditableTag {
  id: string
  name: string
  color: string
}

export interface TagSelectionCoreState {
  selectedTagIds: string[]
  showNewTag: boolean
  newTagName: string
  newTagColor: string
  editingTagId: string | null
  editTagName: string
  editTagColor: string
  tagValidationErrorKey: string | null
}

export type TagSelectionStateUpdater = (
  previous: TagSelectionCoreState,
) => TagSelectionCoreState

export type ApplyTagSelectionState = (updater: TagSelectionStateUpdater) => void

/** Builds the initial state; also serves as the `resetTags` target state. */
export function createInitialTagSelectionState(
  initialTagIds: string[] = [],
): TagSelectionCoreState {
  return {
    selectedTagIds: [...initialTagIds],
    showNewTag: false,
    newTagName: '',
    newTagColor: TAG_COLORS[0],
    editingTagId: null,
    editTagName: '',
    editTagColor: '',
    tagValidationErrorKey: null,
  }
}

/** True when the selection already holds the maximum number of tags. */
export function isTagSelectionAtLimit(
  state: TagSelectionCoreState,
  maxTags: number,
): boolean {
  return state.selectedTagIds.length >= maxTags
}

/** Toggles a tag id in or out of the selection. */
export function toggleTagSelection(
  state: TagSelectionCoreState,
  tagId: string,
): TagSelectionCoreState {
  return { ...state, selectedTagIds: toggleSelectedId(state.selectedTagIds, tagId) }
}

/** Enters edit mode for a tag, clearing any validation error. */
export function startTagEdit(
  state: TagSelectionCoreState,
  tag: EditableTag,
): TagSelectionCoreState {
  return {
    ...state,
    editingTagId: tag.id,
    editTagName: tag.name,
    editTagColor: tag.color,
    tagValidationErrorKey: null,
  }
}

/** Leaves edit mode and discards the edit drafts. */
export function cancelTagEdit(state: TagSelectionCoreState): TagSelectionCoreState {
  return {
    ...state,
    editingTagId: null,
    editTagName: '',
    editTagColor: '',
    tagValidationErrorKey: null,
  }
}

/** Updates the new-tag name draft, clearing any validation error. */
export function setNewTagNameDraft(
  state: TagSelectionCoreState,
  name: string,
): TagSelectionCoreState {
  return { ...state, newTagName: name, tagValidationErrorKey: null }
}

/** Updates the new-tag color draft, clearing any validation error. */
export function setNewTagColorDraft(
  state: TagSelectionCoreState,
  color: string,
): TagSelectionCoreState {
  return { ...state, newTagColor: color, tagValidationErrorKey: null }
}

/** Updates the edit-tag name draft, clearing any validation error. */
export function setEditTagNameDraft(
  state: TagSelectionCoreState,
  name: string,
): TagSelectionCoreState {
  return { ...state, editTagName: name, tagValidationErrorKey: null }
}

/** Updates the edit-tag color draft, clearing any validation error. */
export function setEditTagColorDraft(
  state: TagSelectionCoreState,
  color: string,
): TagSelectionCoreState {
  return { ...state, editTagColor: color, tagValidationErrorKey: null }
}

/**
 * Validates the new-tag drafts, creates the tag through the injected closure,
 * selects the created tag while honoring `maxTags`, and resets the drafts.
 * Skips entirely when the selection snapshot is already at the limit.
 */
export async function createAndSelectTagFlow(
  state: TagSelectionCoreState,
  maxTags: number,
  createTag: (name: string, color: string) => Promise<string | null>,
  applyState: ApplyTagSelectionState,
): Promise<void> {
  if (state.selectedTagIds.length >= maxTags) {
    return
  }

  const validationErrorKey = validateTagForm(state.newTagName, state.newTagColor)
  if (validationErrorKey) {
    applyState((previous) => ({ ...previous, tagValidationErrorKey: validationErrorKey }))
    return
  }

  const tagId = await createTag(state.newTagName.trim(), state.newTagColor)
  applyState((previous) => ({
    ...previous,
    selectedTagIds:
      tagId && previous.selectedTagIds.length < maxTags
        ? [...previous.selectedTagIds, tagId]
        : previous.selectedTagIds,
    newTagName: '',
    showNewTag: false,
    newTagColor: TAG_COLORS[0],
    tagValidationErrorKey: null,
  }))
}

/**
 * Accepts an AI-suggested tag: selects the existing tag id when the suggestion
 * resolves to one the user already has, otherwise creates the tag through the
 * injected closure and selects it. Honors `maxTags`, no-ops at the limit, and
 * never duplicates an already-selected id.
 */
export async function acceptSuggestedTagFlow(
  state: TagSelectionCoreState,
  maxTags: number,
  suggestion: SuggestedTag,
  createTag: (name: string, color: string) => Promise<string | null>,
  applyState: ApplyTagSelectionState,
): Promise<void> {
  if (state.selectedTagIds.length >= maxTags) {
    return
  }

  if (suggestion.isExisting && suggestion.id) {
    const existingId = suggestion.id
    applyState((previous) =>
      previous.selectedTagIds.includes(existingId) ||
      previous.selectedTagIds.length >= maxTags
        ? previous
        : { ...previous, selectedTagIds: [...previous.selectedTagIds, existingId] },
    )
    return
  }

  const tagId = await createTag(suggestion.name.trim(), suggestion.color)
  applyState((previous) => ({
    ...previous,
    selectedTagIds:
      tagId &&
      !previous.selectedTagIds.includes(tagId) &&
      previous.selectedTagIds.length < maxTags
        ? [...previous.selectedTagIds, tagId]
        : previous.selectedTagIds,
  }))
}

/**
 * Validates the edit drafts and persists them through the injected closure,
 * leaving edit mode on success. No-op when nothing is being edited.
 */
export async function saveEditTagFlow(
  state: TagSelectionCoreState,
  updateTag: (id: string, name: string, color: string) => Promise<void>,
  applyState: ApplyTagSelectionState,
): Promise<void> {
  if (!state.editingTagId) {
    return
  }

  const validationErrorKey = validateTagForm(state.editTagName, state.editTagColor)
  if (validationErrorKey) {
    applyState((previous) => ({ ...previous, tagValidationErrorKey: validationErrorKey }))
    return
  }

  await updateTag(state.editingTagId, state.editTagName.trim(), state.editTagColor)
  applyState((previous) => ({
    ...previous,
    editingTagId: null,
    tagValidationErrorKey: null,
  }))
}

/**
 * Optimistically deselects the tag (and leaves edit mode when it was being
 * edited), deletes it through the injected closure, and restores the previous
 * selection and edit state before rethrowing when the delete fails.
 */
export async function deleteTagFlow(
  state: TagSelectionCoreState,
  tagId: string,
  deleteTagFn: (id: string) => Promise<void>,
  applyState: ApplyTagSelectionState,
): Promise<void> {
  const previousSelectedTagIds = state.selectedTagIds
  const wasEditingDeletedTag = state.editingTagId === tagId
  const previousEditingState = wasEditingDeletedTag
    ? {
        id: tagId,
        name: state.editTagName,
        color: state.editTagColor,
      }
    : null

  applyState((previous) => ({
    ...previous,
    selectedTagIds: previous.selectedTagIds.filter((selectedId) => selectedId !== tagId),
    editingTagId: wasEditingDeletedTag ? null : previous.editingTagId,
  }))

  try {
    await deleteTagFn(tagId)
    applyState((previous) => ({ ...previous, tagValidationErrorKey: null }))
  } catch (error: unknown) {
    applyState((previous) => ({
      ...previous,
      selectedTagIds: previousSelectedTagIds,
      ...(previousEditingState
        ? {
            editingTagId: previousEditingState.id,
            editTagName: previousEditingState.name,
            editTagColor: previousEditingState.color,
          }
        : {}),
    }))
    throw error
  }
}

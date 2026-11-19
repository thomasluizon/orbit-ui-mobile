import { extractBackendStatus, getFriendlyErrorMessage } from '../utils/error-utils'
import { validateTagForm } from '../validation/tag-form'
import type { SubmitHold } from './submit-hold-core'

type Translate = Parameters<typeof getFriendlyErrorMessage>[1]

/** The part of the tag selection of the habit form that the tag requests write. */
export interface TagRequestSelection {
  newTagName: string
  newTagColor: string
  setNewTagName: (name: string) => void
  setEditTagName: (name: string) => void
  cancelEditTag: () => void
  createAndSelectTag: (createTag: (name: string, color: string) => Promise<string | null>) => Promise<void>
  saveEditTag: (updateTag: (id: string, name: string, color: string) => Promise<void>) => Promise<void>
  deleteTag: (tagId: string, deleteTagFn: (id: string) => Promise<void>) => Promise<void>
}

/** The backend errors of one name field. The field shows a mapped error itself. */
export interface TagNameErrors {
  reportBackendErrors: (error: unknown) => { handled: boolean }
  clearBackendErrors: () => void
}

/** The requests, holds, hint setters and the error report of each platform. */
export interface TagRequestInput {
  tags: TagRequestSelection
  translate: Translate
  createTag: (name: string, color: string) => Promise<string>
  updateTag: (tagId: string, name: string, color: string) => Promise<void>
  deleteTag: (tagId: string) => Promise<void>
  createHold: Pick<SubmitHold, 'run'>
  renameHold: Pick<SubmitHold, 'run'>
  newTagErrors: TagNameErrors
  editTagErrors: TagNameErrors
  setNewTagHint: (hint: string | undefined) => void
  setEditTagHint: (hint: string | undefined) => void
  setDeleteError: (error: string | null) => void
  reportError: (error: unknown) => void
}

export interface TagRequests {
  changeNewTagName: (name: string) => void
  changeEditTagName: (name: string) => void
  discardEditor: () => void
  createNewTag: () => Promise<void>
  saveEditedTag: () => Promise<void>
  deleteExistingTag: (id: string) => Promise<void>
}

/**
 * The tag create, rename and delete requests of the tag step and of the habit form. A mapped backend error shows on
 * its name field. Any other error goes to the setter of its control: the tag step shows it beside the control, because
 * a flow step has no toast to point at, and the form shows it as a toast. A refused delete of a tag in use (409) is an
 * expected answer, so only another delete failure goes to the error report.
 */
export function createTagRequests(input: TagRequestInput): TagRequests {
  const { tags, translate, newTagErrors, editTagErrors, setNewTagHint, setEditTagHint, setDeleteError } = input
  const hintOf = (error: unknown) => getFriendlyErrorMessage(error, translate, 'toast.errors.validation', 'tag')

  return {
    changeNewTagName: (name) => { setNewTagHint(undefined); tags.setNewTagName(name) },
    changeEditTagName: (name) => { setEditTagHint(undefined); tags.setEditTagName(name) },
    discardEditor: () => {
      newTagErrors.clearBackendErrors()
      editTagErrors.clearBackendErrors()
      setEditTagHint(undefined)
      tags.cancelEditTag()
    },
    createNewTag: () => input.createHold.run(async (startRequest) => {
      const validationError = validateTagForm(tags.newTagName, tags.newTagColor)
      if (validationError) { setNewTagHint(translate(validationError)); return 'stay' }
      startRequest()
      try {
        await tags.createAndSelectTag((name, color) => input.createTag(name, color))
      } catch (error: unknown) {
        if (!newTagErrors.reportBackendErrors(error).handled) setNewTagHint(hintOf(error))
      }
      return 'stay'
    }),
    saveEditedTag: () => input.renameHold.run(async (startRequest) => {
      startRequest()
      try {
        await tags.saveEditTag((id, name, color) => input.updateTag(id, name, color))
      } catch (error: unknown) {
        if (!editTagErrors.reportBackendErrors(error).handled) setEditTagHint(hintOf(error))
      }
      return 'stay'
    }),
    deleteExistingTag: async (id) => {
      setDeleteError(null)
      try {
        await tags.deleteTag(id, (tagId) => input.deleteTag(tagId))
      } catch (error: unknown) {
        setDeleteError(getFriendlyErrorMessage(error, translate, 'toast.errors.unknown', 'tag'))
        if (extractBackendStatus(error) !== 409) input.reportError(error)
      }
    },
  }
}

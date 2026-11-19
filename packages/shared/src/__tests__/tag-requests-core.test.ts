import { describe, expect, it, vi } from 'vitest'
import { createTagRequests, type TagRequestInput } from '../hooks/tag-requests-core'

const translate = (key: string) => `t:${key}`
const failure = (status: number) => Object.assign(new Error('The tag request failed.'), { status })

function setup(overrides: Partial<TagRequestInput> = {}, draft = { name: 'Health', color: '#C4530F' }) {
  const started: string[] = []
  const outcomes: Array<'leave' | 'stay'> = []
  const hold = (name: string) => ({ run: vi.fn(async (submit: (startRequest: () => void) => Promise<'leave' | 'stay'>) => { outcomes.push(await submit(() => started.push(name))) }) })
  const fieldErrors = (handled: boolean) => ({ reportBackendErrors: vi.fn(() => ({ handled })), clearBackendErrors: vi.fn() })
  const tags = {
    newTagName: draft.name,
    newTagColor: draft.color,
    setNewTagName: vi.fn(),
    setEditTagName: vi.fn(),
    cancelEditTag: vi.fn(),
    createAndSelectTag: vi.fn(async (create: (name: string, color: string) => Promise<string | null>) => { await create(draft.name, draft.color) }),
    saveEditTag: vi.fn(async (update: (id: string, name: string, color: string) => Promise<void>) => { await update('tag-1', 'Sport', '#dc2626') }),
    deleteTag: vi.fn(async (id: string, remove: (id: string) => Promise<void>) => { await remove(id) }),
  }
  const input: TagRequestInput = {
    tags,
    translate,
    createTag: vi.fn(async () => 'tag-new'),
    updateTag: vi.fn(async () => {}),
    deleteTag: vi.fn(async () => {}),
    createHold: hold('create'),
    renameHold: hold('rename'),
    newTagErrors: fieldErrors(false),
    editTagErrors: fieldErrors(false),
    setNewTagHint: vi.fn(),
    setEditTagHint: vi.fn(),
    setDeleteError: vi.fn(),
    reportError: vi.fn(),
    ...overrides,
  }
  return { input, tags, started, outcomes, requests: createTagRequests(input) }
}

describe('tag step requests', () => {
  it('creates and selects a valid new tag, with the waiting face from the request start', async () => {
    const { input, started, outcomes, requests } = setup()
    await requests.createNewTag()
    expect(input.createTag).toHaveBeenCalledWith('Health', '#C4530F')
    expect(started).toEqual(['create'])
    expect(outcomes, 'the step stays open after a create').toEqual(['stay'])
    expect(input.setNewTagHint).not.toHaveBeenCalled()
  })

  it('keeps an empty name on the field with its hint and sends no request', async () => {
    const { input, started, outcomes, requests } = setup({}, { name: '   ', color: '#C4530F' })
    await requests.createNewTag()
    expect(input.setNewTagHint).toHaveBeenCalledWith('t:habits.form.tagNameRequired')
    expect(input.createTag).not.toHaveBeenCalled()
    expect(started, 'no waiting face for a refused draft').toEqual([])
    expect(outcomes).toEqual(['stay'])
  })

  it('shows a create failure the field cannot map as the hint of the field, and a mapped one on the field only', async () => {
    const serverError = failure(500)
    const unmapped = setup({ createTag: vi.fn(async () => { throw serverError }) })
    await unmapped.requests.createNewTag()
    expect(unmapped.input.setNewTagHint).toHaveBeenCalledWith('t:toast.errors.server')
    expect(unmapped.input.setEditTagHint).not.toHaveBeenCalled()
    expect(unmapped.outcomes).toEqual(['stay'])

    const refusedName = failure(400)
    const refused = setup({ createTag: vi.fn(async () => { throw refusedName }) })
    await refused.requests.createNewTag()
    expect(refused.input.setNewTagHint, 'a refusal with no more exact text takes the validation text').toHaveBeenCalledWith('t:toast.errors.validation')

    const mapped = setup({ createTag: vi.fn(async () => { throw serverError }), newTagErrors: { reportBackendErrors: vi.fn(() => ({ handled: true })), clearBackendErrors: vi.fn() } })
    await mapped.requests.createNewTag()
    expect(mapped.input.newTagErrors.reportBackendErrors).toHaveBeenCalledWith(serverError)
    expect(mapped.input.editTagErrors.reportBackendErrors).not.toHaveBeenCalled()
    expect(mapped.input.setNewTagHint).not.toHaveBeenCalled()
    expect(mapped.outcomes).toEqual(['stay'])
  })

  it('renames a tag, shows a rename failure the field cannot map as the hint of the rename field, and a mapped one on the rename field only', async () => {
    const saved = setup()
    await saved.requests.saveEditedTag()
    expect(saved.input.updateTag).toHaveBeenCalledWith('tag-1', 'Sport', '#dc2626')
    expect(saved.started).toEqual(['rename'])
    expect(saved.outcomes, 'the step stays open after a rename').toEqual(['stay'])

    const serverError = failure(500)
    const failed = setup({ updateTag: vi.fn(async () => { throw serverError }) })
    await failed.requests.saveEditedTag()
    expect(failed.input.setEditTagHint).toHaveBeenCalledWith('t:toast.errors.server')
    expect(failed.input.setNewTagHint).not.toHaveBeenCalled()
    expect(failed.outcomes).toEqual(['stay'])

    const refusedName = failure(400)
    const refused = setup({ updateTag: vi.fn(async () => { throw refusedName }) })
    await refused.requests.saveEditedTag()
    expect(refused.input.setEditTagHint, 'a refusal with no more exact text takes the validation text').toHaveBeenCalledWith('t:toast.errors.validation')

    const mapped = setup({ updateTag: vi.fn(async () => { throw serverError }), editTagErrors: { reportBackendErrors: vi.fn(() => ({ handled: true })), clearBackendErrors: vi.fn() } })
    await mapped.requests.saveEditedTag()
    expect(mapped.input.editTagErrors.reportBackendErrors).toHaveBeenCalledWith(serverError)
    expect(mapped.input.newTagErrors.reportBackendErrors).not.toHaveBeenCalled()
    expect(mapped.input.setEditTagHint).not.toHaveBeenCalled()
    expect(mapped.input.setNewTagHint).not.toHaveBeenCalled()
    expect(mapped.outcomes).toEqual(['stay'])
  })

  it('clears the old delete error, shows a refused delete beside the row, and reports only an unexpected failure', async () => {
    const deleted = setup()
    await deleted.requests.deleteExistingTag('tag-1')
    expect(deleted.input.deleteTag).toHaveBeenCalledWith('tag-1')
    expect(deleted.input.setDeleteError).toHaveBeenCalledTimes(1)
    expect(deleted.input.setDeleteError).toHaveBeenCalledWith(null)

    const inUse = failure(409)
    const refused = setup({ deleteTag: vi.fn(async () => { throw inUse }) })
    await refused.requests.deleteExistingTag('tag-1')
    expect(refused.input.setDeleteError).toHaveBeenLastCalledWith('t:toast.errors.unknown')
    expect(refused.input.reportError, 'a tag in use is an expected answer').not.toHaveBeenCalled()

    const broken = failure(500)
    const failed = setup({ deleteTag: vi.fn(async () => { throw broken }) })
    await failed.requests.deleteExistingTag('tag-1')
    expect(failed.input.reportError).toHaveBeenCalledWith(broken)
  })

  it('clears the hint of a name when the person types, and clears every error when the editor closes', () => {
    const { input, tags, requests } = setup()
    requests.changeNewTagName('Heal')
    expect(input.setNewTagHint).toHaveBeenCalledWith(undefined)
    expect(tags.setNewTagName).toHaveBeenCalledWith('Heal')
    requests.changeEditTagName('Spo')
    expect(input.setEditTagHint).toHaveBeenCalledWith(undefined)
    expect(tags.setEditTagName).toHaveBeenCalledWith('Spo')
    requests.discardEditor()
    expect(input.newTagErrors.clearBackendErrors).toHaveBeenCalledTimes(1)
    expect(input.editTagErrors.clearBackendErrors).toHaveBeenCalledTimes(1)
    expect(tags.cancelEditTag).toHaveBeenCalledTimes(1)
  })
})

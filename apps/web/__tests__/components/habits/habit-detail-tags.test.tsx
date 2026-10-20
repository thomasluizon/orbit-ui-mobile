import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeHabitDetailScopedParent } from '@orbit/shared/test-support/habit-detail-fixtures'
import { HabitDetailTags } from '@/components/habits/habit-detail-tags'
import type { TagPickerField } from '@/components/habits/habit-form-fields/tag-picker-field'
import type { TagEditorRow } from '@/components/habits/habit-form-fields/tag-editor-row'

const mocks = vi.hoisted(() => ({
  create: vi.fn(), update: vi.fn(), assign: vi.fn(), remove: vi.fn(), showError: vi.fn(),
  pending: false,
  picker: vi.fn(), editor: vi.fn(),
}))

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/hooks/use-tags', () => ({
  useTags: () => ({ tags: makeHabitDetailScopedParent().tags }),
  useCreateTag: () => ({ mutateAsync: mocks.create, isPending: mocks.pending }),
  useUpdateTag: () => ({ mutateAsync: mocks.update, isPending: false }),
  useDeleteTag: () => ({ mutateAsync: mocks.remove, isPending: false }),
  useAssignTags: () => ({ mutateAsync: mocks.assign, isPending: false }),
}))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: mocks.showError }) }))
vi.mock('@/components/habits/habit-form-fields/tag-picker-field', () => ({
  TagPickerField: (props: Parameters<typeof TagPickerField>[0]) => { mocks.picker(props); return props.editor ?? null },
}))
vi.mock('@/components/habits/habit-form-fields/tag-editor-row', () => ({
  TagEditorRow: (props: Parameters<typeof TagEditorRow>[0]) => { mocks.editor(props); return null },
}))

let tree: ReactTestRenderer
const habit = makeHabitDetailScopedParent()
const tag = habit.tags[0]!
const picker = (): Parameters<typeof TagPickerField>[0] => mocks.picker.mock.calls.at(-1)![0]
const editor = (): Parameters<typeof TagEditorRow>[0] => mocks.editor.mock.calls.at(-1)![0]

beforeEach(() => {
  vi.clearAllMocks()
  mocks.pending = false
  mocks.create.mockReset().mockResolvedValue({ ...tag, id: 'new-tag' })
  mocks.update.mockReset().mockResolvedValue(undefined)
  mocks.assign.mockReset().mockResolvedValue(undefined)
  mocks.remove.mockReset().mockResolvedValue(undefined)
  act(() => { tree = create(<HabitDetailTags habit={habit} />) })
})
afterEach(() => act(() => tree.unmount()))

describe('habit detail tag editing', () => {
  it('assigns and removes selections while retaining the other selected tags', async () => {
    await act(async () => { picker().onToggle('another-tag'); await Promise.resolve() })
    expect(mocks.assign).toHaveBeenLastCalledWith({ habitId: habit.id, tagIds: [...habit.tags.map((selected) => selected.id), 'another-tag'] })
    await act(async () => { picker().onToggle(tag.id); await Promise.resolve() })
    expect(mocks.assign).toHaveBeenLastCalledWith({ habitId: habit.id, tagIds: habit.tags.filter((selected) => selected.id !== tag.id).map((selected) => selected.id) })
  })

  it('keeps an invalid new tag open and closes after creating and assigning a valid tag', async () => {
    act(() => picker().onCreate())
    await act(async () => { editor().onCommit(); await Promise.resolve() })
    expect(mocks.showError).toHaveBeenCalledWith('habits.form.tagNameRequired')
    expect(mocks.create).not.toHaveBeenCalled()
    expect(picker().editor).toBeTruthy()
    act(() => editor().onChange('  Focus  '))
    await act(async () => { editor().onCommit(); await Promise.resolve() })
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Focus' }))
    expect(mocks.assign).toHaveBeenCalledWith({ habitId: habit.id, tagIds: [...habit.tags.map((selected) => selected.id), 'new-tag'] })
    expect(picker().editor).toBeUndefined()
  })

  it('edits, cancels and deletes an existing tag', async () => {
    act(() => picker().onEdit(tag))
    expect(editor().value).toBe(tag.name)
    act(() => editor().onChange('Renamed'))
    await act(async () => { editor().onCommit(); await Promise.resolve() })
    expect(mocks.update).toHaveBeenCalledWith({ tagId: tag.id, name: 'Renamed', color: tag.color })
    act(() => picker().onEdit(tag))
    act(() => editor().onCancel())
    expect(picker().editor).toBeUndefined()
    await act(async () => { picker().onDelete(tag.id); await Promise.resolve() })
    expect(mocks.remove).toHaveBeenCalledWith(tag.id)
  })

  it('reports failures and preserves an editor when saving fails', async () => {
    mocks.assign.mockRejectedValue(new Error('Assignment failed'))
    await act(async () => { picker().onToggle('another-tag'); await Promise.resolve() })
    expect(mocks.showError).toHaveBeenCalledOnce()
    mocks.remove.mockRejectedValue(new Error('Delete failed'))
    await act(async () => { picker().onDelete(tag.id); await Promise.resolve() })
    expect(mocks.showError).toHaveBeenCalledTimes(2)
    mocks.update.mockRejectedValue(new Error('Update failed'))
    act(() => picker().onEdit(tag))
    await act(async () => { editor().onCommit(); await Promise.resolve() })
    expect(mocks.showError).toHaveBeenCalledTimes(3)
    expect(picker().editor).toBeTruthy()
  })

  it('disables the picker and editor while a tag write is pending', () => {
    mocks.pending = true
    act(() => tree.update(<HabitDetailTags habit={habit} />))
    expect(picker().disabled).toBe(true)
    act(() => picker().onEdit(tag))
    expect(editor().disabled).toBe(true)
  })
})

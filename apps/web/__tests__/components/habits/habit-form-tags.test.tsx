import * as Sentry from '@sentry/nextjs'
import { createApiClientError } from '@orbit/shared/utils'
import { tagCollection, modalFeedback, tagMutations, formLocale, createFormHelpers, renderForm } from '@/__tests__/support/habit-form-fields'
import { advanceAccountGeneration } from '@/lib/session-epoch'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HabitFormFields } from '@/components/habits/habit-form-fields'
import { useTagSelection } from '@/hooks/use-tag-selection'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

it('keeps rejected tag Name validation beside its input in the owning habit editor', async () => {
  tagMutations.create.mockRejectedValue({ errors: { Name: ['Tag must have at most 50 characters'] } })
  const helpers = createFormHelpers()
  function OwningForm() {
    const tags = useTagSelection()
    return <HabitFormFields formHelpers={helpers} tags={tags} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} defaultExpanded />
  }
  render(<OwningForm />)
  fireEvent.click(screen.getByRole('button', { name: /^habits.form.tags/ }))
  fireEvent.click(screen.getByRole('button', { name: 'habits.form.newTag' }))
  const input = screen.getByRole('textbox', { name: 'habits.form.tagName' })
  fireEvent.change(input, { target: { value: 'Health' } })
  fireEvent.click(screen.getByRole('button', { name: 'common.add' }))
  await waitFor(() => {
    expect(input).toHaveAccessibleDescription('Tag must have at most 50 characters')
    expect(input).toHaveFocus()
  })
  await act(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  })
  expect(input).toHaveAttribute('aria-invalid', 'true')
  expect(input).toHaveFocus()
  expect(input).toHaveValue('Health')
  expect(screen.getByRole('dialog', { name: 'habits.form.tags' })).toBeInTheDocument()
  expect(screen.getByText('Tag must have at most 50 characters')).not.toHaveAttribute('role', 'alert')
  const commit = screen.getByRole('button', { name: 'common.add' })
  commit.focus()
  fireEvent.click(commit)
  await waitFor(() => {
    expect(input).toHaveFocus()
    expect(tagMutations.create).toHaveBeenCalledTimes(2)
  })
  expect(input).toHaveValue('Health')
  fireEvent.change(input, { target: { value: 'Updated' } })
  expect(input).not.toHaveAttribute('aria-invalid')
  expect(input).not.toHaveAccessibleDescription()
  tagMutations.create.mockResolvedValueOnce({ id: 'tag-created' })
  fireEvent.click(commit)
  await waitFor(() => expect(screen.queryByRole('textbox', { name: 'habits.form.tagName' })).toBeNull())
  expect(tagMutations.create).toHaveBeenLastCalledWith({ name: 'Updated', color: expect.any(String) })
  expect(screen.getByText('habits.form.selectedCount:{"count":1}')).toBeInTheDocument()
})

it('exposes tag suggestions from the owning habit form', () => {
  renderForm(createFormHelpers({ title: 'Run', description: 'Outside' }), undefined, true)
  fireEvent.click(screen.getByRole('button', { name: /^habits.form.tags/ }))
  const action = screen.getByRole('button', { name: 'habits.form.suggestTags' })
  expect(action).toBeEnabled()
  expect(action.textContent).toBe('')
  expect(action.style.width).toBe('48px')
})

describe('habit tag suggestions', () => {
  function renderTagForm(title = ' Run ', description = ' Outside ', initialIds: string[] = []) {
    const helpers = createFormHelpers({ title, description })
    function OwningForm() {
      const tags = useTagSelection(initialIds)
      return <><output aria-label="Selected tags">{tags.selectedTagIds.join(',')}</output><HabitFormFields formHelpers={helpers} tags={tags} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} defaultExpanded /></>
    }
    const view = render(<OwningForm />)
    fireEvent.click(screen.getByRole('button', { name: /^habits.form.tags/ }))
    return { ...view, helpers, refresh: () => view.rerender(<OwningForm />) }
  }

  beforeEach(() => {
    tagCollection.tags = []
    tagMutations.suggest.mockReset()
    tagMutations.create.mockReset()
    tagMutations.delete.mockReset()
    formLocale.language = 'en'
  })

  it.each([409, 500])('handles rejected tag deletion status %i and restores the selection', async (status) => {
    tagCollection.tags = [{ id: 'existing', name: 'Health', color: '#7c3aed' }]
    const failure = createApiClientError(status, status === 409 ? { errorCode: 'CONCURRENT_UPDATE_CONFLICT' } : null, 'Failed')
    tagMutations.delete.mockRejectedValue(failure)
    modalFeedback.showError.mockClear()
    vi.mocked(Sentry.captureException).mockClear()
    renderTagForm('Read', '', ['existing'])
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'habits.form.deleteTag: Health' })) })
    await waitFor(() => expect(modalFeedback.showError).toHaveBeenCalledWith(status === 409 ? 'toast.errors.conflict' : 'toast.errors.server'))
    expect(screen.getByLabelText('Selected tags')).toHaveTextContent('existing')
    expect(tagMutations.delete).toHaveBeenCalledExactlyOnceWith('existing')
    expect(Sentry.captureException).toHaveBeenCalledTimes(status === 500 ? 1 : 0)
  })

  it.each(['settled', 'pending'])('rejects a deleted existing proposal from a %s request while keeping other proposals', async (phase) => {
    tagCollection.tags = [
      { id: 'existing', name: 'Health', color: '#7c3aed' },
      { id: 'outdoors', name: 'Outdoors', color: '#7c3aed' },
    ]
    let complete!: (response: { tags: { name: string; color: string; isExisting: boolean; id: string | null }[] }) => void
    tagMutations.suggest.mockImplementation(() => new Promise((resolve) => { complete = resolve }))
    const proposals = { tags: [
      { ...tagCollection.tags[0]!, isExisting: true },
      { ...tagCollection.tags[1]!, isExisting: true },
      { name: 'Reading', color: '#7c3aed', isExisting: false, id: null },
    ] }
    const view = renderTagForm()
    tagMutations.delete.mockImplementation((id: string) => {
      tagCollection.tags = tagCollection.tags.filter((tag) => tag.id !== id)
      view.refresh()
      return Promise.resolve()
    })
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.suggestTags' }))
    if (phase === 'settled') await act(async () => complete(proposals))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'habits.form.deleteTag: Health' })) })
    expect(tagMutations.delete).toHaveBeenCalledWith('existing')
    if (phase === 'pending') await act(async () => complete(proposals))
    const staleProposal = screen.queryByRole('button', { name: 'Health', pressed: false })
    if (staleProposal) await act(async () => { fireEvent.click(staleProposal) })
    expect(screen.getByLabelText('Selected tags')).toBeEmptyDOMElement()
    expect(screen.queryByRole('button', { name: 'Health', pressed: false })).toBeNull()
    await act(async () => {
      fireEvent.click(within(screen.getByRole('group', { name: 'habits.form.suggestedTagsLabel' })).getByRole('button', { name: 'Outdoors', pressed: false }))
    })
    await waitFor(() => {
      expect(screen.getByLabelText('Selected tags')).toHaveTextContent('outdoors')
      expect(screen.getByRole('button', { name: 'Reading', pressed: false })).toBeEnabled()
      expect(screen.getByRole('status', { name: 'habits.form.suggestTags' })).toHaveTextContent('habits.form.suggestedTagsLabel')
    })
    tagMutations.create.mockResolvedValue({ id: 'created' })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Reading', pressed: false })) })
    await waitFor(() => expect(screen.getByLabelText('Selected tags')).toHaveTextContent('outdoors,created'))
    expect(tagMutations.suggest).toHaveBeenCalledTimes(1)
    expect(tagMutations.create).toHaveBeenCalledWith({ name: 'Reading', color: '#7c3aed' })
  })

  it.each(['settled', 'pending', 'error'])('preserves %s suggestion state across tag search changes', async (phase) => {
    tagCollection.tags = Array.from({ length: 25 }, (_, index) => ({ id: `tag-${index}`, name: `Tag ${index}`, color: '#000000' }))
    let complete!: (response: { tags: { name: string; color: string; isExisting: boolean; id: null }[] }) => void
    tagMutations.suggest.mockImplementation(() => new Promise((resolve) => { complete = resolve }))
    if (phase === 'error') tagMutations.suggest.mockRejectedValueOnce(new Error('Unavailable'))
    renderTagForm()
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.suggestTags' }))
    const proposals = { tags: [{ name: 'Reading', color: '#000000', isExisting: false, id: null }] }
    if (phase === 'settled') await act(async () => complete(proposals))
    if (phase === 'error') expect(await screen.findByRole('alert')).toHaveTextContent('habits.form.suggestTagsError')
    fireEvent.change(screen.getByRole('textbox', { name: 'habits.form.searchTags' }), { target: { value: 'Tag 24' } })
    if (phase === 'pending') {
      expect(screen.getByRole('button', { name: 'habits.form.suggestTags' })).toBeDisabled()
      expect(screen.getByRole('status', { name: 'habits.form.suggestTags' })).toHaveTextContent('habits.form.suggestingTags')
      await act(async () => complete(proposals))
    }
    if (phase === 'error') expect(screen.getByRole('alert')).toHaveTextContent('habits.form.suggestTagsError')
    else expect(await screen.findByRole('button', { name: 'Reading', pressed: false })).toBeEnabled()
    expect(tagMutations.suggest).toHaveBeenCalledTimes(1)
  })

  it.each(['success', 'failure'])('preserves proposals and acceptance status across optimistic virtualization: %s', async (outcome) => {
    tagCollection.tags = Array.from({ length: 20 }, (_, index) => ({ id: `tag-${index}`, name: `Tag ${index}`, color: '#000000' }))
    tagMutations.suggest.mockResolvedValue({ tags: [
      { name: 'Reading', color: '#000000', isExisting: false, id: null },
      { name: 'Outdoors', color: '#000000', isExisting: false, id: null },
    ] })
    const view = renderTagForm()
    let complete!: (response: { id: string }) => void
    let fail!: (error: Error) => void
    tagMutations.create.mockImplementation(() => {
      tagCollection.tags = [...tagCollection.tags, { id: 'optimistic', name: 'Reading', color: '#000000' }]
      view.refresh()
      return new Promise((resolve, reject) => { complete = resolve; fail = reject })
    })
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.suggestTags' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Reading', pressed: false }))
    expect(screen.getByRole('textbox', { name: 'habits.form.searchTags' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Outdoors', pressed: false })).toBeDisabled()
    expect(screen.getByRole('status', { name: 'habits.form.suggestTags' })).toHaveTextContent('common.loading')
    expect(screen.getByRole('button', { name: 'habits.form.suggestTags' })).toBeDisabled()
    if (outcome === 'success') {
      await act(async () => complete({ id: 'created' }))
      expect(screen.getByLabelText('Selected tags')).toHaveTextContent('created')
      expect(screen.queryByRole('button', { name: 'Reading', pressed: false })).toBeNull()
    } else {
      await act(async () => {
        tagCollection.tags = tagCollection.tags.slice(0, 20)
        view.refresh()
        fail(new Error('Unavailable'))
      })
      expect(screen.getByLabelText('Selected tags')).toHaveTextContent('')
      expect(screen.getByRole('button', { name: 'Reading', pressed: false })).toBeEnabled()
      expect(screen.getByRole('alert')).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'Outdoors', pressed: false })).toBeEnabled()
    expect(tagMutations.suggest).toHaveBeenCalledTimes(1)
  })

  it('requests proposals with trimmed context and accepts existing and new tags only on selection', async () => {
    tagCollection.tags = [{ id: 'existing', name: 'Health', color: '#7c3aed' }]
    tagMutations.suggest.mockResolvedValue({ tags: [
      { name: 'Health', color: '#7c3aed', isExisting: true, id: 'existing' },
      { name: 'Reading', color: '#7c3aed', isExisting: false, id: null },
    ] })
    tagMutations.create.mockResolvedValue({ id: 'created' })
    renderTagForm()
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.suggestTags' }))
    expect(await screen.findByRole('group', { name: 'habits.form.suggestedTagsLabel' })).toHaveAttribute('data-proposed')
    expect(tagMutations.suggest).toHaveBeenCalledWith({ title: 'Run', description: 'Outside', language: 'en' })
    expect(screen.getByLabelText('Selected tags')).toHaveTextContent('')
    expect(tagMutations.create).not.toHaveBeenCalled()
    fireEvent.click(within(screen.getByRole('group', { name: 'habits.form.suggestedTagsLabel' })).getByRole('button', { name: 'Health', pressed: false }))
    await waitFor(() => expect(screen.getByLabelText('Selected tags')).toHaveTextContent('existing'))
    expect(tagMutations.create).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Reading', pressed: false }))
    await waitFor(() => expect(screen.getByLabelText('Selected tags')).toHaveTextContent('existing,created'))
    expect(tagMutations.create).toHaveBeenCalledWith({ name: 'Reading', color: '#7c3aed' })
    expect(screen.queryByRole('group', { name: 'habits.form.suggestedTagsLabel' })).toBeNull()
  })

  it('preserves the action label while loading and announces an empty result', async () => {
    let resolve!: (response: { tags: [] }) => void
    tagMutations.suggest.mockImplementation(() => new Promise((complete) => { resolve = complete }))
    formLocale.language = 'pt-BR'
    renderTagForm('Run', '   ')
    const action = screen.getByRole('button', { name: 'habits.form.suggestTags' })
    expect(screen.getByRole('dialog', { name: 'habits.form.tags' }).querySelector('[data-asset^="astra-mark"]')).toHaveAttribute('aria-hidden', 'true')
    fireEvent.click(action)
    expect(action).toBeDisabled()
    expect(action).toHaveAttribute('aria-busy', 'true')
    expect(action).toHaveAttribute('data-borderless', 'true')
    expect(action.querySelector('[data-asset^="astra-mark"]')).toBeNull()
    expect(action.querySelectorAll('svg')).toHaveLength(1)
    expect(action).toHaveAccessibleDescription('habits.form.suggestingTags')
    expect(within(screen.getByRole('dialog', { name: 'habits.form.tags' })).getByRole('status', { name: 'habits.form.suggestTags' })).toHaveTextContent('habits.form.suggestingTags')
    fireEvent.click(action)
    expect(tagMutations.suggest).toHaveBeenCalledTimes(1)
    expect(tagMutations.suggest).toHaveBeenCalledWith({ title: 'Run', description: null, language: 'pt-BR' })
    await act(async () => resolve({ tags: [] }))
    expect(within(screen.getByRole('dialog', { name: 'habits.form.tags' })).getByRole('status', { name: 'habits.form.suggestTags' })).toHaveTextContent('habits.form.noTagSuggestions')
    expect(action).toBeEnabled()
    expect(screen.getByRole('dialog', { name: 'habits.form.tags' }).querySelector('[data-asset^="astra-mark"]')).toHaveAttribute('aria-hidden', 'true')
  })

  it('shows request failure inline and permits a successful retry', async () => {
    tagMutations.suggest.mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValueOnce({ tags: [] })
    renderTagForm()
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.suggestTags' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('habits.form.suggestTagsError')
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.suggestTags' }))
    await waitFor(() => expect(within(screen.getByRole('dialog', { name: 'habits.form.tags' })).getByRole('status', { name: 'habits.form.suggestTags' })).toHaveTextContent('habits.form.noTagSuggestions'))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('retains a failed new proposal for retry and disables other actions during acceptance', async () => {
    tagMutations.suggest.mockResolvedValue({ tags: [{ name: 'Reading', color: '#7c3aed', isExisting: false, id: null }] })
    let reject!: (error: Error) => void
    tagMutations.create.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail })).mockResolvedValueOnce({ id: 'created' })
    renderTagForm()
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.suggestTags' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Reading', pressed: false }))
    expect(screen.getByRole('button', { name: 'Reading', pressed: false })).toBeDisabled()
    expect(screen.getByRole('status', { name: 'habits.form.suggestTags' })).toHaveTextContent('common.loading')
    expect(screen.getByRole('button', { name: 'habits.form.suggestTags' })).toBeDisabled()
    await act(async () => reject(new Error('Unavailable')))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByLabelText('Selected tags')).toBeEmptyDOMElement()
    fireEvent.click(screen.getByRole('button', { name: 'Reading', pressed: false }))
    await waitFor(() => expect(screen.getByLabelText('Selected tags')).toHaveTextContent('created'))
  })

  it.each([['   ', []], ['Run', ['1', '2', '3', '4', '5']]])('disables suggestions with an empty title or full selection: %s', (title, ids) => {
    const view = renderTagForm(title, '', ids)
    const action = screen.getByRole('button', { name: 'habits.form.suggestTags' })
    expect(action).toBeDisabled()
    fireEvent.click(action)
    expect(tagMutations.suggest).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'habits.form.newTag' })).toBeInTheDocument()
    expect(action).toHaveAccessibleDescription(title.trim() ? 'habits.form.tagLimit' : 'habits.form.titleRequired')
    expect(within(screen.getByRole('dialog', { name: 'habits.form.tags' })).getByRole('status', { name: 'habits.form.suggestTags' })).toBeEmptyDOMElement()
    if (!title.trim()) {
      view.helpers.testValues.title = 'Run'
      view.refresh()
      expect(action).toBeEnabled()
      expect(screen.queryByText('habits.form.titleRequired')).toBeNull()
    }
  })

  it('retains the tag limit explanation and recovers when a selected tag is removed', () => {
    tagCollection.tags = ['Health', 'Reading', 'Work', 'Rest', 'Travel', 'Home'].map((name, index) => ({ id: String(index + 1), name, color: '#7c3aed' }))
    renderTagForm('Run', '', ['1', '2', '3', '4'])
    const suggestion = screen.getByRole('button', { name: 'habits.form.suggestTags' })
    expect(suggestion).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Travel', pressed: false }))
    expect(screen.getByLabelText('Selected tags')).toHaveTextContent('1,2,3,4,5')
    expect(suggestion).toBeDisabled()
    expect(suggestion).toHaveAccessibleDescription('habits.form.tagLimit')
    const extra = screen.getByRole('button', { name: 'Home', pressed: false })
    expect(extra).toBeDisabled()
    fireEvent.click(extra)
    fireEvent.click(suggestion)
    expect(tagMutations.suggest).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Selected tags')).toHaveTextContent('1,2,3,4,5')
    expect(screen.getByRole('status', { name: 'habits.form.suggestTags' })).toBeEmptyDOMElement()
    fireEvent.click(screen.getByRole('button', { name: 'Travel', pressed: true }))
    expect(screen.getByLabelText('Selected tags')).toHaveTextContent('1,2,3,4')
    expect(suggestion).toBeEnabled()
    expect(suggestion).not.toHaveAccessibleDescription()
    expect(extra).toBeEnabled()
  })

  it('disables remaining proposals at capacity', async () => {
    tagCollection.tags = [{ id: 'existing', name: 'Health', color: '#7c3aed' }]
    tagMutations.suggest.mockResolvedValue({ tags: [
      { name: 'Health', color: '#7c3aed', isExisting: true, id: 'existing' },
      { name: 'Reading', color: '#7c3aed', isExisting: false, id: null },
    ] })
    renderTagForm('Run', '', ['1', '2', '3', '4'])
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.suggestTags' }))
    fireEvent.click(within(await screen.findByRole('group', { name: 'habits.form.suggestedTagsLabel' })).getByRole('button', { name: 'Health', pressed: false }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reading', pressed: false })).toBeDisabled())
    expect(tagMutations.create).not.toHaveBeenCalled()
  })

  it.each(['title', 'description', 'locale', 'returning title', 'account'])('drops an in-flight result when the habit context changes: %s', async (context) => {
    let resolve!: (response: { tags: { name: string; color: string; isExisting: boolean; id: null }[] }) => void
    tagMutations.suggest.mockImplementation(() => new Promise((complete) => { resolve = complete }))
    const view = renderTagForm()
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.suggestTags' }))
    await act(async () => {
      if (context === 'locale') formLocale.language = 'pt-BR'
      else if (context === 'account') advanceAccountGeneration()
      else view.helpers.testValues[context === 'description' ? 'description' : 'title'] = 'Read'
      view.refresh()
    })
    if (context === 'returning title') await act(async () => { view.helpers.testValues.title = ' Run '; view.refresh() })
    await act(async () => resolve({ tags: [{ name: 'Outdoors', color: '#7c3aed', isExisting: false, id: null }] }))
    expect(screen.queryByRole('button', { name: 'Outdoors', pressed: false })).toBeNull()
    const action = screen.getByRole('button', { name: 'habits.form.suggestTags' })
  expect(action).toBeEnabled()
  expect(action.textContent).toBe('')
  expect(action.style.width).toBe('48px')

  })
})

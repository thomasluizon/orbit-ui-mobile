import * as Sentry from '@sentry/nextjs'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { createApiClientError } from '@orbit/shared/utils'
import { buildTags, resetTagStepState, stubMedia, tagStepState, TagStepHarness } from './tag-step-harness'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

const copy = { en, 'pt-BR': ptBR } as const
const selected = () => screen.getByLabelText('Selected tags').textContent
const quickOptions = () => [...document.querySelectorAll('[data-option-card]')].map((option) => option.textContent)

beforeEach(() => {
  resetTagStepState()
  stubMedia([])
})
afterEach(() => vi.unstubAllGlobals())

describe.each(['en', 'pt-BR'] as const)('the tag step in %s', (locale) => {
  const text = copy[locale]
  beforeEach(() => { tagStepState.locale = locale })

  it('asks the question, explains a tag before a choice and offers the free path with no tags', () => {
    render(<TagStepHarness onContinue={vi.fn()} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(text.habits.flow.optional.tags)
    expect(screen.getByText(text.habits.flow.tags.lineIntro)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: text.habits.form.newTag })).toBeInTheDocument()
    expect(quickOptions()).toEqual([text.habits.flow.tags.none])
    expect(screen.queryByText(text.habits.form.noTags)).toBeNull()
  })

  it('creates the first tag from the free path and selects it', async () => {
    tagStepState.create.mockResolvedValue({ id: 'created' })
    render(<TagStepHarness onContinue={vi.fn()} />)
    fireEvent.change(screen.getByRole('textbox', { name: text.habits.form.newTag }), { target: { value: 'Saúde' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: text.common.add })) })
    expect(tagStepState.create).toHaveBeenCalledWith({ name: 'Saúde', color: expect.any(String) })
    expect(selected()).toBe('created')
  })

  it('asks before it leaves a typed tag name behind, and continues after a discard', async () => {
    const onContinue = vi.fn()
    render(<TagStepHarness onContinue={onContinue} />)
    fireEvent.change(screen.getByRole('textbox', { name: text.habits.form.newTag }), { target: { value: 'Saúde' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: text.habits.flow.continue })) })
    expect(onContinue).not.toHaveBeenCalled()
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: text.common.discardChangesAction })) })
    await waitFor(() => expect(onContinue).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('textbox', { name: text.habits.form.newTag })).toHaveValue('')
  })

  it('changes the Orbit line to the items of the pressed tag with no request', () => {
    tagStepState.tags = buildTags(['Health', 'Mind'])
    tagStepState.habits = [{ title: 'Run', tags: [{ id: 'tag-0' }] }, { title: 'Swim', tags: [{ id: 'tag-0' }] }]
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    render(<TagStepHarness onContinue={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Health' }))
    const items = new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(['Run', 'Swim'])
    expect(screen.getByText(text.habits.flow.tags.lineHas.replace('{tag}', 'Health').replace('{items}', items))).toHaveAttribute('data-line-key', 'tag-0')
    fireEvent.click(screen.getByRole('button', { name: 'Mind' }))
    expect(screen.getByText(text.habits.flow.tags.lineEmpty.replace('{tag}', 'Mind'))).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(new Set(tagStepState.habitFilters.map((filters) => JSON.stringify(filters)))).toEqual(new Set(['{}']))
    expect(new Set(tagStepState.habitOptions.map((options) => JSON.stringify(options))), 'the line reads the cache and never fetches it').toEqual(new Set(['{"enabled":false}']))
  })
})

describe('tag selection', () => {
  it('toggles without advancing, and continues on its own action', () => {
    tagStepState.tags = buildTags(['Health', 'Mind'])
    const onContinue = vi.fn()
    render(<TagStepHarness onContinue={onContinue} />)
    fireEvent.click(screen.getByRole('button', { name: 'Health' }))
    expect(selected()).toBe('tag-0')
    expect(screen.getByRole('button', { name: 'Health' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Health' }))
    expect(selected()).toBe('')
    expect(onContinue).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(onContinue).toHaveBeenCalledOnce()
  })

  it('clears the selection and advances on "No tag"', () => {
    tagStepState.tags = buildTags(['Health', 'Mind'])
    const onContinue = vi.fn()
    render(<TagStepHarness initialIds={['tag-0', 'tag-1']} onContinue={onContinue} />)
    fireEvent.click(screen.getByRole('button', { name: 'No tag' }))
    expect(selected()).toBe('')
    expect(onContinue).toHaveBeenCalledOnce()
  })

  it('keeps the intro line when no cache holds every habit', () => {
    tagStepState.tags = buildTags(['Health'])
    render(<TagStepHarness onContinue={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Health' }))
    expect(screen.getByText(en.habits.flow.tags.lineIntro)).toBeInTheDocument()
  })

  it('reaches the limit at five, dims the others and shows the neutral limit text once with no upgrade', () => {
    tagStepState.tags = buildTags(['A', 'B', 'C', 'D', 'E', 'F', 'G'])
    render(<TagStepHarness initialIds={['tag-0', 'tag-1', 'tag-2', 'tag-3']} onContinue={vi.fn()} />)
    fireEvent.change(screen.getByRole('searchbox', { name: en.habits.form.searchTags }), { target: { value: 'E' } })
    fireEvent.click(screen.getByRole('button', { name: 'E', pressed: false }))
    expect(selected()).toBe('tag-0,tag-1,tag-2,tag-3,tag-4')
    expect(screen.getAllByText(en.habits.form.tagLimit).filter((node) => !node.closest('[hidden]'))).toHaveLength(1)
    expect(document.querySelector('[data-tag-limit]')).toHaveTextContent(en.habits.form.tagLimit)
    fireEvent.change(screen.getByRole('searchbox', { name: en.habits.form.searchTags }), { target: { value: 'F' } })
    expect(screen.getByRole('button', { name: 'F', pressed: false })).toBeDisabled()
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByRole('button', { name: /pro|upgrade/i })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'A' }))
    expect(selected()).toBe('tag-1,tag-2,tag-3,tag-4')
    expect(document.querySelector('[data-tag-limit]')).toBeNull()
  })

  it('shows four quick options, the selected first, and every tag behind the search', () => {
    tagStepState.tags = buildTags(['A', 'B', 'C', 'D', 'E', 'F'])
    render(<TagStepHarness initialIds={['tag-5']} onContinue={vi.fn()} />)
    expect(quickOptions()).toEqual(['F', 'A', 'B', 'C', 'No tag'])
    fireEvent.click(screen.getByRole('button', { name: 'C' }))
    expect(quickOptions(), 'a press never moves the other options').toEqual(['F', 'A', 'B', 'C', 'No tag'])
    fireEvent.click(screen.getByRole('button', { name: 'C' }))
    const search = screen.getByRole('searchbox', { name: en.habits.form.searchTags })
    fireEvent.change(search, { target: { value: 'e' } })
    const rows = document.querySelector('[data-tag-step-rows]') as HTMLElement
    expect(within(rows).getByRole('button', { name: 'E', pressed: false })).toBeInTheDocument()
    fireEvent.change(search, { target: { value: 'zz' } })
    expect(screen.getByText(en.habits.flow.tags.searchMiss)).toBeInTheDocument()
  })
})

describe('tag create, rename and delete', () => {
  it('shows the hint beside the field for an empty name and the server name error beside it', async () => {
    render(<TagStepHarness onContinue={vi.fn()} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add' })) })
    const field = screen.getByRole('textbox', { name: en.habits.form.newTag })
    expect(field).toHaveAccessibleDescription(en.habits.form.tagNameRequired)
    expect(tagStepState.create).not.toHaveBeenCalled()
    tagStepState.create.mockRejectedValue({ errors: { Name: ['Tag must have at most 50 characters'] } })
    fireEvent.change(field, { target: { value: 'Health' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add' })) })
    await waitFor(() => expect(field).toHaveAccessibleDescription('Tag must have at most 50 characters'))
    expect(selected()).toBe('')
  })

  it('renames a tag, shows a server error beside it, and keeps the discard guard for a dirty rename', async () => {
    tagStepState.tags = buildTags(['Health'])
    render(<TagStepHarness onContinue={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: en.habits.flow.tags.manage }))
    fireEvent.click(screen.getByRole('button', { name: `${en.habits.form.editTag}: Health` }))
    const field = screen.getByRole('textbox', { name: en.habits.form.tagName })
    fireEvent.change(field, { target: { value: 'Body' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText(en.common.discardChangesTitle)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: en.common.keepEditing }))
    tagStepState.update.mockRejectedValueOnce(createApiClientError(500, null, 'Failed'))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })
    await waitFor(() => expect(screen.getByText(en.toast.errors.server)).toBeInTheDocument())
    tagStepState.update.mockResolvedValueOnce(undefined)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })
    expect(tagStepState.update).toHaveBeenLastCalledWith({ tagId: 'tag-0', name: 'Body', color: '#7c3aed' })
    await waitFor(() => expect(screen.queryByRole('textbox', { name: en.habits.form.tagName })).toBeNull())
  })

  it.each([409, 500])('shows the server message of a refused delete %i and reports only the unexpected one', async (status) => {
    tagStepState.tags = buildTags(['Health'])
    tagStepState.remove.mockRejectedValue(createApiClientError(status, status === 409 ? { errorCode: 'CONCURRENT_UPDATE_CONFLICT' } : null, 'Failed'))
    vi.mocked(Sentry.captureException).mockClear()
    render(<TagStepHarness initialIds={['tag-0']} onContinue={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: en.habits.flow.tags.manage }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: `${en.habits.form.deleteTag}: Health` })) })
    expect(await screen.findByRole('alert')).toHaveTextContent(status === 409 ? en.toast.errors.conflict : en.toast.errors.server)
    expect(selected()).toBe('tag-0')
    expect(Sentry.captureException).toHaveBeenCalledTimes(status === 500 ? 1 : 0)
  })

  it('deletes a tag and its row leaves with the list motion', async () => {
    tagStepState.tags = buildTags(['Health', 'Mind'])
    tagStepState.remove.mockResolvedValue(undefined)
    const view = render(<TagStepHarness onContinue={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: en.habits.flow.tags.manage }))
    expect(document.querySelectorAll('[data-tag-step-rows] [data-list-motion]')).toHaveLength(2)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: `${en.habits.form.deleteTag}: Mind` })) })
    expect(tagStepState.remove).toHaveBeenCalledWith('tag-1')
    tagStepState.tags = buildTags(['Health'])
    view.rerender(<TagStepHarness onContinue={vi.fn()} />)
    await waitFor(() => expect(document.querySelectorAll('[data-tag-step-rows] [data-list-motion]:not([aria-hidden])')).toHaveLength(1))
  })
})

describe('tag suggestions in the step', () => {
  it('needs a title before it suggests', () => {
    render(<TagStepHarness title=" " onContinue={vi.fn()} />)
    expect(screen.getByRole('button', { name: en.habits.form.suggestTags })).toBeDisabled()
  })

  it('shows Orbit thinking while it runs, then the proposals, and a press creates and selects', async () => {
    let complete!: (response: { tags: { name: string; color: string; isExisting: boolean; id: string | null }[] }) => void
    tagStepState.suggest.mockImplementation(() => new Promise((resolve) => { complete = resolve }))
    const { container } = render(<TagStepHarness onContinue={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: en.habits.form.suggestTags }))
    expect(container.querySelector('[data-question-flow]')).toHaveAttribute('data-orbit-state', 'pensando')
    expect(container.querySelector('[data-question-flow]')).not.toHaveAttribute('data-orbit-state', 'descansando')
    await act(async () => complete({ tags: [{ name: 'Reading', color: '#7c3aed', isExisting: false, id: null }] }))
    expect(container.querySelector('[data-question-flow]')).toHaveAttribute('data-orbit-state', 'parado')
    const proposals = screen.getByRole('group', { name: en.habits.form.suggestedTagsLabel })
    tagStepState.create.mockResolvedValue({ id: 'created' })
    await act(async () => { fireEvent.click(within(proposals).getByRole('button', { name: 'Reading' })) })
    expect(tagStepState.create).toHaveBeenCalledWith({ name: 'Reading', color: '#7c3aed' })
    expect(selected()).toBe('created')
  })

  it('shows the error of a failed suggestion and goes back to Parado', async () => {
    tagStepState.suggest.mockRejectedValue(createApiClientError(500, null, 'Failed'))
    const { container } = render(<TagStepHarness onContinue={vi.fn()} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: en.habits.form.suggestTags })) })
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(container.querySelector('[data-question-flow]')).toHaveAttribute('data-orbit-state', 'parado')
  })

  it('stops suggesting at the tag limit', () => {
    tagStepState.tags = buildTags(['A', 'B', 'C', 'D', 'E'])
    render(<TagStepHarness initialIds={['tag-0', 'tag-1', 'tag-2', 'tag-3', 'tag-4']} onContinue={vi.fn()} />)
    expect(screen.getByRole('button', { name: en.habits.form.suggestTags })).toBeDisabled()
  })
})

describe('the tag bar', () => {
  const BARE = ['tags', 'tag', 'metas', 'modelos', 'checklist']

  it.each(['en', 'pt-BR'] as const)('never shows a bare system noun as a heading, a label or a row in %s', (locale) => {
    tagStepState.locale = locale
    tagStepState.tags = buildTags(['A', 'B', 'C', 'D', 'E'])
    render(<TagStepHarness onContinue={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: copy[locale].habits.flow.tags.manage }))
    const names = [
      ...screen.getAllByRole('heading').map((heading) => heading.textContent),
      ...[...document.querySelectorAll('label')].map((label) => label.textContent),
      ...[...document.querySelectorAll('[data-question-row], [data-option-card]')].map((row) => row.textContent),
    ]
    expect(names.length).toBeGreaterThan(5)
    for (const name of names) expect(BARE).not.toContain(name.trim().toLocaleLowerCase())
  })
})

describe('tag step motion', () => {
  it.each([false, true])('fades the line in on a press, still under reduced motion: %s', (reduced) => {
    stubMedia(reduced ? ['prefers-reduced-motion'] : [])
    tagStepState.tags = buildTags(['Health'])
    tagStepState.habits = []
    render(<TagStepHarness onContinue={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Health' }))
    const line = screen.getByText(en.habits.flow.tags.lineEmpty.replace('{tag}', 'Health'))
    expect(line).toHaveAttribute('data-line-duration', reduced ? '0' : '120')
    expect(line.style.opacity).toBe(reduced ? '1' : '0')
  })

  it('enters a created row with the list motion', async () => {
    tagStepState.tags = buildTags(['Health'])
    const view = render(<TagStepHarness onContinue={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: en.habits.flow.tags.manage }))
    tagStepState.tags = buildTags(['Health', 'Mind'])
    view.rerender(<TagStepHarness onContinue={vi.fn()} />)
    expect(document.querySelectorAll('[data-tag-step-rows] [data-list-motion]')).toHaveLength(2)
  })
})

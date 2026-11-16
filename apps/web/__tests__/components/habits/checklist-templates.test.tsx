import { measureClampedPersonalText } from '@/__tests__/support/personal-text'
import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import type { ChecklistTemplate } from '@orbit/shared/types/checklist-template'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { name: string }) => key === 'common.showFullText' ? `Show full text: ${values?.name}` : key,
}))

const mockTemplates = vi.fn<() => { data: ChecklistTemplate[] }>(() => ({ data: [] }))
const mockCreate = vi.fn<(request: { name: string; items: string[] }) => Promise<unknown>>()
const mockDelete = vi.fn()
const mockShowError = vi.fn()

vi.mock('@/hooks/use-checklist-templates', () => ({
  useChecklistTemplates: () => mockTemplates(),
  useCreateChecklistTemplate: () => ({ mutateAsync: mockCreate }),
  useDeleteChecklistTemplate: () => ({ mutate: mockDelete }),
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showError: mockShowError, showSuccess: vi.fn(), showInfo: vi.fn() }),
}))

import { ChecklistTemplates } from '@/components/habits/checklist-templates'
import type { ChecklistItem } from '@orbit/shared/types/habit'
import {
  holdAccount,
  recoverSameAccount,
  replaceAccountWith,
} from '@/__tests__/support/account-change'

function openTemplates() {
  fireEvent.click(screen.getByText('habits.form.useTemplate'))
}

describe('ChecklistTemplates', () => {
  beforeEach(() => {
    mockTemplates.mockReturnValue({ data: [] })
    mockCreate.mockReset()
    mockDelete.mockReset()
    mockShowError.mockReset()
  })

  it('renders the templates glyph in a compact, rounded form row', () => {
    mockTemplates.mockReturnValue({ data: [{ id: 'template-1', name: 'Workout', items: ['Run'] }] })
    render(<ChecklistTemplates items={[]} onLoad={vi.fn()} />)
    const row = screen.getByRole('button', { name: 'habits.form.useTemplate' })
    expect(row.querySelector('[data-icon="template"] svg')).toBeInTheDocument()
    expect(row).toHaveStyle({ minHeight: 'var(--row-h-compact)', paddingBlock: '12px' })
    expect(row.closest('.orbit-list-row-shell')).toHaveClass('orbit-list-row-column', 'orbit-list-row-field')
    expect(row.querySelector('[data-press-fill]')).toHaveStyle({ minHeight: 'var(--row-h-compact)', paddingBlock: '12px' })
    expect(row).not.toHaveTextContent('1')
  })

  it('shows save button when items are present', () => {
    const items: ChecklistItem[] = [{ text: 'Step 1', isChecked: false }]
    render(<ChecklistTemplates items={items} onLoad={vi.fn()} />)
    openTemplates()
    expect(screen.getByText('habits.form.saveCurrentList')).toBeInTheDocument()
  })

  it('disables save and explains why when no items are present', () => {
    render(<ChecklistTemplates items={[]} onLoad={vi.fn()} />)
    openTemplates()
    expect(screen.getByRole('button', { name: 'habits.form.saveCurrentList' })).toBeDisabled()
    expect(screen.getByText('habits.form.saveCurrentListDisabled')).toBeInTheDocument()
  })

  it('shows save form when save button clicked', () => {
    const items: ChecklistItem[] = [{ text: 'Step 1', isChecked: false }]
    render(<ChecklistTemplates items={items} onLoad={vi.fn()} />)
    openTemplates()
    fireEvent.click(screen.getByText('habits.form.saveCurrentList'))
    expect(screen.getByPlaceholderText('habits.form.templateNamePlaceholder')).toBeInTheDocument()
  })

  it('limits the custom focus ring to keyboard focus', () => {
    const items: ChecklistItem[] = [{ text: 'Step 1', isChecked: false }]
    render(<ChecklistTemplates items={items} onLoad={vi.fn()} />)
    openTemplates()
    fireEvent.click(screen.getByText('habits.form.saveCurrentList'))

    const input = screen.getByPlaceholderText('habits.form.templateNamePlaceholder')
    const classNames = input.className.split(' ')

    expect(classNames).toContain('focus-visible:outline-none')
    expect(classNames).toContain('focus-visible:shadow-[inset_0_0_0_2px_var(--primary)]')
    expect(classNames).not.toContain('focus:outline-none')
    expect(classNames).not.toContain('focus:shadow-[inset_0_0_0_2px_var(--primary)]')
  })

  function openSaveEditor(name: string) {
    render(<ChecklistTemplates items={[{ text: 'Step 1', isChecked: false }]} onLoad={vi.fn()} />)
    openTemplates()
    fireEvent.click(screen.getByText('habits.form.saveCurrentList'))
    const input = screen.getByPlaceholderText('habits.form.templateNamePlaceholder')
    fireEvent.change(input, { target: { value: name } })
    return input
  }

  function pendingCreate() {
    let settle!: { resolve: () => void; reject: (failure: Error) => void }
    mockCreate.mockImplementation(() => new Promise((resolve, reject) => { settle = { resolve: () => resolve({ id: 'template-1' }), reject } }))
    return () => settle
  }

  it('sends the typed name and items', async () => {
    mockCreate.mockResolvedValue({ id: 'template-1' })
    openSaveEditor('Morning Routine')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'common.save' })) })
    expect(mockCreate).toHaveBeenCalledWith({ name: 'Morning Routine', items: ['Step 1'] })
  })

  it('saves a named template from the Enter key', async () => {
    mockCreate.mockResolvedValue({ id: 'template-1' })
    const input = openSaveEditor('Morning')
    await act(async () => { fireEvent.keyDown(input, { key: 'Enter' }) })
    expect(mockCreate).toHaveBeenCalledWith({ name: 'Morning', items: ['Step 1'] })
  })

  it('keeps the Save label and shows the skeleton face while the request runs, and sends nothing on a second press', () => {
    pendingCreate()
    const input = openSaveEditor('Morning')
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))
    const save = screen.getByRole('button', { name: 'common.save' })
    expect(save).toHaveAttribute('aria-busy', 'true')
    expect(save).toBeDisabled()
    expect(save).toHaveTextContent('common.save')
    expect(save.querySelector('[data-slot="skeleton-face"] .skeleton-pulse')).not.toBeNull()
    fireEvent.click(save)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(mockCreate).toHaveBeenCalledOnce()
  })

  it('sends one request for two presses in the same event turn', () => {
    pendingCreate()
    const input = openSaveEditor('Morning')
    act(() => {
      fireEvent.keyDown(input, { key: 'Enter' })
      fireEvent.keyDown(input, { key: 'Enter' })
    })
    expect(mockCreate).toHaveBeenCalledOnce()
  })

  it('closes the editor after the request succeeds', async () => {
    const settle = pendingCreate()
    openSaveEditor('Saved')
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))
    await act(async () => { settle().resolve() })
    expect(screen.queryByPlaceholderText('habits.form.templateNamePlaceholder')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { busy: true })).toBeNull()
  })

  it('ends the waiting face and shows an error toast when the request fails', async () => {
    const settle = pendingCreate()
    openSaveEditor('Bad')
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))
    await act(async () => { settle().reject(new Error('offline')) })
    expect(mockShowError).toHaveBeenCalledWith('habits.form.saveTemplateError')
    const save = screen.getByRole('button', { name: 'common.save' })
    expect(save).not.toHaveAttribute('aria-busy')
    expect(save).toBeEnabled()
    expect(save.querySelector('[data-slot="skeleton-face"]')).toBeNull()
    mockCreate.mockResolvedValue({ id: 'template-1' })
    await act(async () => { fireEvent.click(save) })
    expect(mockCreate).toHaveBeenCalledTimes(2)
  })

  it('loads a template calling onLoad with checklist items', () => {
    mockTemplates.mockReturnValue({
      data: [{ id: 'tmpl1', name: 'Workout', items: ['Warmup', 'Main'] }],
    })

    const onLoad = vi.fn()
    render(
      <ChecklistTemplates items={[{ text: 'A', isChecked: false }]} onLoad={onLoad} />,
    )

    openTemplates()
    fireEvent.click(screen.getByText('Workout'))
    expect(onLoad).toHaveBeenCalledWith([
      { text: 'Warmup', isChecked: false },
      { text: 'Main', isChecked: false },
    ])
  })

  it('calls deleteTemplate mutation when delete is clicked', () => {
    mockTemplates.mockReturnValue({
      data: [{ id: 'tmpl1', name: 'Workout', items: ['Warmup'] }],
    })

    render(
      <ChecklistTemplates items={[{ text: 'A', isChecked: false }]} onLoad={vi.fn()} />,
    )

    openTemplates()
    fireEvent.click(screen.getByLabelText('common.delete: Workout'))
    expect(mockDelete).toHaveBeenCalledWith(
      'tmpl1',
      expect.objectContaining({ onError: expect.any(Function) }),
    )
  })

  it('shows an error toast when delete fails', () => {
    mockTemplates.mockReturnValue({
      data: [{ id: 'tmpl1', name: 'Workout', items: ['Warmup'] }],
    })

    render(
      <ChecklistTemplates items={[{ text: 'A', isChecked: false }]} onLoad={vi.fn()} />,
    )

    openTemplates()
    fireEvent.click(screen.getByLabelText('common.delete: Workout'))
    const onError = mockDelete.mock.calls[0]![1].onError as () => void
    onError()
    expect(mockShowError).toHaveBeenCalledWith('habits.form.deleteTemplateError')
  })
})

describe('ChecklistTemplates across an account change', () => {
  const ACCOUNT_A_ITEMS: ChecklistItem[] = [{ text: 'Account A step', isChecked: false }]

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
    mockTemplates.mockReturnValue({ data: [] })
    holdAccount('user-1')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function nameATemplate() {
    render(<ChecklistTemplates items={ACCOUNT_A_ITEMS} onLoad={vi.fn()} />)
    openTemplates()
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.saveCurrentList' }))
    const field = screen.getByPlaceholderText('habits.form.templateNamePlaceholder')
    fireEvent.change(field, { target: { value: 'Account A checklist' } })
    expect(field).toHaveValue('Account A checklist')
  }

  it('closes the sheet and drops the typed template name on a replacement', async () => {
    nameATemplate()

    await replaceAccountWith('user-2')

    expect(screen.queryByPlaceholderText('habits.form.templateNamePlaceholder')).not.toBeInTheDocument()
    expect(screen.queryByText('habits.form.saveCurrentList')).not.toBeInTheDocument()
  })

  it('keeps the typed template name when the same account recovers from a rejected refresh', async () => {
    nameATemplate()

    await recoverSameAccount('user-1')

    expect(screen.getByPlaceholderText('habits.form.templateNamePlaceholder')).toHaveValue('Account A checklist')
  })
  afterEach(() => vi.restoreAllMocks())

  it.each(['UnbrokenToken'.repeat(24), 'Read extraordinarilyLongWord daily before breakfast with the people in my neighborhood'])('discloses the full template name %s without loading it', async (name) => {
    measureClampedPersonalText()
    mockTemplates.mockReturnValue({ data: [{ id: 'template-1', name, items: ['Run'] }] })
    const onLoad = vi.fn()
    render(<ChecklistTemplates items={[]} onLoad={onLoad} />)
    openTemplates()
    const picker = screen.getByRole('dialog')
    const title = [...picker.querySelectorAll('[data-personal-text]')].find((element) => element.getAttribute('aria-label') === name)!
    expect(title).toHaveAttribute('aria-label', name)
    fireEvent.click(screen.getByRole('button', { name: `Show full text: ${name}`, expanded: false }))
    await screen.findByRole('dialog', { name })
    expect(onLoad).not.toHaveBeenCalled()
    fireEvent.click(screen.getAllByRole('button', { name: 'common.close' }).at(-1)!)
    fireEvent.click([...picker.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === name && !button.hasAttribute('aria-expanded'))!)
    expect(onLoad).toHaveBeenCalledWith([{ text: 'Run', isChecked: false }])
  })

})

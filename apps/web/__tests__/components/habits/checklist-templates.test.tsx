import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import type { ChecklistTemplate } from '@orbit/shared/types/checklist-template'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

const mockTemplates = vi.fn<() => { data: ChecklistTemplate[] }>(() => ({ data: [] }))
const mockCreate = vi.fn()
const mockDelete = vi.fn()
const mockShowError = vi.fn()
let mockIsPending = false

vi.mock('@/hooks/use-checklist-templates', () => ({
  useChecklistTemplates: () => mockTemplates(),
  useCreateChecklistTemplate: () => ({
    mutate: mockCreate,
    isPending: mockIsPending,
  }),
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
  fireEvent.click(screen.getByText('habits.form.templates'))
}

describe('ChecklistTemplates', () => {
  beforeEach(() => {
    mockTemplates.mockReturnValue({ data: [] })
    mockCreate.mockReset()
    mockDelete.mockReset()
    mockShowError.mockReset()
    mockIsPending = false
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

  it('calls createTemplate mutation with the typed name and items', () => {
    const items: ChecklistItem[] = [{ text: 'Step 1', isChecked: false }]
    render(<ChecklistTemplates items={items} onLoad={vi.fn()} />)
    openTemplates()

    fireEvent.click(screen.getByText('habits.form.saveCurrentList'))
    const input = screen.getByPlaceholderText('habits.form.templateNamePlaceholder')
    fireEvent.change(input, { target: { value: 'Morning Routine' } })
    fireEvent.click(screen.getByText('common.save'))

    expect(mockCreate).toHaveBeenCalledWith(
      { name: 'Morning Routine', items: ['Step 1'] },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    )
  })

  it('does not fire a second mutation while one is in-flight', () => {
    const items: ChecklistItem[] = [{ text: 'Step 1', isChecked: false }]
    mockIsPending = true
    render(<ChecklistTemplates items={items} onLoad={vi.fn()} />)
    openTemplates()

    fireEvent.click(screen.getByText('habits.form.saveCurrentList'))
    const input = screen.getByPlaceholderText('habits.form.templateNamePlaceholder')
    fireEvent.change(input, { target: { value: 'Morning Routine' } })

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('saves a named template from the Enter key', () => {
    const items: ChecklistItem[] = [{ text: 'Step 1', isChecked: false }]
    render(<ChecklistTemplates items={items} onLoad={vi.fn()} />)
    openTemplates()
    fireEvent.click(screen.getByText('habits.form.saveCurrentList'))
    const input = screen.getByPlaceholderText('habits.form.templateNamePlaceholder')
    fireEvent.change(input, { target: { value: 'Morning' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(mockCreate).toHaveBeenCalledWith(
      { name: 'Morning', items: ['Step 1'] },
      expect.any(Object),
    )
  })

  it('shows an error toast when create fails', () => {
    const items: ChecklistItem[] = [{ text: 'Step 1', isChecked: false }]
    render(<ChecklistTemplates items={items} onLoad={vi.fn()} />)
    openTemplates()

    fireEvent.click(screen.getByText('habits.form.saveCurrentList'))
    fireEvent.change(
      screen.getByPlaceholderText('habits.form.templateNamePlaceholder'),
      { target: { value: 'Bad' } },
    )
    fireEvent.click(screen.getByText('common.save'))

    const onError = mockCreate.mock.calls[0]![1].onError as () => void
    onError()
    expect(mockShowError).toHaveBeenCalledWith('habits.form.saveTemplateError')
  })

  it('closes the form via onSuccess after a successful save', () => {
    const items: ChecklistItem[] = [{ text: 'Step 1', isChecked: false }]
    render(<ChecklistTemplates items={items} onLoad={vi.fn()} />)
    openTemplates()

    fireEvent.click(screen.getByText('habits.form.saveCurrentList'))
    const input = screen.getByPlaceholderText('habits.form.templateNamePlaceholder')
    fireEvent.change(input, { target: { value: 'Saved' } })
    fireEvent.click(screen.getByText('common.save'))

    const onSuccess = mockCreate.mock.calls[0]![1].onSuccess as () => void
    act(() => {
      onSuccess()
    })
    expect(
      screen.queryByPlaceholderText('habits.form.templateNamePlaceholder'),
    ).not.toBeInTheDocument()
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
    mockIsPending = false
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
})

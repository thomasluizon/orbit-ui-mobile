import { describe, it, expect, vi, beforeEach } from 'vitest'
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
    expect(screen.getByText('habits.form.saveAsTemplate')).toBeInTheDocument()
  })

  it('does not show save button when no items', () => {
    render(<ChecklistTemplates items={[]} onLoad={vi.fn()} />)
    expect(screen.queryByText('habits.form.saveAsTemplate')).not.toBeInTheDocument()
  })

  it('shows save form when save button clicked', () => {
    const items: ChecklistItem[] = [{ text: 'Step 1', isChecked: false }]
    render(<ChecklistTemplates items={items} onLoad={vi.fn()} />)
    fireEvent.click(screen.getByText('habits.form.saveAsTemplate'))
    expect(screen.getByPlaceholderText('habits.form.templateNamePlaceholder')).toBeInTheDocument()
  })

  it('calls createTemplate mutation with the typed name and items', () => {
    const items: ChecklistItem[] = [{ text: 'Step 1', isChecked: false }]
    render(<ChecklistTemplates items={items} onLoad={vi.fn()} />)

    fireEvent.click(screen.getByText('habits.form.saveAsTemplate'))
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

    fireEvent.click(screen.getByText('habits.form.saveAsTemplate'))
    const input = screen.getByPlaceholderText('habits.form.templateNamePlaceholder')
    fireEvent.change(input, { target: { value: 'Morning Routine' } })

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('shows an error toast when create fails', () => {
    const items: ChecklistItem[] = [{ text: 'Step 1', isChecked: false }]
    render(<ChecklistTemplates items={items} onLoad={vi.fn()} />)

    fireEvent.click(screen.getByText('habits.form.saveAsTemplate'))
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

    fireEvent.click(screen.getByText('habits.form.saveAsTemplate'))
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

    fireEvent.click(screen.getByLabelText('common.delete: Workout'))
    const onError = mockDelete.mock.calls[0]![1].onError as () => void
    onError()
    expect(mockShowError).toHaveBeenCalledWith('habits.form.deleteTemplateError')
  })
})

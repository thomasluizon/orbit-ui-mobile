import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('dompurify', () => ({
  default: { sanitize: (html: string) => html },
}))

const mockMutateAsync = vi.fn()
const mockShowError = vi.fn()
vi.mock('@/hooks/use-goals', () => ({
  useUpdateGoal: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
    error: null,
  }),
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({
    showError: mockShowError,
  }),
}))

vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

vi.mock('@/components/ui/date-field', () => ({
  DateField: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input data-testid="date-picker" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}))

import { EditGoalModal } from '@/components/goals/edit-goal-modal'
import type { Goal } from '@orbit/shared/types/goal'

const mockGoal: Goal = {
  id: 'g1',
  title: 'Run 100km',
  description: null,
  targetValue: 100,
  currentValue: 45,
  unit: 'km',
  deadline: '2025-12-31',
  status: 'Active',
  progressPercentage: 45,
  createdAtUtc: '2025-01-01T00:00:00Z',
  completedAtUtc: null,
  position: 0,
  linkedHabits: [],
}

describe('EditGoalModal', () => {
  beforeEach(() => {
    mockMutateAsync.mockReset()
    mockShowError.mockReset()
  })

  it('renders nothing when closed', () => {
    const { container } = render(
      <EditGoalModal open={false} onOpenChange={vi.fn()} goal={mockGoal} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders form with goal data when open', () => {
    render(<EditGoalModal open={true} onOpenChange={vi.fn()} goal={mockGoal} />)
    expect(screen.getByDisplayValue('100')).toBeInTheDocument()
    expect(screen.getByDisplayValue('km')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Run 100km')).toBeInTheDocument()
    expect(screen.getByLabelText('goals.form.description')).not.toBeRequired()
    expect(screen.getByLabelText('goals.form.targetValue')).toBeRequired()
    expect(screen.getByLabelText('goals.form.unit')).toBeRequired()
  })

  it('shows validation error when target is 0', () => {
    render(<EditGoalModal open={true} onOpenChange={vi.fn()} goal={mockGoal} />)
    const targetInput = screen.getByLabelText('goals.form.targetValue')
    fireEvent.change(targetInput, { target: { value: '0' } })
    const form = targetInput.closest('form')
    fireEvent.submit(form!)
    expect(mockShowError).toHaveBeenCalledWith('goals.form.targetValueRequired')
    expect(mockMutateAsync).not.toHaveBeenCalled()
  })

  it('shows validation error when unit is empty', () => {
    render(<EditGoalModal open={true} onOpenChange={vi.fn()} goal={mockGoal} />)
    const unitInput = screen.getByLabelText('goals.form.unit')
    fireEvent.change(unitInput, { target: { value: '' } })
    const form = unitInput.closest('form')
    fireEvent.submit(form!)
    expect(mockShowError).toHaveBeenCalledWith('goals.form.unitRequired')
    expect(mockMutateAsync).not.toHaveBeenCalled()
  })

  it('links every inline error and focuses each first remaining invalid field', async () => {
    render(<EditGoalModal open={true} onOpenChange={vi.fn()} goal={mockGoal} />)
    const descriptionInput = screen.getByLabelText('goals.form.description')
    const targetInput = screen.getByLabelText('goals.form.targetValue')
    const unitInput = screen.getByLabelText('goals.form.unit')
    fireEvent.change(descriptionInput, { target: { value: '' } })
    fireEvent.change(targetInput, { target: { value: '' } })
    fireEvent.change(unitInput, { target: { value: '' } })

    fireEvent.submit(targetInput.closest('form')!)

    await waitFor(() => expect(targetInput).toHaveFocus())
    expect(mockShowError).toHaveBeenLastCalledWith('goals.form.targetValueRequired')
    expect(descriptionInput).not.toHaveAccessibleDescription()
    expect(targetInput).toHaveAccessibleDescription('goals.form.targetValueRequired')
    expect(unitInput).toHaveAccessibleDescription('goals.form.unitRequired')
    expect(descriptionInput).toHaveAttribute('aria-invalid', 'false')
    expect(targetInput).toHaveAttribute('aria-invalid', 'true')
    expect(unitInput).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryAllByRole('alert')).toHaveLength(0)

    fireEvent.change(targetInput, { target: { value: '10' } })
    fireEvent.submit(targetInput.closest('form')!)

    await waitFor(() => expect(unitInput).toHaveFocus())
    expect(descriptionInput).toHaveAttribute('aria-invalid', 'false')
    expect(targetInput).toHaveAttribute('aria-invalid', 'false')
    expect(unitInput).toHaveAccessibleDescription('goals.form.unitRequired')

    mockMutateAsync.mockResolvedValueOnce(undefined)
    fireEvent.change(unitInput, { target: { value: 'km' } })
    fireEvent.submit(targetInput.closest('form')!)
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledOnce())
  })

  it('submits update request', async () => {
    mockMutateAsync.mockResolvedValue(undefined)
    const onOpenChange = vi.fn()
    render(<EditGoalModal open={true} onOpenChange={onOpenChange} goal={mockGoal} />)

    const form = screen.getByLabelText('goals.form.targetValue').closest('form')
    fireEvent.submit(form!)

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        goalId: 'g1',
        data: expect.objectContaining({
          title: 'Run 100km',
          targetValue: 100,
          unit: 'km',
        }),
      })
    })
  })
})

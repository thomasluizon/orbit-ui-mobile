import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('dompurify', () => ({
  default: { sanitize: (html: string) => html },
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { weekStartDay: 0 } }),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}))

const mockMutateAsync = vi.fn().mockResolvedValue({})
const mockShowError = vi.fn()

vi.mock('@/hooks/use-goals', () => ({
  useCreateGoal: () => ({
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

vi.mock('@orbit/shared/utils/dates', () => ({
  formatAPIDate: () => '2025-06-15',
}))

import { CreateGoalModal } from '@/components/goals/create-goal-modal'

describe('CreateGoalModal', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    mockMutateAsync.mockClear()
    mockShowError.mockClear()
  })

  it('renders nothing when closed', () => {
    const { container } = render(
      <CreateGoalModal open={false} onOpenChange={vi.fn()} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders form when open', () => {
    render(<CreateGoalModal open={true} onOpenChange={vi.fn()} />)
    expect(screen.getByLabelText('goals.form.targetValue')).toBeInTheDocument()
    expect(screen.getByLabelText('goals.form.unit')).toBeInTheDocument()
  })

  it('renders description field', () => {
    render(<CreateGoalModal open={true} onOpenChange={vi.fn()} />)
    expect(screen.getByLabelText(/goals.form.description/)).toBeInTheDocument()
  })

  it('renders submit button', () => {
    render(<CreateGoalModal open={true} onOpenChange={vi.fn()} />)
    const submitBtn = document.querySelector('button[type="submit"]')
    expect(submitBtn).toBeInTheDocument()
    expect(submitBtn!.textContent).toContain('goals.create')
  })

  it('shows add deadline button', () => {
    render(<CreateGoalModal open={true} onOpenChange={vi.fn()} />)
    expect(screen.getByText('goals.form.addDeadline')).toBeInTheDocument()
  })

  it('shows validation error when submitting without target value', () => {
    render(<CreateGoalModal open={true} onOpenChange={vi.fn()} />)
    const descriptionInput = screen.getByLabelText(/goals.form.description/)
    fireEvent.change(descriptionInput, { target: { value: 'Read more books' } })
    const submitBtn = screen.getAllByText('goals.create').find(
      (el) => el.tagName === 'BUTTON' && el.getAttribute('type') === 'submit',
    )
    if (submitBtn) fireEvent.click(submitBtn)
    expect(mockShowError).toHaveBeenCalledWith('goals.form.targetValueRequired')
    expect(mockMutateAsync).not.toHaveBeenCalled()
  })

  it('shows validation error when unit is empty but target is set', () => {
    render(<CreateGoalModal open={true} onOpenChange={vi.fn()} />)
    const targetInput = screen.getByLabelText('goals.form.targetValue')
    fireEvent.change(targetInput, { target: { value: '10' } })
    const submitBtn = screen.getAllByText('goals.create').find(
      (el) => el.tagName === 'BUTTON' && el.getAttribute('type') === 'submit',
    )
    if (submitBtn) fireEvent.click(submitBtn)
    expect(mockShowError).toHaveBeenCalledWith('goals.form.unitRequired')
    expect(mockMutateAsync).not.toHaveBeenCalled()
  })

  it('renders the title from the overlay', () => {
    render(<CreateGoalModal open={true} onOpenChange={vi.fn()} />)
    // The title is "goals.create" passed to AppOverlay
    const titles = screen.getAllByText('goals.create')
    expect(titles.length).toBeGreaterThan(0)
  })
})

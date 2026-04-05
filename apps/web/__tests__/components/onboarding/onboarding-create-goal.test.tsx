import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

const mockMutate = vi.fn()
vi.mock('@/hooks/use-goals', () => ({
  useCreateGoal: () => ({ mutate: mockMutate, isPending: false }),
}))

import { OnboardingCreateGoal } from '@/components/onboarding/onboarding-create-goal'

describe('OnboardingCreateGoal', () => {
  const defaultProps = {
    onCreated: vi.fn(),
    onSkip: vi.fn(),
  }

  beforeEach(() => {
    mockMutate.mockClear()
    defaultProps.onCreated.mockClear()
    defaultProps.onSkip.mockClear()
  })

  it('renders the title with optional badge', () => {
    render(<OnboardingCreateGoal {...defaultProps} />)
    expect(screen.getByText('onboarding.flow.createGoal.title')).toBeInTheDocument()
    expect(screen.getByText('onboarding.flow.createGoal.optional')).toBeInTheDocument()
  })

  it('renders suggestion chips', () => {
    render(<OnboardingCreateGoal {...defaultProps} />)
    expect(screen.getByText('onboarding.flow.createGoal.suggestions.run')).toBeInTheDocument()
    expect(screen.getByText('onboarding.flow.createGoal.suggestions.books')).toBeInTheDocument()
    expect(screen.getByText('onboarding.flow.createGoal.suggestions.save')).toBeInTheDocument()
  })

  it('fills form when suggestion clicked', () => {
    render(<OnboardingCreateGoal {...defaultProps} />)
    fireEvent.click(screen.getByText('onboarding.flow.createGoal.suggestions.run'))
    const targetInput = screen.getByPlaceholderText('onboarding.flow.createGoal.targetPlaceholder')
    expect(targetInput).toHaveValue(100)
  })

  it('disables create button when form is incomplete', () => {
    render(<OnboardingCreateGoal {...defaultProps} />)
    const createBtn = screen.getByText('onboarding.flow.createGoal.create')
    expect(createBtn).toBeDisabled()
  })

  it('enables create button when target and unit filled', () => {
    render(<OnboardingCreateGoal {...defaultProps} />)
    const targetInput = screen.getByPlaceholderText('onboarding.flow.createGoal.targetPlaceholder')
    const unitInput = screen.getByPlaceholderText('onboarding.flow.createGoal.unitPlaceholder')
    fireEvent.change(targetInput, { target: { value: '50' } })
    fireEvent.change(unitInput, { target: { value: 'km' } })
    const createBtn = screen.getByText('onboarding.flow.createGoal.create')
    expect(createBtn).not.toBeDisabled()
  })

  it('calls onSkip when skip button clicked', () => {
    render(<OnboardingCreateGoal {...defaultProps} />)
    fireEvent.click(screen.getByText('onboarding.flow.createGoal.skipStep'))
    expect(defaultProps.onSkip).toHaveBeenCalled()
  })

  it('calls mutate when create is clicked', () => {
    render(<OnboardingCreateGoal {...defaultProps} />)
    const targetInput = screen.getByPlaceholderText('onboarding.flow.createGoal.targetPlaceholder')
    const unitInput = screen.getByPlaceholderText('onboarding.flow.createGoal.unitPlaceholder')
    fireEvent.change(targetInput, { target: { value: '50' } })
    fireEvent.change(unitInput, { target: { value: 'km' } })
    fireEvent.click(screen.getByText('onboarding.flow.createGoal.create'))
    expect(mockMutate).toHaveBeenCalled()
  })
})

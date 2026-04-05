import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

const mockMutate = vi.fn()
vi.mock('@/hooks/use-habits', () => ({
  useLogHabit: () => ({ mutate: mockMutate }),
}))

import { OnboardingCompleteHabit } from '@/components/onboarding/onboarding-complete-habit'

describe('OnboardingCompleteHabit', () => {
  const defaultProps = {
    habitId: 'h1',
    habitTitle: 'Drink Water',
    onCompleted: vi.fn(),
  }

  beforeEach(() => {
    mockMutate.mockClear()
    defaultProps.onCompleted.mockClear()
  })

  it('renders the title and instruction', () => {
    render(<OnboardingCompleteHabit {...defaultProps} />)
    expect(screen.getByText('onboarding.flow.completeHabit.title')).toBeInTheDocument()
    expect(screen.getByText('onboarding.flow.completeHabit.instruction')).toBeInTheDocument()
  })

  it('renders the habit title', () => {
    render(<OnboardingCompleteHabit {...defaultProps} />)
    expect(screen.getByText('Drink Water')).toBeInTheDocument()
  })

  it('calls logHabit when completion button clicked', () => {
    render(<OnboardingCompleteHabit {...defaultProps} />)
    const completeButton = screen.getByRole('button', { name: '' })
    fireEvent.click(completeButton)
    expect(mockMutate).toHaveBeenCalledWith({ habitId: 'h1' })
  })

  it('does nothing when habitId is null', () => {
    render(<OnboardingCompleteHabit {...defaultProps} habitId={null} />)
    const buttons = screen.getAllByRole('button')
    // Try clicking the completion button
    buttons.forEach((btn) => fireEvent.click(btn))
    expect(mockMutate).not.toHaveBeenCalled()
  })
})

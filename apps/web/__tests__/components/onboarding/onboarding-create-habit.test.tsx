import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

const mockMutate = vi.fn()
vi.mock('@/hooks/use-habits', () => ({
  useCreateHabit: () => ({ mutate: mockMutate, isPending: false }),
}))

import { OnboardingCreateHabit } from '@/components/onboarding/onboarding-create-habit'

describe('OnboardingCreateHabit', () => {
  const onCreated = vi.fn()

  beforeEach(() => {
    mockMutate.mockClear()
    onCreated.mockClear()
  })

  it('renders the title and subtitle', () => {
    render(<OnboardingCreateHabit onCreated={onCreated} />)
    expect(screen.getByText('onboarding.flow.createHabit.title')).toBeInTheDocument()
    expect(screen.getByText('onboarding.flow.createHabit.subtitle')).toBeInTheDocument()
  })

  it('renders suggestion chips', () => {
    render(<OnboardingCreateHabit onCreated={onCreated} />)
    expect(screen.getByText('onboarding.flow.createHabit.suggestions.water')).toBeInTheDocument()
    expect(screen.getByText('onboarding.flow.createHabit.suggestions.read')).toBeInTheDocument()
    expect(screen.getByText('onboarding.flow.createHabit.suggestions.exercise')).toBeInTheDocument()
    expect(screen.getByText('onboarding.flow.createHabit.suggestions.meditate')).toBeInTheDocument()
  })

  it('populates title when suggestion clicked', () => {
    render(<OnboardingCreateHabit onCreated={onCreated} />)
    fireEvent.click(screen.getByText('onboarding.flow.createHabit.suggestions.water'))
    const input = screen.getByPlaceholderText('onboarding.flow.createHabit.placeholder')
    expect(input).toHaveValue('onboarding.flow.createHabit.suggestions.water')
  })

  it('renders frequency buttons', () => {
    render(<OnboardingCreateHabit onCreated={onCreated} />)
    expect(screen.getByText('onboarding.flow.createHabit.frequency.daily')).toBeInTheDocument()
    expect(screen.getByText('onboarding.flow.createHabit.frequency.weekly')).toBeInTheDocument()
    expect(screen.getByText('onboarding.flow.createHabit.frequency.oneTime')).toBeInTheDocument()
  })

  it('disables create button when title is empty', () => {
    render(<OnboardingCreateHabit onCreated={onCreated} />)
    const createBtn = screen.getByText('onboarding.flow.createHabit.create')
    expect(createBtn).toBeDisabled()
  })

  it('enables create button when title has value', () => {
    render(<OnboardingCreateHabit onCreated={onCreated} />)
    const input = screen.getByPlaceholderText('onboarding.flow.createHabit.placeholder')
    fireEvent.change(input, { target: { value: 'My Custom Habit' } })
    const createBtn = screen.getByText('onboarding.flow.createHabit.create')
    expect(createBtn).not.toBeDisabled()
  })

  it('calls mutate when create button clicked', () => {
    render(<OnboardingCreateHabit onCreated={onCreated} />)
    const input = screen.getByPlaceholderText('onboarding.flow.createHabit.placeholder')
    fireEvent.change(input, { target: { value: 'My Habit' } })
    fireEvent.click(screen.getByText('onboarding.flow.createHabit.create'))
    expect(mockMutate).toHaveBeenCalled()
  })
})

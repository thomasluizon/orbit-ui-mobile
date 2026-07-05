import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import {
  OnboardingActionsProvider,
  type OnboardingActions,
} from '@/components/onboarding/onboarding-actions-context'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showError: vi.fn() }),
}))

import { OnboardingCreateHabit } from '@/components/onboarding/onboarding-create-habit'

const createHabit = vi.fn().mockResolvedValue({ id: 'h1', title: 'x' })
const stubActions: OnboardingActions = {
  createHabit,
  createHabitsBulk: vi.fn().mockResolvedValue(undefined),
  logHabit: vi.fn().mockResolvedValue(undefined),
  createGoal: vi.fn().mockResolvedValue(undefined),
  setWeekStartDay: vi.fn().mockResolvedValue(undefined),
  setColorScheme: vi.fn().mockResolvedValue(undefined),
  finishOnboarding: vi.fn().mockResolvedValue(undefined),
}

function renderStep(onCreated: (id: string, title: string) => void) {
  return render(
    <OnboardingActionsProvider actions={stubActions} hasProAccess={false} isLive={false}>
      <OnboardingCreateHabit onCreated={onCreated} />
    </OnboardingActionsProvider>,
  )
}

describe('OnboardingCreateHabit', () => {
  const onCreated = vi.fn()

  beforeEach(() => {
    createHabit.mockClear()
    onCreated.mockClear()
  })

  it('renders the title and subtitle', () => {
    renderStep(onCreated)
    expect(screen.getByText('onboarding.flow.createHabit.title')).toBeInTheDocument()
    expect(screen.getByText('onboarding.flow.createHabit.subtitle')).toBeInTheDocument()
  })

  it('renders suggestion chips', () => {
    renderStep(onCreated)
    expect(screen.getByText('onboarding.flow.createHabit.suggestions.water')).toBeInTheDocument()
    expect(screen.getByText('onboarding.flow.createHabit.suggestions.read')).toBeInTheDocument()
    expect(screen.getByText('onboarding.flow.createHabit.suggestions.exercise')).toBeInTheDocument()
    expect(screen.getByText('onboarding.flow.createHabit.suggestions.meditate')).toBeInTheDocument()
  })

  it('populates title when suggestion clicked', () => {
    renderStep(onCreated)
    fireEvent.click(screen.getByText('onboarding.flow.createHabit.suggestions.water'))
    const input = screen.getByPlaceholderText('onboarding.flow.createHabit.placeholder')
    expect(input).toHaveValue('onboarding.flow.createHabit.suggestions.water')
  })

  it('reveals frequency buttons after the form toggle', () => {
    renderStep(onCreated)
    fireEvent.click(screen.getByText('onboarding.flow.createHabit.useForm'))
    expect(screen.getByText('onboarding.flow.createHabit.frequency.daily')).toBeInTheDocument()
    expect(screen.getByText('onboarding.flow.createHabit.frequency.weekly')).toBeInTheDocument()
    expect(screen.getByText('onboarding.flow.createHabit.frequency.oneTime')).toBeInTheDocument()
  })

  it('disables create button when title is empty', () => {
    renderStep(onCreated)
    const createBtn = screen.getByRole('button', { name: 'onboarding.flow.createHabit.create' })
    expect(createBtn).toBeDisabled()
  })

  it('enables create button when title has value', () => {
    renderStep(onCreated)
    const input = screen.getByPlaceholderText('onboarding.flow.createHabit.placeholder')
    fireEvent.change(input, { target: { value: 'My Custom Habit' } })
    const createBtn = screen.getByRole('button', { name: 'onboarding.flow.createHabit.create' })
    expect(createBtn).not.toBeDisabled()
  })

  it('routes the created habit through the action surface', async () => {
    renderStep(onCreated)
    const input = screen.getByPlaceholderText('onboarding.flow.createHabit.placeholder')
    fireEvent.change(input, { target: { value: 'My Habit' } })
    fireEvent.click(screen.getByText('onboarding.flow.createHabit.create'))
    await waitFor(() =>
      expect(createHabit).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'My Habit', frequencyUnit: 'Day' }),
      ),
    )
  })
})

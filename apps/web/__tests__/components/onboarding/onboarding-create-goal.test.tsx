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

import { OnboardingCreateGoal } from '@/components/onboarding/onboarding-create-goal'

const createGoal = vi.fn().mockResolvedValue(undefined)
const stubActions: OnboardingActions = {
  createHabit: vi.fn().mockResolvedValue({ id: 'h1', title: 'x' }),
  logHabit: vi.fn().mockResolvedValue(undefined),
  createGoal,
  setWeekStartDay: vi.fn().mockResolvedValue(undefined),
  setColorScheme: vi.fn().mockResolvedValue(undefined),
  finishOnboarding: vi.fn().mockResolvedValue(undefined),
}

function renderStep(props: { onCreated: () => void; onSkip: () => void }) {
  return render(
    <OnboardingActionsProvider actions={stubActions} hasProAccess isLive={false}>
      <OnboardingCreateGoal {...props} />
    </OnboardingActionsProvider>,
  )
}

describe('OnboardingCreateGoal', () => {
  const defaultProps = {
    onCreated: vi.fn(),
    onSkip: vi.fn(),
  }

  beforeEach(() => {
    createGoal.mockClear()
    defaultProps.onCreated.mockClear()
    defaultProps.onSkip.mockClear()
  })

  it('renders the title with Pro Optional badge', () => {
    renderStep(defaultProps)
    expect(screen.getByText('onboarding.flow.createGoal.title')).toBeInTheDocument()
    expect(screen.getByText('onboarding.flow.createGoal.proTag')).toBeInTheDocument()
  })

  it('renders suggestion chips', () => {
    renderStep(defaultProps)
    expect(screen.getByText('onboarding.flow.createGoal.suggestions.run')).toBeInTheDocument()
    expect(screen.getByText('onboarding.flow.createGoal.suggestions.books')).toBeInTheDocument()
    expect(screen.getByText('onboarding.flow.createGoal.suggestions.save')).toBeInTheDocument()
  })

  it('fills form when suggestion clicked', () => {
    renderStep(defaultProps)
    fireEvent.click(screen.getByText('onboarding.flow.createGoal.suggestions.run'))
    const targetInput = screen.getByPlaceholderText('onboarding.flow.createGoal.targetPlaceholder')
    expect(targetInput).toHaveValue(100)
  })

  it('disables create button when form is incomplete', () => {
    renderStep(defaultProps)
    const createBtn = screen.getByRole('button', { name: 'onboarding.flow.createGoal.create' })
    expect(createBtn).toBeDisabled()
  })

  it('enables create button when target and unit filled', () => {
    renderStep(defaultProps)
    const targetInput = screen.getByPlaceholderText('onboarding.flow.createGoal.targetPlaceholder')
    const unitInput = screen.getByPlaceholderText('onboarding.flow.createGoal.unitPlaceholder')
    fireEvent.change(targetInput, { target: { value: '50' } })
    fireEvent.change(unitInput, { target: { value: 'km' } })
    const createBtn = screen.getByRole('button', { name: 'onboarding.flow.createGoal.create' })
    expect(createBtn).not.toBeDisabled()
  })

  it('calls onSkip when skip button clicked', () => {
    renderStep(defaultProps)
    fireEvent.click(screen.getByText('onboarding.flow.createGoal.skipStep'))
    expect(defaultProps.onSkip).toHaveBeenCalled()
  })

  it('routes the created goal through the action surface', async () => {
    renderStep(defaultProps)
    const targetInput = screen.getByPlaceholderText('onboarding.flow.createGoal.targetPlaceholder')
    const unitInput = screen.getByPlaceholderText('onboarding.flow.createGoal.unitPlaceholder')
    fireEvent.change(targetInput, { target: { value: '50' } })
    fireEvent.change(unitInput, { target: { value: 'km' } })
    fireEvent.click(screen.getByText('onboarding.flow.createGoal.create'))
    await waitFor(() =>
      expect(createGoal).toHaveBeenCalledWith(
        expect.objectContaining({ targetValue: 50, unit: 'km' }),
      ),
    )
  })
})

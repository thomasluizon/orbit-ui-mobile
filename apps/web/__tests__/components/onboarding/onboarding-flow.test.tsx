import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import {
  OnboardingActionsProvider,
  type OnboardingActions,
} from '@/components/onboarding/onboarding-actions-context'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/components/onboarding/onboarding-welcome', () => ({
  OnboardingWelcome: () => <div data-testid="step-welcome">Welcome</div>,
}))
vi.mock('@/components/onboarding/onboarding-create-habit', () => ({
  OnboardingCreateHabit: ({ onCreated }: { onCreated: (id: string, title: string) => void }) => (
    <button type="button" onClick={() => onCreated('habit-1', 'Read')}>Create</button>
  ),
}))
vi.mock('@/components/onboarding/onboarding-complete', () => ({
  OnboardingComplete: ({ onFinish }: { onFinish: () => void }) => (
    <button type="button" onClick={onFinish}>Finish</button>
  ),
}))

import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'

const finishOnboarding = vi.fn().mockResolvedValue(undefined)
const actions: OnboardingActions = {
  createHabit: vi.fn().mockResolvedValue({ id: 'habit-1', title: 'Read' }),
  createHabitsBulk: vi.fn().mockResolvedValue(undefined),
  logHabit: vi.fn().mockResolvedValue(undefined),
  createGoal: vi.fn().mockResolvedValue(undefined),
  setWeekStartDay: vi.fn().mockResolvedValue(undefined),
  finishOnboarding,
}

function renderFlow() {
  return render(
    <OnboardingActionsProvider actions={actions} hasProAccess isLive>
      <OnboardingFlow />
    </OnboardingActionsProvider>,
  )
}

describe('OnboardingFlow', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    finishOnboarding.mockClear()
  })

  it('keeps only welcome, habit creation, and completion in the flow', () => {
    renderFlow()
    expect(screen.getByTestId('step-welcome')).toBeInTheDocument()

    fireEvent.click(screen.getByText('onboarding.flow.begin'))
    fireEvent.click(screen.getByText('Create'))
    expect(screen.getByText('Finish')).toBeInTheDocument()
  })

  it('skips directly to completion', () => {
    renderFlow()
    fireEvent.click(screen.getByText('onboarding.flow.skip'))
    fireEvent.click(screen.getByText('Finish'))
    expect(finishOnboarding).toHaveBeenCalledTimes(1)
  })

  it('renders three progress positions', () => {
    renderFlow()
    expect(document.getElementById('onboarding-title')).toHaveTextContent(
      'Orbit · 01 / 03',
    )
  })
})

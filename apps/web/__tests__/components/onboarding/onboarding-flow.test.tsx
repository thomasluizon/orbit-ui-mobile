import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`
    return key
  },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ setQueryData: vi.fn() }),
}))

vi.mock('@orbit/shared/query', () => ({
  profileKeys: { detail: () => ['profile'] },
}))

vi.mock('@/hooks/use-profile', () => ({
  useHasProAccess: () => true,
}))

vi.mock('@/app/actions/profile', () => ({
  completeOnboarding: vi.fn().mockResolvedValue({}),
}))

vi.mock('@/components/onboarding/onboarding-welcome', () => ({
  OnboardingWelcome: () => <div data-testid="step-welcome">Welcome</div>,
}))
vi.mock('@/components/onboarding/onboarding-create-habit', () => ({
  OnboardingCreateHabit: ({ onCreated }: { onCreated: (id: string, title: string) => void }) => (
    <div data-testid="step-create-habit">
      <button onClick={() => onCreated('h1', 'Test Habit')}>Create</button>
    </div>
  ),
}))
vi.mock('@/components/onboarding/onboarding-complete-habit', () => ({
  OnboardingCompleteHabit: ({ onCompleted }: { onCompleted: () => void }) => (
    <div data-testid="step-complete-habit">
      <button onClick={onCompleted}>Complete</button>
    </div>
  ),
}))
vi.mock('@/components/onboarding/onboarding-create-goal', () => ({
  OnboardingCreateGoal: ({ onCreated, onSkip }: { onCreated: () => void; onSkip: () => void }) => (
    <div data-testid="step-create-goal">
      <button onClick={onCreated}>Create Goal</button>
      <button onClick={onSkip}>Skip Goal</button>
    </div>
  ),
}))
vi.mock('@/components/onboarding/onboarding-features', () => ({
  OnboardingFeatures: () => <div data-testid="step-features">Features</div>,
}))
vi.mock('@/components/onboarding/onboarding-complete', () => ({
  OnboardingComplete: ({ onFinish }: { onFinish: () => void }) => (
    <div data-testid="step-complete">
      <button onClick={onFinish}>Finish</button>
    </div>
  ),
}))

import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'

describe('OnboardingFlow', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('renders the first step (welcome)', () => {
    render(<OnboardingFlow />)
    expect(screen.getByTestId('step-welcome')).toBeInTheDocument()
  })

  it('shows step counter', () => {
    render(<OnboardingFlow />)
    expect(document.body.textContent).toContain('onboarding.flow.step')
  })

  it('shows skip button', () => {
    render(<OnboardingFlow />)
    expect(screen.getByText('onboarding.flow.skip')).toBeInTheDocument()
  })

  it('shows next button on welcome step', () => {
    render(<OnboardingFlow />)
    expect(screen.getByText('onboarding.flow.next')).toBeInTheDocument()
  })

  it('advances to create habit step on next', () => {
    render(<OnboardingFlow />)
    fireEvent.click(screen.getByText('onboarding.flow.next'))
    expect(screen.getByTestId('step-create-habit')).toBeInTheDocument()
  })

  it('advances through all steps via interactions', () => {
    render(<OnboardingFlow />)
    // Step 0 -> 1: click Next
    fireEvent.click(screen.getByText('onboarding.flow.next'))
    expect(screen.getByTestId('step-create-habit')).toBeInTheDocument()

    // Step 1 -> 2: create habit
    fireEvent.click(screen.getByText('Create'))
    expect(screen.getByTestId('step-complete-habit')).toBeInTheDocument()

    // Step 2 -> 3: complete habit
    fireEvent.click(screen.getByText('Complete'))
    expect(screen.getByTestId('step-create-goal')).toBeInTheDocument()
  })

  it('skips to final step when skip is clicked', () => {
    render(<OnboardingFlow />)
    fireEvent.click(screen.getByText('onboarding.flow.skip'))
    expect(screen.getByTestId('step-complete')).toBeInTheDocument()
  })

  it('renders progress bar', () => {
    render(<OnboardingFlow />)
    const progress = document.querySelector('progress')
    expect(progress).toBeInTheDocument()
  })

  it('renders the onboarding as a fullscreen portal dialog container', () => {
    render(<OnboardingFlow />)
    const dialog = screen.getByRole('dialog')
    expect(dialog.tagName).toBe('DIV')
    expect(dialog).toHaveClass('fixed', 'inset-0', 'w-screen', 'h-dvh')
  })
})

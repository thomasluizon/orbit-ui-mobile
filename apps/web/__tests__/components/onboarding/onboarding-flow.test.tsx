import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const mocks = vi.hoisted(() => ({ routerPush: vi.fn(), setOnboardingHandedOff: vi.fn() }))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`
    return key
  },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.routerPush }),
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

vi.mock('@/stores/ui-store', () => ({
  useUIStore: (
    selector: (state: {
      onboardingHandedOff: boolean
      setOnboardingHandedOff: (handedOff: boolean) => void
    }) => unknown,
  ) =>
    selector({
      onboardingHandedOff: false,
      setOnboardingHandedOff: mocks.setOnboardingHandedOff,
    }),
}))

vi.mock('@/components/onboarding/onboarding-welcome', () => ({
  OnboardingWelcome: () => <div data-testid="step-welcome">Welcome</div>,
}))
vi.mock('@/components/onboarding/onboarding-meet-astra', () => ({
  OnboardingMeetAstra: ({ onImport }: { onImport?: () => void }) => (
    <div data-testid="step-meet-astra">
      Meet Astra
      {onImport && (
        <button type="button" onClick={onImport}>
          onboarding.flow.meetAstra.import
        </button>
      )}
    </div>
  ),
}))
vi.mock('@/components/onboarding/onboarding-template-packs', () => ({
  OnboardingTemplatePacks: ({
    onCreated,
    onCreateOwn,
    onSkip,
  }: {
    onCreated: () => void
    onCreateOwn: () => void
    onSkip: () => void
  }) => (
    <div data-testid="step-template-packs">
      <button onClick={onCreated}>Pack Created</button>
      <button onClick={onCreateOwn}>Create Own</button>
      <button onClick={onSkip}>Skip Packs</button>
    </div>
  ),
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

import { completeOnboarding } from '@/app/actions/profile'
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'

describe('OnboardingFlow', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    mocks.routerPush.mockClear()
    mocks.setOnboardingHandedOff.mockClear()
    vi.mocked(completeOnboarding).mockClear()
    globalThis.localStorage.clear()
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

  it('shows the begin label on the welcome step', () => {
    render(<OnboardingFlow />)
    expect(screen.getByText('onboarding.flow.begin')).toBeInTheDocument()
  })

  it('advances to the meet-astra interstitial first', () => {
    render(<OnboardingFlow />)
    fireEvent.click(screen.getByText('onboarding.flow.begin'))
    expect(screen.getByTestId('step-meet-astra')).toBeInTheDocument()
  })

  it('imports from another app: routes into Astra without completing onboarding', async () => {
    render(<OnboardingFlow />)
    fireEvent.click(screen.getByText('onboarding.flow.begin'))
    fireEvent.click(screen.getByText('onboarding.flow.meetAstra.import'))
    await waitFor(() => expect(mocks.routerPush).toHaveBeenCalledWith('/chat'))
    expect(globalThis.localStorage.getItem('orbit-chat-draft')).toBe(
      'onboarding.flow.meetAstra.importPrompt',
    )
    expect(mocks.setOnboardingHandedOff).toHaveBeenCalledWith(true)
    expect(completeOnboarding).not.toHaveBeenCalled()
  })

  it('advances through the create-my-own branch via interactions', () => {
    render(<OnboardingFlow />)
    fireEvent.click(screen.getByText('onboarding.flow.begin'))
    expect(screen.getByTestId('step-meet-astra')).toBeInTheDocument()

    fireEvent.click(screen.getByText('onboarding.flow.next'))
    expect(screen.getByTestId('step-template-packs')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Create Own'))
    expect(screen.getByTestId('step-create-habit')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Create'))
    expect(screen.getByTestId('step-complete-habit')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Complete'))
    expect(screen.getByTestId('step-create-goal')).toBeInTheDocument()
  })

  it('jumps past the manual habit steps after a pack is created', () => {
    render(<OnboardingFlow />)
    fireEvent.click(screen.getByText('onboarding.flow.begin'))
    fireEvent.click(screen.getByText('onboarding.flow.next'))
    expect(screen.getByTestId('step-template-packs')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Pack Created'))
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
    expect(dialog).toHaveClass('fixed', 'inset-0')
    expect(dialog.className).toMatch(/w-screen/)
    expect(dialog.className).toMatch(/h-dvh/)
  })
})

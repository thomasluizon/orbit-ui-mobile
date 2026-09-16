import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  getOnboardingDisplayStep,
  getOnboardingDisplayTotal,
  getOnboardingNextStep,
  getOnboardingPreviousStep,
  ONBOARDING_COMPLETE_STEP,
  shouldHideOnboardingFooter,
} from '@orbit/shared/utils'
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'

const { actionsMock } = vi.hoisted(() => ({
  actionsMock: {
    finishOnboarding: vi.fn(() => Promise.resolve(undefined)),
  },
}))

vi.mock('expo-router', () => ({
  useRouter: () => ({ replace: vi.fn() }),
}))
vi.mock('@/stores/ui-store', () => ({
  useUIStore: (selector: (state: { astraConversationOpen: boolean }) => unknown) =>
    selector({ astraConversationOpen: false }),
}))
vi.mock('@/components/onboarding/onboarding-actions-context', () => ({
  useOnboardingActions: () => actionsMock,
  useOnboardingIsLive: () => true,
}))
vi.mock('@/components/ui/keyboard-aware-scroll-view', () => ({
  KeyboardAwareScrollView: ({ children }: Readonly<{ children?: React.ReactNode }>) =>
    React.createElement('KeyboardAwareScrollView', null, children),
}))
vi.mock('@/components/onboarding/onboarding-welcome', () => ({
  OnboardingWelcome: () => React.createElement('OnboardingWelcome'),
}))
vi.mock('@/components/onboarding/onboarding-create-habit', () => ({
  OnboardingCreateHabit: () => React.createElement('OnboardingCreateHabit'),
}))
vi.mock('@/components/onboarding/onboarding-complete', () => ({
  OnboardingComplete: () => React.createElement('OnboardingComplete'),
}))

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')

describe('OnboardingFlow', () => {
  it('uses the three-step sequence without a plan-dependent branch', () => {
    expect(getOnboardingDisplayTotal()).toBe(3)
    expect(getOnboardingDisplayStep(0)).toBe(1)
    expect(getOnboardingNextStep(1)).toBe(2)
    expect(getOnboardingPreviousStep(2)).toBe(1)
    expect(shouldHideOnboardingFooter(0)).toBe(false)
    expect(shouldHideOnboardingFooter(1)).toBe(true)
    expect(shouldHideOnboardingFooter(ONBOARDING_COMPLETE_STEP)).toBe(true)
  })

  it('renders the retained welcome entry', async () => {
    let tree!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => {
      tree = TestRenderer.create(<OnboardingFlow />)
    })
    expect(
      tree.root.findAll((node: { type: unknown }) => node.type === 'OnboardingWelcome'),
    ).toHaveLength(1)
    const progressText = tree.root
      .findAll((node: { type: unknown }) => node.type === 'Text')
      .flatMap((node: { props: { children?: unknown } }) => node.props.children)
    expect(progressText).toContain('03')
  })
})
